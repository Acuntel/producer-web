"""Chord parsing, key detection, Roman-numeral conversion, harmony_class
classification, and section-label folding. Shared by chordonomicon.py,
mcgill.py, and lakh.py (structure only, lakh has no chords).
"""
from __future__ import annotations

import re
from collections import Counter

LETTER_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
PC_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
DEGREES = ["I", "bII", "II", "bIII", "III", "IV", "bV", "V", "bVI", "VI", "bVII", "VII"]
MAJOR_DIATONIC = {0, 2, 4, 5, 7, 9, 11}
MINOR_DIATONIC = {0, 2, 3, 5, 7, 8, 10}
MINOR_QUALITIES = {"min", "min7", "dim"}

_NON_CHORD = {"n", "nc", "x", "no chord"}


def classify_quality(rest: str) -> str:
    """Tolerant chord-quality classifier. rest is everything after root+accidental,
    lowercased. Checked most-specific first so e.g. 'maj7' doesn't fall into 'maj'."""
    r = rest.lower()
    if r.startswith(("maj7", "major7")):
        return "maj7"
    if r in ("", "maj", "major"):
        return "maj"
    if r.startswith(("dim7", "hdim7", "m7b5", "min7b5")):
        return "dim"  # half-diminished folded into dim: diminished-5th family
    if r in ("dim", "o", "deg"):
        return "dim"
    if r.startswith(("min7", "m7")):
        return "min7"
    if r.startswith(("min", "m")):
        return "min"
    if r.startswith(("aug", "+")):
        return "aug"
    if r.startswith("sus"):
        return "sus"
    if r.startswith("7"):
        return "dom7"
    if r.startswith(("9", "11", "13", "6", "add")):
        return "other"
    return "other"


def parse_chord(token: str) -> dict | None:
    """Parse one chord token -> {root_pc, quality, raw}. None for section markers,
    'N'/no-chord tokens, or anything that doesn't start with a note letter.
    Handles chordonomicon's 's' = sharp and slash-bass chords (bass is dropped;
    only the sounding root/quality matters for the DNA record).

    'a' char parse, not regex: root letter, then an optional accidental. 's' is
    only treated as the sharp accidental when it is NOT the start of 'sus' (e.g.
    'Cs' -> C#, 'Csmin' -> C#min, but 'Csus4' stays C with a sus quality) -
    otherwise every sus chord on G/C/D/A/E would get mis-read as sharped."""
    if not token:
        return None
    t = token.strip()
    if not t or t.startswith("<") or t.lower() in _NON_CHORD:
        return None
    letter = t[0].upper()
    if letter not in LETTER_PC:
        return None
    rest = t[1:]
    pc = LETTER_PC[letter]
    if rest.startswith("#"):
        pc = (pc + 1) % 12
        rest = rest[1:]
    elif rest.startswith("b"):
        pc = (pc - 1) % 12
        rest = rest[1:]
    elif rest.startswith("s") and not rest.lower().startswith("sus"):
        pc = (pc + 1) % 12
        rest = rest[1:]
    if "/" in rest:
        rest = rest.split("/", 1)[0]
    quality = classify_quality(rest)
    return {"root_pc": pc, "quality": quality, "raw": t}


# Krumhansl-Schmuckler key profiles
KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]


def detect_key(chords: list[dict]) -> tuple[int | None, str | None]:
    """Pitch-class histogram over chord roots + thirds, correlated against the 24
    Krumhansl profiles (12 major rotations, 12 minor rotations). Returns
    (key_pc, mode) or (None, None) if there are no chords.

    The raw histogram alone cannot break ties between relative major/minor
    rotations of the same chord set (C-G-Am-F and Am-F-C-G contain identical
    chords, just reordered, so they hash to the same vector). We add a small
    tonic-prominence bonus to the first and last chord's root, since songs
    disproportionately start or cadence on the tonic - a standard, simple
    tie-breaker for chord-only key detection."""
    if not chords:
        return None, None
    hist = [0.0] * 12
    for c in chords:
        root = c["root_pc"]
        hist[root] += 2.0
        if c["quality"] in MINOR_QUALITIES:
            third = (root + 3) % 12
        elif c["quality"] in ("aug",):
            third = (root + 4) % 12
        elif c["quality"] in ("sus", "other"):
            third = None
        else:
            third = (root + 4) % 12
        if third is not None:
            hist[third] += 1.0
    hist[chords[0]["root_pc"]] += 1.5
    hist[chords[-1]["root_pc"]] += 1.5
    best_score, best_pc, best_mode = None, None, None
    for pc in range(12):
        for mode, profile in (("major", KS_MAJOR), ("minor", KS_MINOR)):
            rotated = profile[-pc:] + profile[:-pc] if pc else profile
            score = sum(h * p for h, p in zip(hist, rotated))
            if best_score is None or score > best_score:
                best_score, best_pc, best_mode = score, pc, mode
    return best_pc, best_mode


def to_roman(root_pc: int, quality: str, key_pc: int) -> str:
    degree = (root_pc - key_pc) % 12
    sym = DEGREES[degree]
    return sym.lower() if quality in MINOR_QUALITIES else sym


def collapse_runs(symbols: list[str], max_len: int = 24) -> str:
    out: list[str] = []
    for s in symbols:
        if not out or out[-1] != s:
            out.append(s)
    return " ".join(out[:max_len])


# canonical progressions (each entry: name -> the 4-chord cycle in scale-degree form)
_FAMILY_CYCLES = {
    "axis": ["I", "V", "vi", "IV"],
    "minor_axis": ["i", "bVI", "bIII", "bVII"],
    "doo_wop": ["I", "vi", "IV", "V"],
    "andalusian": ["i", "bVII", "bVI", "V"],
}


def _rotations(cycle: list[str]) -> list[list[str]]:
    return [cycle[i:] + cycle[:i] for i in range(len(cycle))]


def _cyclic_contains(seq: list[str], cycle: list[str]) -> bool:
    """True if seq (a collapsed progression, already deduped run-to-run) contains
    one full rotation of cycle as a contiguous subsequence, wrapping seq itself
    once to catch progressions that start mid-cycle."""
    n = len(cycle)
    if len(seq) < n:
        return False
    doubled = seq + seq[: n - 1]
    for rot in _rotations(cycle):
        for i in range(len(doubled) - n + 1):
            if doubled[i:i + n] == rot:
                return True
    return False


def harmony_class(progression: str) -> str:
    """Classify a condensed Roman-numeral progression string. Rule, in order:
    1. one distinct chord -> one_chord
    2. two distinct chords -> two_chord
    3. distinct-chord set is exactly {I, IV, V} (major blues changes) -> blues
    4. contains a full rotation of I-V-vi-IV -> axis
    5. contains a full rotation of i-bVI-bIII-bVII -> minor_axis
    6. contains a full rotation of I-vi-IV-V -> doo_wop
    7. contains a full rotation of i-bVII-bVI-V -> andalusian
    8. has a flat-degree numeral mixed with 3+ distinct chords -> modal_mixture
       (a borrowed-scale-degree chord alongside enough harmonic motion to be a
       real progression, not just noise)
    9. otherwise -> other
    """
    seq = progression.split()
    distinct = list(dict.fromkeys(seq))
    if len(distinct) == 1:
        return "one_chord"
    if len(distinct) == 2:
        return "two_chord"
    if set(distinct) == {"I", "IV", "V"}:
        return "blues"
    if _cyclic_contains(seq, _FAMILY_CYCLES["axis"]):
        return "axis"
    if _cyclic_contains(seq, _FAMILY_CYCLES["minor_axis"]):
        return "minor_axis"
    if _cyclic_contains(seq, _FAMILY_CYCLES["doo_wop"]):
        return "doo_wop"
    if _cyclic_contains(seq, _FAMILY_CYCLES["andalusian"]):
        return "andalusian"
    if any(s.startswith("b") for s in distinct) and len(distinct) >= 3:
        return "modal_mixture"
    return "other"


def chord_vocab_and_borrowed(chords: list[dict], key_pc: int | None, mode: str | None) -> tuple[int, int]:
    """distinct (root_pc, quality) count, and how many of those distinct chords
    sit on a non-diatonic scale degree of the detected key."""
    if not chords:
        return 0, 0
    distinct = {(c["root_pc"], c["quality"]) for c in chords}
    vocab = len(distinct)
    if key_pc is None:
        return vocab, 0
    diatonic = MINOR_DIATONIC if mode == "minor" else MAJOR_DIATONIC
    borrowed = sum(1 for root, _q in distinct if (root - key_pc) % 12 not in diatonic)
    return vocab, borrowed


# Section-label folding: chordonomicon markers like <verse_1>, mcgill SALAMI
# labels like "verse", "chorus_2" -> single-letter structure codes.
_SECTION_MAP = [
    ("intro", "I"), ("pre-chorus", "P"), ("prechorus", "P"), ("pre_chorus", "P"),
    ("chorus", "C"), ("verse", "V"), ("bridge", "B"), ("solo", "S"),
    ("drop", "D"), ("breakdown", "K"), ("break", "K"), ("buildup", "U"),
    ("build", "U"), ("outro", "O"), ("fade", "O"), ("hook", "C"), ("refrain", "C"),
]


def section_code(raw_label: str) -> str:
    r = (raw_label or "").strip().lower().strip("<>").rstrip("0123456789_ ")
    for key, code in _SECTION_MAP:
        if key in r:
            return code
    return "X"
