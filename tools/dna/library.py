"""Brady's own DJ library (data/library/*.json, ~500 measured tracks from
lib/ears) -> DNA rows. This source has no MIDI, so kick/snare/hat/bass_rhythm/
syncopation/swing/melody_contour/interval_mean/range_semis/repetition stay
null (spec scopes those to MIDI/groove sources). It also has no Spotify audio-
features model, so energy/danceability/valence/loudness/acousticness/
speechiness/instrumentalness/popularity stay null too - the library's own
LUFS reading is a different measurement methodology than Spotify's algorithmic
"loudness" feature and is not substituted in, per "never invent a number".
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import families
import feel
import harmony
import schema
import util

LIB_DIR = Path(__file__).resolve().parents[2] / "data" / "library"
OUT = Path(__file__).resolve().parents[2] / "data" / "dna" / "raw" / "library_songs.parquet"

CHORUS_LABELS = {"chorus", "drop", "hook"}


def tonic_to_pc(tonic: str | None) -> int | None:
    if not tonic:
        return None
    c = harmony.parse_chord(str(tonic) + "maj")
    return c["root_pc"] if c else None


def build_progression(chord_tokens: list[str]) -> tuple[str, int | None, str | None, int, int]:
    chords = [c for c in (harmony.parse_chord(t) for t in chord_tokens) if c]
    if not chords:
        return "", None, None, 0, 0
    key_pc, mode = harmony.detect_key(chords)
    roman = [harmony.to_roman(c["root_pc"], c["quality"], key_pc) for c in chords]
    prog = harmony.collapse_runs(roman)
    vocab, borrowed = harmony.chord_vocab_and_borrowed(chords, key_pc, mode)
    return prog, key_pc, mode, vocab, borrowed


def run() -> pd.DataFrame | None:
    t0 = time.time()
    files = sorted(LIB_DIR.glob("*.json"))
    if not files:
        print("[library] SKIPPED: no files under data/library/")
        return None

    rows, skipped = [], 0
    for fp in files:
        try:
            d = json.loads(fp.read_text())
        except Exception:
            skipped += 1
            continue
        facts = d.get("facts") or {}
        id3 = d.get("id3") or {}
        title = id3.get("title") or d.get("name")
        artist = id3.get("artist")
        if not title:
            skipped += 1
            continue
        artist_norm = util.norm_artist(artist)
        title_norm = util.norm_title(title)

        key = facts.get("key") or {}
        tempo_raw = (facts.get("tempo") or {}).get("bpm")
        tempo = util.fold_tempo(tempo_raw) if tempo_raw else None
        mode = key.get("mode") if key.get("mode") in ("major", "minor") else None
        key_pc = tonic_to_pc(key.get("tonic"))

        genres = [g for g in (d.get("bucket"), d.get("group"), d.get("tier")) if g]
        family = families.family_from_genres(genres)
        lane = families.derive_lane(family, tempo)

        chords = (facts.get("chords") or {}).get("progression") or []
        prog, det_key_pc, det_mode, vocab, borrowed = build_progression(chords)
        h_class = harmony.harmony_class(prog) if prog else None

        structure = facts.get("structure") or {}
        sections = structure.get("sections") or []
        codes = [harmony.section_code(s.get("label", "")) for s in sections]
        structure_str = " ".join(codes) if codes else None
        section_count = len(sections) if sections else None
        duration_total = facts.get("duration") or d.get("durationSec")
        bars_total = structure.get("barsTotal")

        first_chorus_bar = None
        chorus_share = None
        chorus_progression = None
        if sections and duration_total:
            chorus_secs = [s for s in sections
                            if str(s.get("label", "")).lower() in CHORUS_LABELS]
            if chorus_secs:
                first = min(chorus_secs, key=lambda s: s.get("start", 0))
                if bars_total:
                    first_chorus_bar = round((first.get("start", 0) / duration_total) * bars_total)
                total_chorus_dur = sum(s.get("end", 0) - s.get("start", 0) for s in chorus_secs)
                chorus_share = round(total_chorus_dur / duration_total, 4)
                c_prog, _, _, _, _ = build_progression(first.get("chords") or [])
                chorus_progression = c_prog or None

        row = schema.empty_row()
        row.update({
            "id": util.stable_id("library", artist_norm, title_norm),
            "source": "library", "title": title, "artist": artist,
            "artist_norm": artist_norm, "title_norm": title_norm,
            "join_key": f"{artist_norm}|{title_norm}",
            "genres": genres or None, "family": family, "lane": lane,
            "tempo": tempo, "key_pc": key_pc if key_pc is not None else det_key_pc,
            "mode": mode or det_mode,
            "duration_sec": float(duration_total) if duration_total else None,
            "hit_tier": "none",
            "structure": structure_str, "section_count": section_count,
            "first_chorus_bar": first_chorus_bar, "chorus_share": chorus_share,
            "progression": prog or None, "chorus_progression": chorus_progression,
            "harmony_class": h_class, "chord_vocab": vocab or None,
            "borrowed": borrowed if prog else None,
        })
        feels = feel.compute_feel({
            "mode": row["mode"], "borrowed": row["borrowed"], "harmony_class": h_class,
            "valence": None, "tempo": tempo, "energy": None, "syncopation": None,
            "acousticness": None, "family": family,
        })
        row.update(feels)
        rows.append(row)

    out = schema.to_frame(rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    util.write_parquet(out, OUT)
    dt = time.time() - t0
    print(f"[library] {len(files):,} files, {skipped} skipped -> {len(out):,} songs in {dt:.1f}s -> {OUT}")
    return out


if __name__ == "__main__":
    run()
