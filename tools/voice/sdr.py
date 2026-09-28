"""Vocal SDR on the ground-truth mixes (tools/voice/mixes.py): Kim Mel-Band RoFormer against htdemucs_6s.

htdemucs_6s runs here only as the yardstick, on this machine, through a locally installed demucs; the worker no
longer ships it. SDR is the plain signal-to-distortion ratio over the whole track, both channels, the way the
MVSEP Multisong board scores: 10 log10(sum s^2 / sum (s - s_hat)^2). Every timed run records the load average
before it starts; a run above load 20 is marked under-load and is not a speed number.

    OMP_NUM_THREADS=4 python tools/voice/sdr.py [kim|demucs|score|time SECONDS] [names...]
"""
from __future__ import annotations
import json, os, subprocess, sys, time
import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(ROOT, "worker"))
BUILD = os.path.expanduser("~/dev/producer-web-progress/build")
MIXES = os.path.join(BUILD, "mixes")
OUT = os.path.join(BUILD, "sep")
LOG = os.path.join(BUILD, "sdr-runs.jsonl")


def load_avg() -> float: return float(os.getloadavg()[0])


def note(row: dict) -> None:
    row = {"at": time.strftime("%Y-%m-%d %H:%M:%S"), **row}
    with open(LOG, "a") as f: f.write(json.dumps(row) + "\n")
    print(json.dumps(row), flush=True)


def sdr(ref: np.ndarray, est: np.ndarray) -> float:
    n = min(ref.shape[-1], est.shape[-1]); ref, est = ref[..., :n], est[..., :n]
    return float(10 * np.log10((np.sum(ref ** 2) + 1e-9) / (np.sum((ref - est) ** 2) + 1e-9)))


def read(path: str) -> np.ndarray:
    y, _ = sf.read(path, dtype="float32", always_2d=True); return y.T


def run_kim(name: str, seconds: float | None = None) -> None:
    import roformer
    mix = read(os.path.join(MIXES, name, "mix.wav"))
    if seconds: mix = mix[:, : int(seconds * 44100)]
    load0 = load_avg(); t0 = time.time()
    v = roformer.vocals(mix)
    dt = time.time() - t0
    if not seconds:
        os.makedirs(os.path.join(OUT, "kim"), exist_ok=True)
        sf.write(os.path.join(OUT, "kim", f"{name}.wav"), v.T, 44100, subtype="FLOAT")
    minutes = mix.shape[1] / 44100 / 60
    note({"model": "kim", "name": name, "audioSec": round(mix.shape[1] / 44100, 1), "sec": round(dt, 1), "secPerAudioMin": round(dt / minutes, 1),
          "overlap": roformer.OVERLAP, "threads": os.environ.get("OMP_NUM_THREADS"), "loadBefore": round(load0, 2), "loadAfter": round(load_avg(), 2), "underLoad": load0 > 20})


def run_demucs(name: str, seconds: float | None = None) -> None:
    src = os.path.join(MIXES, name, "mix.wav")
    tmp = os.path.join(OUT, "demucs-tmp"); os.makedirs(tmp, exist_ok=True)
    if seconds:
        cut = os.path.join(tmp, f"{name}-{int(seconds)}.wav")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-t", str(seconds), cut], check=True); src = cut
    load0 = load_avg(); t0 = time.time()
    # The worker's former production settings: SEPARATE_FAST=1 meant --shifts 0 --overlap 0.15.
    subprocess.run([sys.executable, "-m", "demucs.separate", "-n", "htdemucs_6s", "--shifts", "0", "--overlap", "0.15", "-o", tmp, "--filename", "{track}-{stem}.{ext}", src], check=True, capture_output=True)
    dt = time.time() - t0
    base = os.path.splitext(os.path.basename(src))[0]
    got = os.path.join(tmp, "htdemucs_6s", f"{base}-vocals.wav")
    if not seconds:
        os.makedirs(os.path.join(OUT, "htdemucs_6s"), exist_ok=True)
        os.replace(got, os.path.join(OUT, "htdemucs_6s", f"{name}.wav"))
    note({"model": "htdemucs_6s", "name": name, "audioSec": round(sf.info(src).duration, 1), "sec": round(dt, 1), "secPerAudioMin": round(dt / (sf.info(src).duration / 60), 1),
          "threads": os.environ.get("OMP_NUM_THREADS"), "loadBefore": round(load0, 2), "loadAfter": round(load_avg(), 2), "underLoad": load0 > 20})


def score(names: list[str]) -> None:
    rows = []
    for name in names:
        ref = read(os.path.join(MIXES, name, "vocals.wav"))
        row = {"name": name}
        for model in ("kim", "htdemucs_6s"):
            p = os.path.join(OUT, model, f"{name}.wav")
            if os.path.exists(p): row[model] = round(sdr(ref, read(p)), 2)
        rows.append(row); print(json.dumps(row), flush=True)
    for model in ("kim", "htdemucs_6s"):
        vals = [r[model] for r in rows if model in r]
        if vals: print(f"{model}: mean vocal SDR {np.mean(vals):.2f} dB over {len(vals)} mixes")
    json.dump(rows, open(os.path.join(BUILD, "sdr-scores.json"), "w"), indent=1)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "score"
    seconds = float(sys.argv[2]) if mode == "time" else None
    names = [a for a in sys.argv[3 if mode == "time" else 2:]] or sorted(os.listdir(MIXES))
    if mode == "kim": [run_kim(n) for n in names]
    elif mode == "demucs": [run_demucs(n) for n in names]
    elif mode == "time":
        for n in names[:1]: run_kim(n, seconds); run_demucs(n, seconds)
    else: score(names)
