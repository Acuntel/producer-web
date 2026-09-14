"""Groove MIDI (human drummers) -> data/dna/humanize.json: per style and per
16th-note slot, the median timing offset (ms, signed relative to the grid)
and velocity, plus their IQRs, and a global swing distribution. This is the
"human not perfect" number set docs/DNA_SPEC.md section 3 asks for - the
engine's groove pool copies these instead of adding random jitter.
"""
from __future__ import annotations

import csv
import statistics
import sys
import time
import zipfile
from collections import defaultdict
from pathlib import Path

import mido

sys.path.insert(0, str(Path(__file__).resolve().parent))
import download
from midi_parse import quantize, swing_ratio

RAW = Path(__file__).resolve().parents[2] / "data" / "dna" / "raw"
EXTRACT_DIR = RAW / "groove_extracted"
OUT = Path(__file__).resolve().parents[2] / "data" / "dna" / "humanize.json"


def extract() -> Path | None:
    if EXTRACT_DIR.exists() and any(EXTRACT_DIR.rglob("info.csv")):
        return EXTRACT_DIR
    src = download.ensure("groove")
    if src is None:
        return None
    EXTRACT_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(src) as z:
        z.extractall(EXTRACT_DIR)
    return EXTRACT_DIR


def load_notes(path: Path) -> tuple[list[dict], int]:
    mid = mido.MidiFile(path)
    tpb = mid.ticks_per_beat
    notes = []
    for track in mid.tracks:
        abs_tick = 0
        for msg in track:
            abs_tick += msg.time
            if msg.type == "note_on" and msg.velocity > 0:
                notes.append({"start": abs_tick, "velocity": msg.velocity})
    return notes, tpb


def iqr(xs: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    s = sorted(xs)
    q1 = s[int(len(s) * 0.25)]
    q3 = s[int(len(s) * 0.75)]
    return round(q3 - q1, 2)


def run() -> dict | None:
    t0 = time.time()
    root = extract()
    if root is None:
        print("[groove] SKIPPED: source not downloaded")
        return None

    info_path = next(root.rglob("info.csv"))
    with open(info_path, newline="") as f:
        info_rows = list(csv.DictReader(f))

    # style -> slot(0-15) -> {"offsets": [...], "velocities": [...]}
    by_style: dict[str, dict[int, dict[str, list]]] = defaultdict(
        lambda: defaultdict(lambda: {"offsets": [], "velocities": []}))
    file_counts: dict[str, int] = defaultdict(int)
    all_swing_samples: list[float] = []
    n_files, failed = 0, 0

    for r in info_rows:
        style = r["style"].split("/")[0].strip().lower()
        bpm = float(r["bpm"])
        midi_path = root / "groove" / r["midi_filename"] if not r["midi_filename"].startswith("groove/") else root / r["midi_filename"]
        if not midi_path.exists():
            midi_path = next(root.rglob(Path(r["midi_filename"]).name), None)
        if not midi_path or not midi_path.exists():
            failed += 1
            continue
        try:
            notes, tpb = load_notes(midi_path)
        except Exception:
            failed += 1
            continue
        if not notes:
            failed += 1
            continue
        n_files += 1
        file_counts[style] += 1
        bar_ticks = tpb * 4
        slot_ticks = bar_ticks / 16
        ms_per_tick = (60_000.0 / bpm) / tpb
        for n in notes:
            raw_pos = n["start"] % bar_ticks
            _bar, slot = quantize(n["start"], bar_ticks, 16)
            slot = slot % 16
            deviation_ticks = raw_pos - slot * slot_ticks
            if deviation_ticks > bar_ticks / 2:
                deviation_ticks -= bar_ticks
            by_style[style][slot]["offsets"].append(round(deviation_ticks * ms_per_tick, 2))
            by_style[style][slot]["velocities"].append(n["velocity"])
        sw = swing_ratio([{"start": n["start"], "channel": 0} for n in notes], bar_ticks)
        if sw is not None:
            all_swing_samples.append(sw)

    styles_out = {}
    for style, slots in by_style.items():
        slot_out = {}
        for slot in range(16):
            d = slots.get(slot, {"offsets": [], "velocities": []})
            if not d["offsets"]:
                continue
            slot_out[str(slot)] = {
                "offset_ms_median": round(statistics.median(d["offsets"]), 2),
                "offset_ms_iqr": iqr(d["offsets"]),
                "velocity_median": round(statistics.median(d["velocities"]), 1),
                "velocity_iqr": iqr(d["velocities"]),
                "n": len(d["offsets"]),
            }
        styles_out[style] = {"slots": slot_out, "n_files": file_counts[style]}

    global_swing = None
    if all_swing_samples:
        s = sorted(all_swing_samples)
        pick = lambda p: s[min(int(len(s) * p), len(s) - 1)]
        global_swing = {
            "n": len(s), "p10": round(pick(0.10), 4), "median": round(statistics.median(s), 4),
            "p90": round(pick(0.90), 4),
            "straight_share": round(sum(1 for x in s if 0.45 <= x <= 0.55) / len(s), 4),
            "triplet_share": round(sum(1 for x in s if 0.60 <= x <= 0.72) / len(s), 4),
        }

    out = {"styles": styles_out, "global_swing": global_swing}
    OUT.write_text(__import__("json").dumps(out, indent=1))
    dt = time.time() - t0
    size_kb = OUT.stat().st_size / 1024
    print(f"[groove] {len(info_rows):,} info rows, {n_files:,} MIDI loaded, {failed:,} failed "
          f"-> {len(styles_out)} styles in {dt:.1f}s -> {OUT} ({size_kb:.1f} KB)")
    return out


if __name__ == "__main__":
    run()
