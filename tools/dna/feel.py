"""Feel formulas: valence_read, arousal_read, tension_read, warmth_read.
Must stay identical to lib/brain/feel.ts (the TypeScript side, written by the
main session) - same constants as docs/DNA_SPEC.md section 4.

    valence_read = clamp01(0.5 + 0.25*(mode==major) - 0.25*(mode==minor)
                            + 0.20*(valence_prior - 0.5 if known else 0)
                            + 0.10*(tempo in 100..130) - 0.10*(tension_read - 0.5))
    arousal_read = clamp01(0.15 + 0.45*normalize(tempo, 60, 180)
                            + 0.30*(energy_prior if known else 0.5) + 0.10*syncopation)
    tension_read = clamp01(0.30 + 0.25*(mode==minor) + 0.30*normalize(borrowed, 0, 6)
                            + 0.15*(harmony_class in {modal_mixture, other}))
    warmth_read  = clamp01(0.35 + 0.25*(acousticness_prior if known else 0.3)
                            + 0.20*(mode==major) - 0.20*normalize(tempo, 60, 180)
                            + 0.10*(family in {rnb, jazz, folk}))

Honesty rule: a formula is only evaluated when at least one of its non-prior
driving inputs is known (tempo for arousal; mode/borrowed/harmony_class for
tension; mode for valence, which also needs tension_read). Terms whose input
is missing contribute 0 rather than a guessed value - that is the formula's
own "if known else" fallback, not an invented number. If every driving input
for a formula is missing, the field stays null rather than being a constant.
"""
from __future__ import annotations

from util import clamp01, normalize

TENSION_HARMONY = {"modal_mixture", "other"}
WARM_FAMILIES = {"rnb", "jazz", "folk"}


def tension_read(mode: str | None, borrowed: int | None, harmony_class: str | None) -> float | None:
    if mode is None and borrowed is None and harmony_class is None:
        return None
    val = 0.30
    val += 0.25 * (1.0 if mode == "minor" else 0.0)
    norm_borrowed = normalize(borrowed, 0, 6)
    val += 0.30 * (norm_borrowed if norm_borrowed is not None else 0.0)
    val += 0.15 * (1.0 if harmony_class in TENSION_HARMONY else 0.0)
    return round(clamp01(val), 4)


def valence_read(mode: str | None, valence_prior: float | None, tempo: float | None,
                  tension: float | None) -> float | None:
    if mode is None and valence_prior is None:
        return None
    val = 0.5
    val += 0.25 * (1.0 if mode == "major" else 0.0)
    val -= 0.25 * (1.0 if mode == "minor" else 0.0)
    val += 0.20 * ((valence_prior - 0.5) if valence_prior is not None else 0.0)
    val += 0.10 * (1.0 if tempo is not None and 100 <= tempo <= 130 else 0.0)
    val -= 0.10 * ((tension - 0.5) if tension is not None else 0.0)
    return round(clamp01(val), 4)


def arousal_read(tempo: float | None, energy_prior: float | None, syncopation: float | None) -> float | None:
    if tempo is None:
        return None
    val = 0.15
    val += 0.45 * (normalize(tempo, 60, 180) or 0.0)
    val += 0.30 * (energy_prior if energy_prior is not None else 0.5)
    val += 0.10 * (syncopation if syncopation is not None else 0.0)
    return round(clamp01(val), 4)


def warmth_read(acousticness_prior: float | None, mode: str | None, tempo: float | None,
                 family: str | None) -> float | None:
    if acousticness_prior is None and mode is None and tempo is None and family is None:
        return None
    val = 0.35
    val += 0.25 * (acousticness_prior if acousticness_prior is not None else 0.3)
    val += 0.20 * (1.0 if mode == "major" else 0.0)
    norm_tempo = normalize(tempo, 60, 180)
    val -= 0.20 * (norm_tempo if norm_tempo is not None else 0.0)
    val += 0.10 * (1.0 if family in WARM_FAMILIES else 0.0)
    return round(clamp01(val), 4)


def compute_feel(row: dict) -> dict:
    """row must have: mode, borrowed, harmony_class, valence (prior), tempo,
    energy (prior), syncopation, acousticness (prior), family."""
    tension = tension_read(row.get("mode"), row.get("borrowed"), row.get("harmony_class"))
    valence = valence_read(row.get("mode"), row.get("valence"), row.get("tempo"), tension)
    arousal = arousal_read(row.get("tempo"), row.get("energy"), row.get("syncopation"))
    warmth = warmth_read(row.get("acousticness"), row.get("mode"), row.get("tempo"), row.get("family"))
    return {"valence_read": valence, "arousal_read": arousal,
            "tension_read": tension, "warmth_read": warmth}
