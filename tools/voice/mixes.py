"""Ground-truth mixes: a known acapella over a beat we own, so separation, words and hooks can be measured.

The acapellas are CC BY fixtures listed in ~/dev/producer-web-progress/build/fixtures/SOURCES.md (never committed).
The beat is the owned CC0 starter pack (public/samples/starter) plus sine tones made here: a kick on every beat,
a clap on 2 and 4, hats on the off eighths, piano stabs and a sine bass on a I V vi IV loop in the vocal's key,
and an 8-bar breakdown with no kick in the middle so the record has a drop. The vocal sits at 0 dB against the
beat, measured over the frames where it sings. Everything is scaled together to a -1 dBFS peak, so the vocal
reference is exactly what went into the mix.

    python tools/voice/mixes.py [out_dir]     # default ~/dev/producer-web-progress/build/mixes
"""
from __future__ import annotations
import json, os, sys
import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(ROOT, "worker"))
import analysis  # noqa: E402

SR = 44100
FIX = os.path.expanduser("~/dev/producer-web-progress/build/fixtures")
STARTER = os.path.join(ROOT, "public", "samples", "starter")
# name: (file, tempo range from the uploader's ccMixter tag, hook line from the uploader's own lyrics)
FIXTURES = {
    "waking_me_softly": ("waking_me_softly_lead.flac", (130, 135), "Break it down, break it down, break it down for me now"),
    "alice_in_the_city": ("alice_in_the_city_dry.flac", (105, 110), "Lost here in the white noise of this empty space"),
    "fading_things": ("fading_things_pella.mp3", (125, 130), "Of the fading things"),
    "numbers": ("numbers_main_vocals_dry.wav", (95, 100), "Break free from your mind of fear"),
    "blindly_love": ("blindly_love_main_vocal.wav", (130, 135), "Will we ever blindly love"),
}
PC = {"C": 0, "Db": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "Gb": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}


def load(path: str) -> np.ndarray:
    import subprocess, tempfile
    with tempfile.TemporaryDirectory() as td:
        out = os.path.join(td, "x.wav")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", path, "-ac", "2", "-ar", str(SR), out], check=True)
        y, _ = sf.read(out, dtype="float32", always_2d=True)
    return y.T.copy()


def one_shot(name: str) -> np.ndarray:
    return load(os.path.join(STARTER, name))


def place(buf: np.ndarray, shot: np.ndarray, at: float, gain: float = 1.0) -> None:
    i = int(at * SR)
    if i >= buf.shape[1]: return
    n = min(shot.shape[1], buf.shape[1] - i)
    buf[:, i:i + n] += shot[:, :n] * gain


def pitched(shot: np.ndarray, semis: float) -> np.ndarray:
    """A one-shot moved by resampling (a piano stab may change length; it is a stab)."""
    rate = 2 ** (semis / 12)
    idx = np.arange(0, shot.shape[1] - 1, rate)
    return np.stack([np.interp(idx, np.arange(shot.shape[1]), c) for c in shot]).astype(np.float32)


def beat(n: int, bpm: float, key: str) -> np.ndarray:
    tonic, mode = key.split()
    root = PC[tonic]
    prog = [0, 7, 9, 5] if mode == "major" else [0, 8, 3, 10]   # I V vi IV, or i VI III VII
    thirds = {0: 4, 7: 4, 9: 3, 5: 4} if mode == "major" else {0: 3, 8: 4, 3: 4, 10: 4}
    kick, clap, hat, piano = one_shot("kick_house.wav"), one_shot("clap_group.wav"), one_shot("hat_closed_clean.wav"), one_shot("keys_fm_piano_c4.wav")
    buf = np.zeros((2, n), dtype=np.float32)
    beat_s = 60.0 / bpm; bar_s = 4 * beat_s; bars = int(n / SR / bar_s) + 1
    t = np.arange(n) / SR
    for b in range(bars):
        breakdown = (bars // 2 - 4) <= b < (bars // 2 + 4)
        deg = prog[b % 4]; r = (root + deg) % 12
        for k in range(4):
            at = b * bar_s + k * beat_s
            if not breakdown: place(buf, kick, at, 0.9)
            if k in (1, 3) and not breakdown: place(buf, clap, at, 0.5)
            place(buf, hat, at + beat_s / 2, 0.25)
        for semis in (r, r + thirds[deg], r + 7):   # the triad, around middle C
            place(buf, pitched(piano, semis - 12 if semis > 6 else semis), b * bar_s, 0.18)
            place(buf, pitched(piano, semis - 12 if semis > 6 else semis), b * bar_s + 2.5 * beat_s, 0.12)
        # A sine bass on the root, in eighths, with a short fade on every note.
        f = 440.0 * 2 ** ((36 + r - 69) / 12)
        for e in range(8):
            a = int((b * bar_s + e * beat_s / 2) * SR); z = min(n, a + int(beat_s / 2 * SR * 0.9))
            if a >= n or breakdown: continue
            env = np.minimum(1, np.minimum(np.arange(z - a) / 200.0, (z - a - np.arange(z - a)) / 400.0))
            buf[:, a:z] += (0.35 * np.sin(2 * np.pi * f * t[a:z]) * env).astype(np.float32)
    return buf


def active_rms(y: np.ndarray) -> float:
    m = y.mean(axis=0); hop = 1024
    frames = np.sqrt(np.array([np.mean(m[i:i + hop] ** 2) for i in range(0, len(m) - hop, hop)]) + 1e-12)
    loud = frames[frames > frames.max() * 0.05]
    return float(np.sqrt(np.mean(loud ** 2))) if len(loud) else 1e-6


def build(name: str, out_dir: str) -> dict:
    file, (lo, hi), hook = FIXTURES[name]
    vocal = load(os.path.join(FIX, file))
    mono = vocal.mean(axis=0)
    bpm, conf, _, _ = analysis.tempo_from_drums(mono[::2], SR // 2, lo - 2, hi + 2)
    bpm = float(bpm) if bpm and lo - 2 <= bpm <= hi + 2 else (lo + hi) / 2.0
    import librosa
    key, _ = analysis.detect_key(librosa.feature.chroma_stft(y=mono[::2], sr=SR // 2).mean(axis=1))
    acc = beat(vocal.shape[1], bpm, key)
    vocal = vocal * (active_rms(acc) / active_rms(vocal))
    mix = vocal + acc
    g = 0.891 / max(1e-6, float(np.max(np.abs(mix))))
    d = os.path.join(out_dir, name); os.makedirs(d, exist_ok=True)
    for stem, y in (("mix", mix), ("vocals", vocal), ("accompaniment", acc)):
        sf.write(os.path.join(d, f"{stem}.wav"), (y * g).T, SR, subtype="FLOAT")
    meta = {"name": name, "source": file, "bpm": round(bpm, 2), "key": key, "hook": hook, "seconds": round(vocal.shape[1] / SR, 2), "gain": round(g, 4)}
    json.dump(meta, open(os.path.join(d, "meta.json"), "w"), indent=1)
    return meta


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/dev/producer-web-progress/build/mixes")
    for n in FIXTURES: print(json.dumps(build(n, out)), flush=True)
