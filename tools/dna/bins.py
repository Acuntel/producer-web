"""Galton-bin pin classification, shared by buckets_rollup.py and hits_rollup.py.
Pin order and rules are docs/DNA_SPEC.md section 3.
"""
from __future__ import annotations

# The pins every audio-measured song can answer come first (tempo, mode, energy, feel, decade, family, voice);
# the ones only a transcription or a chord sheet can answer come last. Prefix bins therefore stay populated.
PIN_ORDER = ["tempo_band", "mode", "energy_band", "feel", "decade", "family", "voice",
             "meter_feel", "structure_archetype", "harmony_class", "hit_tier"]

ENERGY_EDGES = [(0.4, "low"), (0.6, "mid"), (0.8, "high"), (9.0, "peak")]


def energy_band(energy: float | None) -> str:
    if energy is None or energy != energy: return "unknown"
    for hi, label in ENERGY_EDGES:
        if energy < hi: return label
    return "peak"


def feel_quadrant(valence_read: float | None, arousal_read: float | None) -> str:
    """Brady's words: sun (bright and calm), lift (bright and driving), rush (dark and driving), gut (dark and slow)."""
    if valence_read is None or arousal_read is None or valence_read != valence_read or arousal_read != arousal_read: return "unknown"
    bright, driving = valence_read >= 0.5, arousal_read >= 0.5
    return "lift" if bright and driving else "sun" if bright else "rush" if driving else "gut"


def voice_pin(voice: float | None) -> str:
    if voice is None or voice != voice: return "unknown"
    return "vocal" if voice >= 0.5 else "instrumental"

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
        "mode": or_unknown(row.get("mode")),
        "energy_band": energy_band(row.get("energy")),
        "feel": feel_quadrant(row.get("valence_read"), row.get("arousal_read")),
        "decade": or_unknown(row.get("decade")),
        "family": or_unknown(row.get("family")),
        "voice": voice_pin(row.get("voice")),
        "meter_feel": meter_feel(row.get("kick_grid"), row.get("snare_grid")),
        "structure_archetype": structure_archetype(row.get("structure")),
        "harmony_class": or_unknown(row.get("harmony_class")),
        "hit_tier": row.get("hit_tier") or "none",
    }
