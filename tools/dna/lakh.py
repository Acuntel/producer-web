"""Lakh MIDI dataset (clean_midi, ~17k files, "Artist/Song.mid") -> DNA rows.
Multiprocessing Pool(8) since mido parsing 17k files is CPU-bound per file.

Grid-dependent fields (kick/snare/hat/bass_rhythm/syncopation/swing, and the
repetition-based structure guess) require a stable tempo: 1-3 tempo-change
events. Files with 0 or >3 tempo changes are still counted and still produce
every other field (tempo itself, key, melody contour/interval/range/
repetition, all tick-based and tempo-stability-independent) - only the
grid/structure fields go null for them, per docs/DNA_SPEC.md section 6.
"""
from __future__ import annotations

import sys
import tarfile
import time
from multiprocessing import Pool
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import download
import feel
import melody
import midi_parse
import schema
import util

RAW = Path(__file__).resolve().parents[2] / "data" / "dna" / "raw"
EXTRACT_DIR = RAW / "lakh_extracted"
OUT = RAW / "lakh_songs.parquet"
WORKERS = 8


def extract() -> Path | None:
    if EXTRACT_DIR.exists() and any(EXTRACT_DIR.rglob("*.mid")):
        return EXTRACT_DIR
    src = download.ensure("lakh")
    if src is None:
        return None
    EXTRACT_DIR.mkdir(parents=True, exist_ok=True)
    with tarfile.open(src) as t:
        t.extractall(EXTRACT_DIR, filter="data")
    return EXTRACT_DIR


def artist_title_from_path(path: Path, root: Path) -> tuple[str, str]:
    rel = path.relative_to(root)
    artist = rel.parts[-2] if len(rel.parts) >= 2 else "unknown"
    title = path.stem
    parts = title.rsplit(".", 1)
    if len(parts) == 2 and parts[1].isdigit():
        title = parts[0]
    return artist, title


def n_tempo_changes(tempo_events: list[tuple[int, int]]) -> int:
    if not tempo_events:
        return 0
    changes = 1
    for (_t1, u1), (_t2, u2) in zip(tempo_events, tempo_events[1:]):
        if u2 != u1:
            changes += 1
    return changes


def process_one(args: tuple[str, str]) -> dict | None:
    path_str, root_str = args
    path, root = Path(path_str), Path(root_str)
    try:
        d = midi_parse.load(path)
    except Exception:
        return None
    notes = d["notes"]
    if not notes:
        return None
    tpb, tempo_events, time_sig = d["tpb"], d["tempo_events"], d["time_sig"]
    bar_ticks = tpb * time_sig
    last_tick = max(n["end"] for n in notes)

    changes = n_tempo_changes(tempo_events)
    grid_eligible = 1 <= changes <= 3
    bpm = midi_parse.dominant_tempo_bpm(tempo_events, last_tick) if tempo_events else 120.0
    tempo = util.fold_tempo(bpm)
    duration_sec = midi_parse.duration_seconds(tempo_events, tpb, last_tick) if tempo_events else None

    non_drum = [n for n in notes if n["channel"] != 9]
    drum_notes = [n for n in notes if n["channel"] == 9]
    key_pc, mode = midi_parse.key_from_notes(non_drum)
    melody_ch, bass_ch = midi_parse.pick_melody_bass(notes)

    kick = snare = hat = bass_rhythm = None
    syncopation = swing = None
    structure = None
    first_chorus_bar = chorus_share = None
    if grid_eligible:
        kick, snare, hat, syncopation = midi_parse.drum_grids(notes, bar_ticks)
        bass_rhythm = midi_parse.bass_rhythm_grid(notes, bass_ch, bar_ticks)
        swing = midi_parse.swing_ratio(notes, bar_ticks)
        structure, first_chorus_bar, chorus_share = melody.structure_from_repetition(notes, bar_ticks, drum_notes)

    contour = interval_mean = range_semis = repetition = None
    if melody_ch is not None:
        contour = melody.melody_contour(notes, bar_ticks, melody_ch)
        interval_mean, range_semis = melody.interval_and_range(notes, melody_ch)
        repetition = melody.repetition_ratio(notes, bar_ticks, melody_ch)

    artist, title = artist_title_from_path(path, root)
    artist_norm, title_norm = util.norm_artist(artist), util.norm_title(title)

    row = schema.empty_row()
    row.update({
        "id": util.stable_id("lakh", artist_norm, title_norm),
        "source": "lakh", "title": title, "artist": artist,
        "artist_norm": artist_norm, "title_norm": title_norm,
        "join_key": f"{artist_norm}|{title_norm}",
        "tempo": tempo, "key_pc": key_pc, "mode": mode, "time_sig": time_sig,
        "duration_sec": duration_sec, "hit_tier": "none",
        "structure": structure, "section_count": len(structure.split()) if structure else None,
        "first_chorus_bar": first_chorus_bar, "chorus_share": chorus_share,
        "kick_grid": kick, "snare_grid": snare, "hat_grid": hat, "bass_rhythm": bass_rhythm,
        "syncopation": syncopation, "swing": swing,
        "melody_contour": contour, "interval_mean": interval_mean,
        "range_semis": range_semis, "repetition": repetition,
    })
    feels = feel.compute_feel({
        "mode": mode, "borrowed": None, "harmony_class": None, "valence": None,
        "tempo": tempo, "energy": None, "syncopation": syncopation,
        "acousticness": None, "family": None,
    })
    row.update(feels)
    return row


def run():
    t0 = time.time()
    root = extract()
    if root is None:
        print("[lakh] SKIPPED: source not downloaded")
        return None

    files = sorted(root.rglob("*.mid"))
    print(f"[lakh] {len(files):,} MIDI files, parsing with {WORKERS} workers...")
    args = [(str(f), str(root)) for f in files]

    rows, failed = [], 0
    with Pool(WORKERS) as pool:
        for i, result in enumerate(pool.imap_unordered(process_one, args, chunksize=32), 1):
            if result is None:
                failed += 1
            else:
                rows.append(result)
            if i % 2000 == 0:
                print(f"[lakh] {i:,}/{len(files):,} done ({time.time() - t0:.0f}s elapsed)", flush=True)

    grid_eligible_n = sum(1 for r in rows if r["kick_grid"] is not None)
    out = schema.to_frame(rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_parquet(OUT, index=False)
    dt = time.time() - t0
    print(f"[lakh] {len(files):,} files, {failed:,} failed/empty -> {len(out):,} songs "
          f"({grid_eligible_n:,} with grid-eligible tempo) in {dt:.1f}s -> {OUT}")
    return out


if __name__ == "__main__":
    run()
