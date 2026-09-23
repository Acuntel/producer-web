"""The worker's tempo, proven on audio whose tempo is known. Synthetic drums at known tempos and phases (a
four on the floor, a broken hip hop pocket, a drum and bass break), silence and noise that must be refused,
and the DJ-tagged fixtures in tests/fixtures when they are on this machine.

    python worker/tempo_check.py            # synthetic and fixtures
    python worker/tempo_check.py --quick    # synthetic only

Exit 0 when every assertion holds. Needs numpy and librosa (the worker's requirements)."""
from __future__ import annotations
import glob, os, re, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analysis  # noqa: E402

SR = 22050
rng = np.random.default_rng(7)


def hit(y: np.ndarray, at: float, kind: str) -> None:
    a = int(at * SR)
    if a >= len(y): return
    if kind == "kick":
        n = int(0.18 * SR); t = np.arange(n) / SR
        wave = np.sin(2 * np.pi * (50 + 110 * np.exp(-t * 30)) * t) * np.exp(-t * 18)
    elif kind == "snare":
        n = int(0.14 * SR); t = np.arange(n) / SR
        wave = (rng.standard_normal(n) * 0.6 + np.sin(2 * np.pi * 190 * t) * 0.4) * np.exp(-t * 28)
    else:
        # A hat is high: white noise differentiated twice (about +12 dB per octave), so its energy sits above 5 kHz like a real one.
        n = int(0.04 * SR); t = np.arange(n) / SR
        noise = np.diff(rng.standard_normal(n + 2), 2); noise /= np.max(np.abs(noise)) + 1e-9
        wave = noise * np.exp(-t * 120) * 0.35
    b = min(len(y), a + len(wave)); y[a:b] += wave[: b - a]


def drums(bpm: float, pattern: str, seconds: float = 60.0, offset: float = 0.0) -> np.ndarray:
    """One bar of sixteenths per pattern row: K kick, S snare, h hat; tiled from `offset` for `seconds`."""
    y = np.zeros(int(seconds * SR), dtype=np.float32)
    step = 60.0 / bpm / 4
    rows = pattern.split("|")
    bar = 0
    while offset + bar * 16 * step < seconds:
        for row in rows:
            for i, ch in enumerate(row):
                if ch == "K": hit(y, offset + (bar * 16 + i) * step, "kick")
                elif ch == "S": hit(y, offset + (bar * 16 + i) * step, "snare")
                elif ch == "h": hit(y, offset + (bar * 16 + i) * step, "hat")
        bar += 1
    return y + rng.standard_normal(len(y)).astype(np.float32) * 0.002


FLOOR = "K...K...K...K...|....S.......S...|..h...h...h...h."
BOOM = "K.....K...K.....|....S.......S...|h.h.h.h.h.h.h.h."
DNB = "K.........K.....|....S.......S...|h.h.h.h.h.h.h.h."
CASES = [("four on the floor", 128.0, FLOOR, 0.11), ("tech house", 124.0, FLOOR, 0.0), ("house at 122.5", 122.5, FLOOR, 0.2),
         ("hip hop pocket", 90.0, BOOM, 0.05), ("drum and bass", 174.0, DNB, 0.0)]

failures: list[str] = []


def check(cond: bool, line: str) -> None:
    print(("ok   " if cond else "FAIL ") + line)
    if not cond: failures.append(line)


for name, bpm, pat, off in CASES:
    got, conf, phase, alt = analysis.tempo_from_drums(drums(bpm, pat, offset=off), SR)
    ph_err = None
    if got:
        beat = 60.0 / got
        ph_err = min(abs(phase - off % beat), beat - abs(phase - off % beat))
    if alt is not None:
        # A reading below 95 is folded up an octave, as the local ears do. The octave it was read at is named and the
        # confidence capped, so the studio says the doubt out loud instead of building on it blind. Either octave
        # may be the truth (a hip hop pocket at 90 reads 180; a drum and bass break can read half time).
        right = abs(got - bpm) <= 0.5 or abs(alt - bpm) <= 0.5
        check(right and conf <= analysis.FOLDED_CONFIDENCE and ph_err is not None and ph_err <= 0.025,
              f"[tempo] {name}: truth {bpm} -> {got} bpm, folded from {alt}, confidence {conf} (capped at {analysis.FOLDED_CONFIDENCE}), phase error {ph_err if ph_err is None else round(ph_err, 3)} s")
        continue
    check(got is not None and abs(got - bpm) <= 0.5 and conf >= analysis.TEMPO_FLOOR and ph_err is not None and ph_err <= 0.025,
          f"[tempo] {name}: truth {bpm} phase {off:.3f} -> {got} bpm, confidence {conf}, phase {phase:.3f} (error {ph_err if ph_err is None else round(ph_err, 3)} s)")

for name, y in (("silence", np.zeros(SR * 30, dtype=np.float32)), ("white noise", rng.standard_normal(SR * 30).astype(np.float32) * 0.1)):
    got, conf, _, _ = analysis.tempo_from_drums(y, SR)
    check(got is None, f"[tempo] {name}: refused -> {got}, confidence {conf} (floor {analysis.TEMPO_FLOOR})")

if "--quick" not in sys.argv:
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests", "fixtures")
    files = sorted(glob.glob(os.path.join(here, "*.f32")))
    if not files: print("[tempo] fixtures: none on this machine (tests/fixtures/*.f32 is gitignored; zsh tests/fixtures/make.sh)")
    for f in files:
        m = re.match(r"^(.+?)_(\d+)_(\d+[AB])", os.path.basename(f))
        if not m: continue
        truth = float(m.group(2)); y = np.fromfile(f, dtype=np.float32)
        mid = len(y) // 2; ex = y[max(0, mid - 45 * SR): mid + 45 * SR]
        got, conf, _, _ = analysis.tempo_from_drums(ex, SR)
        octave = got is not None and any(abs(got * k - truth) <= 1.0 for k in (0.5, 2.0))
        if truth > 185:   # tagged at double time; reported for the octave, not asserted
            print(f"info [tempo] {m.group(1)}: tag {truth:.0f} -> {got} bpm, confidence {conf} ({'octave of the tag' if octave else 'differs'})")
            continue
        check(got is not None and abs(got - truth) <= 1.0, f"[tempo] {m.group(1)}: tag {truth:.0f} -> {got} bpm, confidence {conf}")

print(f"[tempo] {'ALL PASSED' if not failures else f'{len(failures)} FAILED'}")
sys.exit(1 if failures else 0)
