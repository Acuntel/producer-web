"""Music analysis for The Producer's stems worker: tempo, key, best bars, source
separation (demucs htdemucs), and drum one-shot slicing from the drums stem."""
from __future__ import annotations
import json, math, os, shutil, subprocess, sys, tempfile
from dataclasses import dataclass, asdict
import numpy as np
import librosa
import soundfile as sf

NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
# Krumhansl-Schmuckler key profiles
MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def ffmpeg_to_wav(src: str, dst: str, max_seconds: int = 480) -> None:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-t", str(max_seconds), "-ac", "2", "-ar", "44100", "-vn", dst], check=True)


def ffmpeg_to_mp3(src: str, dst: str, kbps: int = 192) -> None:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-codec:a", "libmp3lame", "-b:a", f"{kbps}k", dst], check=True)


def detect_key(chroma_mean: np.ndarray) -> tuple[str, float]:
    best, best_name, second = -2.0, "C major", -2.0
    for i in range(12):
        for mode, prof in (("major", MAJOR), ("minor", MINOR)):
            r = float(np.corrcoef(np.roll(prof, i), chroma_mean)[0, 1])
            if r > best:
                second, best, best_name = best, r, f"{NOTE_NAMES[i]} {mode}"
            elif r > second:
                second = r
    conf = max(0.0, min(1.0, (best - second) * 4 + 0.3))
    return best_name, round(conf, 2)


def load_mono(path: str, sr: int = 22050) -> tuple[np.ndarray, int]:
    """ffmpeg resamples in a fraction of a second where librosa's resampler takes seconds per minute of audio."""
    tmp = path + f".{sr}.wav"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", path, "-ac", "1", "-ar", str(sr), tmp], check=True)
    y, got = sf.read(tmp, dtype="float32")
    try: os.remove(tmp)
    except OSError: pass
    return (y if y.ndim == 1 else y.mean(axis=1)), int(got)


def analyze(path: str) -> dict:
    # Measured on a five minute record: librosa.load 2.4 s, harmonic separation 10 s (and 80 s on the worker),
    # chroma_cqt 0.6 s, chroma_stft 0.3 s with the same key. So: ffmpeg for the resample, no HPSS, chroma_stft.
    y, sr = load_mono(path, 22050)
    duration = float(len(y) / sr)
    # Tempo from the middle 90 s (the beat tracker's dynamic programme is the slow part on the worker's CPU;
    # a dance record does not change tempo), energy and key from the whole record.
    mid = len(y) // 2; half = 45 * sr
    ex = y[max(0, mid - half): mid + half] if len(y) > 2 * half + sr else y
    onset_env = librosa.onset.onset_strength(y=ex, sr=sr)
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, trim=False)
    ex_offset = max(0, mid - half) if len(y) > 2 * half + sr else 0
    bpm = float(np.atleast_1d(tempo)[0])
    # Dance records live 100-180; fold octave errors into that band.
    while bpm and bpm < 95: bpm *= 2
    while bpm > 185: bpm /= 2
    beat_times = librosa.frames_to_time(beats, sr=sr) + ex_offset / sr
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    key, key_conf = detect_key(chroma.mean(axis=1))
    # Energy per bar (4 beats) and the best 8 bars: the loudest window.
    rms = librosa.feature.rms(y=y)[0]
    rms_t = librosa.frames_to_time(np.arange(len(rms)), sr=sr)
    bar_sec = 240.0 / bpm if bpm else 2.0
    n_bars = max(1, int(duration // bar_sec))
    bar_energy = []
    for b in range(n_bars):
        m = (rms_t >= b * bar_sec) & (rms_t < (b + 1) * bar_sec)
        bar_energy.append(float(rms[m].mean()) if m.any() else 0.0)
    be = np.array(bar_energy)
    if be.max() > 0: be = be / be.max()
    # Best 8 bars: the loudest window; on a near tie (within 5 percent) prefer a window that starts on an
    # 8-bar boundary after the first block, which is where a record's real hook usually lives.
    windows = [(float(be[b:b + 8].mean()), b) for b in range(0, max(1, n_bars - 7))]
    best_val, best_start = max(windows)
    aligned = [(v, b) for v, b in windows if b % 8 == 0 and b >= 8 and v >= best_val - 0.05]
    if aligned: best_val, best_start = max(aligned, key=lambda t: (t[0], -t[1]))
    # Rough structure: 8-bar blocks labelled by energy; the drop is the first block at or above 0.85 after a lower one.
    blocks = [{"bar": b, "at": round(b * bar_sec, 2), "energy": round(float(be[b:b + 8].mean()), 2)} for b in range(0, n_bars, 8)]
    # A drop needs a quieter block before it; a record that opens at full energy has no drop to point at.
    drop_at = None
    for i, blk in enumerate(blocks):
        if i > 0 and blk["energy"] >= 0.85 and blocks[i - 1]["energy"] < blk["energy"] - 0.15:
            drop_at = blk["at"]; break
    return {
        "bpm": round(bpm, 1), "key": key, "keyConfidence": key_conf, "durationSec": round(duration, 2),
        "bars": n_bars, "barEnergy": [round(float(v), 3) for v in be.tolist()], "blocks": blocks, "dropAt": drop_at,
        "bestBars": {"startBar": best_start, "startSec": round(best_start * bar_sec, 2), "endSec": round((best_start + 8) * bar_sec, 2), "energy": round(best_val, 2)},
        # The beat grid's phase from the record's start (the first tracked beat folded into one beat period).
        "beatOffsetSec": round(float(beat_times[0] % (60.0 / bpm)), 3) if len(beat_times) and bpm else 0.0,
    }


def separate(wav_path: str, out_dir: str, model: str = "htdemucs") -> dict[str, str]:
    """Run demucs in a subprocess (its own process keeps torch memory out of the server)."""
    # Measured on the demo record: shifts=1 79 s, shifts=0 56 s, shifts=0 + overlap 0.1 48 s, same stems for our use
    # (one-shots, loops, listening). SEPARATE_FAST=0 restores demucs' defaults.
    fast = os.environ.get("SEPARATE_FAST", "1") == "1"
    extra = ["--shifts", "0", "--overlap", "0.15"] if fast else []
    subprocess.run([sys.executable, "-m", "demucs.separate", "-n", model, "-o", out_dir, "--filename", "{stem}.{ext}", *extra, wav_path], check=True)
    base = os.path.join(out_dir, model)
    stems = {}
    for name in ("drums", "bass", "vocals", "other"):
        p = os.path.join(base, f"{name}.wav")
        if os.path.exists(p): stems[name] = p
    if not stems: raise RuntimeError("demucs produced no stems")
    return stems


@dataclass
class OneShot:
    role: str
    path: str
    durationSec: float
    fundamentalHz: float | None
    centroidHz: float
    peakDb: float
    atSec: float


def _fundamental(seg: np.ndarray, sr: int) -> float | None:
    n = min(len(seg), int(sr * 0.25))
    if n < 256: return None
    win = seg[:n] * np.hanning(n)
    spec = np.abs(np.fft.rfft(win, n=1 << 16))
    freqs = np.fft.rfftfreq(1 << 16, 1 / sr)
    band = (freqs >= 35) & (freqs <= 130)
    if not band.any(): return None
    return float(freqs[band][int(np.argmax(spec[band]))])


def _zero_cross(y: np.ndarray, i: int, back: int = 2000) -> int:
    k = min(len(y) - 1, i)
    for _ in range(back):
        if k <= 1: break
        if y[k - 1] <= 0 < y[k]: return k
        k -= 1
    return min(len(y), i)


def slice_oneshots(drums_path: str, out_dir: str, max_per_role: int = 2) -> list[OneShot]:
    os.makedirs(out_dir, exist_ok=True)
    y, sr = librosa.load(drums_path, sr=44100, mono=True)
    if not len(y): return []
    onsets = librosa.onset.onset_detect(y=y, sr=sr, units="samples", backtrack=True, delta=0.12, wait=max(1, int(0.06 * sr / 512)))
    cands: dict[str, list[tuple[float, OneShot, np.ndarray]]] = {"kick": [], "snare": [], "hat": [], "perc": []}
    for i, start in enumerate(onsets):
        nxt = onsets[i + 1] if i + 1 < len(onsets) else len(y)
        gap = (nxt - start) / sr
        end = min(nxt, start + int(0.7 * sr), len(y))
        seg = y[start:end]
        if len(seg) < int(0.04 * sr): continue
        peak = float(np.max(np.abs(seg)))
        if peak < 0.08: continue
        n = min(len(seg), int(0.2 * sr))
        spec = np.abs(np.fft.rfft(seg[:n] * np.hanning(n)))
        freqs = np.fft.rfftfreq(n, 1 / sr)
        tot = float(spec.sum()) + 1e-9
        low = float(spec[freqs < 150].sum()) / tot
        centroid = float((freqs * spec).sum() / tot)
        env = np.abs(seg)
        above20 = np.where(env > peak * 0.1)[0]    # -20 dB: the body of the hit, for classification
        above40 = np.where(env > peak * 0.01)[0]   # -40 dB: where the hit really ends, for the trim
        dur = float((above20[-1] if len(above20) else len(seg)) / sr)
        dur40 = float((above40[-1] if len(above40) else len(seg)) / sr)
        if low > 0.45 and centroid < 600: role = "kick"
        elif centroid > 4500 and dur < 0.3: role = "hat"
        elif 700 <= centroid <= 4500: role = "snare"
        else: role = "perc"
        # A clean one-shot is loud and isolated (nothing else starts right after it).
        score = peak * (1.0 if gap >= 0.14 else 0.4) * (1.0 if dur < 0.6 else 0.7)
        f0 = _fundamental(seg, sr) if role == "kick" else None
        shot = OneShot(role=role, path="", durationSec=round(min(max(dur40, dur) + 0.02, 0.7), 3), fundamentalHz=round(f0, 1) if f0 else None, centroidHz=round(centroid), peakDb=round(20 * math.log10(peak), 1), atSec=round(start / sr, 3))
        cands[role].append((score, shot, seg))
    out: list[OneShot] = []
    for role, lst in cands.items():
        lst.sort(key=lambda t: -t[0])
        for score, shot, seg in lst[:max_per_role]:
            end = _zero_cross(seg, int(min(len(seg), shot.durationSec * sr)))
            take = seg[:end].copy()
            fade_in = int(0.003 * sr); fade_out = int(0.02 * sr)
            if len(take) > fade_in: take[:fade_in] *= np.linspace(0, 1, fade_in)
            if len(take) > fade_out: take[-fade_out:] *= np.linspace(1, 0, fade_out)
            take = take / (np.max(np.abs(take)) + 1e-9) * 0.891  # -1 dBFS
            p = os.path.join(out_dir, f"{role}{'' if not any(o.role == role for o in out) else '-2'}.wav")
            sf.write(p, take.astype(np.float32), sr)
            shot.path = p
            out.append(shot)
    return out


if __name__ == "__main__":
    src = sys.argv[1]
    tmp = tempfile.mkdtemp(prefix="producer-an-")
    wav = os.path.join(tmp, "src.wav")
    ffmpeg_to_wav(src, wav)
    facts = analyze(wav)
    print("FACTS", json.dumps(facts)[:700], flush=True)
    if len(sys.argv) > 2 and sys.argv[2] == "--stems":
        stems = separate(wav, os.path.join(tmp, "sep"))
        print("STEMS", stems, flush=True)
        shots = slice_oneshots(stems["drums"], os.path.join(tmp, "shots"))
        print("ONESHOTS", json.dumps([asdict(s) for s in shots]), flush=True)
        print("TMP", tmp, flush=True)
    else:
        shutil.rmtree(tmp, ignore_errors=True)
