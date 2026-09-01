#!/usr/bin/env python3
"""Independent cross-check of the ears fixtures with librosa (tempo + Krumhansl key)."""
import glob, os, re, sys, time
import numpy as np
import librosa

NOTES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
CAMELOT_MIN = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "Db"]
CAMELOT_MAJ = ["B", "F#", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"]

def camelot(code):
    n, l = int(code[:-1]), code[-1]
    return f"{CAMELOT_MIN[n-1]} minor" if l == "A" else f"{CAMELOT_MAJ[n-1]} major"

def key_of(chroma):
    best = None
    for t in range(12):
        for name, prof in (("major", MAJOR), ("minor", MINOR)):
            r = np.corrcoef(chroma, np.roll(prof, t))[0, 1]
            if best is None or r > best[0]:
                best = (r, f"{NOTES[t]} {name}")
    return best[1]

here = os.path.dirname(os.path.abspath(__file__))
print(f"{'track':26} {'tag':16} {'librosa bpm':12} {'librosa key':12} {'s':>5}")
for f in sorted(glob.glob(os.path.join(here, "*.f32"))):
    m = re.match(r"^(.+?)_(\d+)_(\d+[AB])(?:_x)?\.f32$", os.path.basename(f))
    y = np.fromfile(f, dtype=np.float32)
    sr = 22050
    t0 = time.time()
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    tempo = float(np.atleast_1d(tempo)[0])
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr).mean(axis=1)
    k = key_of(chroma)
    tag = f"{m.group(2)} {camelot(m.group(3))}" if m else "?"
    print(f"{(m.group(1) if m else f)[:26]:26} {tag:16} {tempo:12.1f} {k:12} {time.time()-t0:5.1f}")
