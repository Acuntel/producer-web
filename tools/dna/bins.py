"""Galton-bin pin classification, shared by buckets_rollup.py and hits_rollup.py.
Pin order and rules are docs/DNA_SPEC.md section 3.
"""
from __future__ import annotations

PIN_ORDER = ["tempo_band", "meter_feel", "mode", "decade", "family",
             "structure_archetype", "harmony_class", "hit_tier"]

_TEMPO_BANDS = [
    ("<90", None, 90), ("90-110", 90, 110), ("110-122", 110, 122),
    ("122-132", 122, 132), ("132-145", 132, 145), ("145-160", 145, 160),
    (">160", 160, None),
]


def tempo_band(tempo: float | None) -> str:
    if tempo is None or tempo != tempo:
        return "unknown"
    for label, lo, hi in _TEMPO_BANDS:
        if lo is not None and tempo < lo:
            continue
        if hi is not None and tempo >= hi:
            continue
        return label
    return "unknown"


def meter_feel(kick_grid: str | None, snare_grid: str | None) -> str:
    if not kick_grid or not snare_grid or len(kick_grid) != 16 or len(snare_grid) != 16:
        return "unknown"
    beats = (0, 4, 8, 12)
    kick_all_beats = all(kick_grid[i] == "X" for i in beats)
    if kick_all_beats:
        return "four_floor"
    snare_2_4 = snare_grid[4] == "X" and snare_grid[12] == "X"
    if snare_2_4:
        return "backbeat"
    snare_3_only = snare_grid[8] == "X" and snare_grid[4] != "X" and snare_grid[12] != "X"
    if snare_3_only:
        return "halftime"
    return "broken"


def structure_archetype(structure: str | None) -> str:
    if not structure:
        return "unknown"
    codes = structure.split()
    distinct = set(codes)
    if "U" in distinct or "D" in distinct:
        return "build_drop"
    if "V" in distinct and "C" in distinct:
        return "verse_chorus"
    if len(distinct) <= 2:
        return "loop"
    if len(distinct) >= 4 and "C" not in distinct:
        return "through"
    return "loop"  # 3 distinct types, no chorus/build/drop: closest defined archetype


def or_unknown(v) -> str:
    if v is None or (isinstance(v, float) and v != v):
        return "unknown"
    return str(v)


def compute_pins(row: dict) -> dict:
    return {
        "tempo_band": tempo_band(row.get("tempo")),
        "meter_feel": meter_feel(row.get("kick_grid"), row.get("snare_grid")),
        "mode": or_unknown(row.get("mode")),
        "decade": or_unknown(row.get("decade")),
        "family": or_unknown(row.get("family")),
        "structure_archetype": structure_archetype(row.get("structure")),
        "harmony_class": or_unknown(row.get("harmony_class")),
        "hit_tier": row.get("hit_tier") or "none",
    }
