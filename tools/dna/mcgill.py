"""McGill Billboard SALAMI chord sheets -> DNA rows. Real bar-level chord
grids ("| A:min | A:min | C:maj |"), so first_chorus_bar/chorus_share here are
true bar indices (unlike chordonomicon's token-position proxy). Header lines:
'# title:', '# artist:', '# metre:', '# tonic:'. If the download fails twice,
download.ensure already returned None and this script reports the skip.
"""
from __future__ import annotations

import re
import sys
import tarfile
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import download
import feel
import harmony
import schema
import util

RAW = Path(__file__).resolve().parents[2] / "data" / "dna" / "raw"
EXTRACT_DIR = RAW / "mcgill_extracted"
OUT = RAW / "mcgill_songs.parquet"

HEADER_RE = re.compile(r"^#\s*(title|artist|metre|tonic)\s*:\s*(.*)$", re.IGNORECASE)
LABEL_RE = re.compile(r"^([A-Za-z][A-Za-z0-9']*)\s*,\s*([^,|]*)?,?\s*\|(.*)\|")
BARE_BARS_RE = re.compile(r"^\|(.*)\|")
CHORUS_CODES = {"C", "D"}


def extract() -> Path | None:
    if EXTRACT_DIR.exists() and any(EXTRACT_DIR.rglob("salami_chords.txt")):
        return EXTRACT_DIR
    src = download.ensure("mcgill")
    if src is None:
        return None
    EXTRACT_DIR.mkdir(parents=True, exist_ok=True)
    with tarfile.open(src) as t:
        t.extractall(EXTRACT_DIR, filter="data")
    return EXTRACT_DIR


def parse_bars(bar_text: str, last_chord: dict | None) -> tuple[list[dict], dict | None]:
    chords = []
    for bar in bar_text.split("|"):
        bar = bar.strip()
        if not bar:
            continue
        for tok in bar.split():
            if tok in (".",):
                if last_chord:
                    chords.append(last_chord)
                continue
            c = harmony.parse_chord(tok.replace(":", ""))
            if c:
                chords.append(c)
                last_chord = c
    return chords, last_chord


def parse_file(path: Path) -> dict | None:
    lines = path.read_text(errors="replace").splitlines()
    meta = {}
    sections: list[tuple[str, list[dict]]] = []
    current_code, current_chords = "X", []
    last_time, last_chord = None, None

    for line in lines:
        if line.startswith("#"):
            m = HEADER_RE.match(line)
            if m:
                meta[m.group(1).lower()] = m.group(2).strip()
            continue
        if "\t" not in line:
            continue
        ts_str, rest = line.split("\t", 1)
        try:
            ts = float(ts_str)
        except ValueError:
            continue
        rest = rest.strip()
        if rest in ("silence", "end") or not rest:
            last_time = ts
            continue
        m = LABEL_RE.match(rest)
        if m:
            letter, tag, bar_text = m.groups()
            if current_chords:
                sections.append((current_code, current_chords))
            current_code = harmony.section_code(tag) if tag else harmony.section_code(letter)
            current_chords = []
            chords, last_chord = parse_bars(bar_text, last_chord)
            current_chords.extend(chords)
        else:
            m2 = BARE_BARS_RE.match(rest)
            if m2:
                chords, last_chord = parse_bars(m2.group(1), last_chord)
                current_chords.extend(chords)
        last_time = ts
    if current_chords:
        sections.append((current_code, current_chords))

    all_chords = [c for _code, cs in sections for c in cs]
    if not all_chords:
        return None

    title, artist = meta.get("title"), meta.get("artist")
    artist_norm = util.norm_artist(artist) if artist else None
    title_norm = util.norm_title(title) if title else None
    key_pc, mode = harmony.detect_key(all_chords)
    roman = [harmony.to_roman(c["root_pc"], c["quality"], key_pc) for c in all_chords]
    progression = harmony.collapse_runs(roman)
    h_class = harmony.harmony_class(progression)
    vocab, borrowed = harmony.chord_vocab_and_borrowed(all_chords, key_pc, mode)

    structure = " ".join(code for code, _ in sections)
    bar_total = sum(len(cs) for _c, cs in sections)
    running, first_chorus_bar, chorus_bars, chorus_prog = 0, None, 0, None
    for code, cs in sections:
        if code in CHORUS_CODES:
            chorus_bars += len(cs)
            if first_chorus_bar is None:
                first_chorus_bar = running
                cp_roman = [harmony.to_roman(c["root_pc"], c["quality"], key_pc) for c in cs]
                chorus_prog = harmony.collapse_runs(cp_roman)
        running += len(cs)
    chorus_share = round(chorus_bars / bar_total, 4) if bar_total else None

    metre = meta.get("metre", "")
    time_sig = int(metre.split("/")[0]) if metre and metre.split("/")[0].strip().isdigit() else None

    row = schema.empty_row()
    row.update({
        "id": util.stable_id("mcgill", artist_norm or "unknown", title_norm or path.parent.name),
        "source": "mcgill", "title": title, "artist": artist,
        "artist_norm": artist_norm, "title_norm": title_norm,
        "join_key": f"{artist_norm}|{title_norm}" if artist_norm and title_norm else None,
        "time_sig": time_sig, "duration_sec": last_time,
        "key_pc": key_pc, "mode": mode, "hit_tier": "none",
        "structure": structure or None, "section_count": len(sections) or None,
        "first_chorus_bar": first_chorus_bar, "chorus_share": chorus_share,
        "progression": progression or None, "chorus_progression": chorus_prog,
        "harmony_class": h_class, "chord_vocab": vocab or None, "borrowed": borrowed,
    })
    feels = feel.compute_feel({
        "mode": mode, "borrowed": borrowed, "harmony_class": h_class,
        "valence": None, "tempo": None, "energy": None, "syncopation": None,
        "acousticness": None, "family": None,
    })
    row.update(feels)
    return row


def run() -> pd.DataFrame | None:
    t0 = time.time()
    root = extract()
    if root is None:
        print("[mcgill] SKIPPED: source not downloaded")
        return None

    files = sorted(root.rglob("salami_chords.txt"))
    rows, failed = [], 0
    for fp in files:
        try:
            row = parse_file(fp)
        except Exception as e:
            row = None
            print(f"[mcgill] parse error {fp}: {e}")
        if row is None:
            failed += 1
            continue
        rows.append(row)

    out = schema.to_frame(rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    util.write_parquet(out, OUT)
    dt = time.time() - t0
    print(f"[mcgill] {len(files):,} files, {failed} failed/empty -> {len(out):,} songs in {dt:.1f}s -> {OUT}")
    return out


if __name__ == "__main__":
    run()
