"""Music analysis for The Producer's stems worker: tempo, key, best bars, the drum split and drum one-shot
slicing from the drums stem. Source separation lives in separate.py (Kim Mel-Band RoFormer, no Demucs)."""
from __future__ import annotations
import json, math, os, shutil, subprocess, sys, tempfile
import time
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


TEMPO_FLOOR = 0.25   # below this the autocorrelation peak is noise: the tempo is refused, not guessed


FOLDED_CONFIDENCE = 0.55   # a folded octave is a guess about the genre, not a measurement, so it is said out loud


def tempo_from_drums(y: np.ndarray, sr: int, lo: float = 70.0, hi: float = 180.0) -> tuple[float | None, float, float, float | None]:
    """Tempo the way a producer counts it. Ported from the local ears (~/.dictation/producer/learning_read.py,
    tempo_from_drums) after a beat tracker returned a constant default on imperfect audio and nothing flagged it.
    Onset-envelope autocorrelation at 128-sample hops (0.6 percent at 120 bpm), the lag that also has support at
    twice itself (a beat, not a sixteenth), a parabolic peak, octaves folded into 95 to 185, the beat phase, and a
    confidence (the normalized autocorrelation at the peak). Returns (bpm, confidence, beat phase in seconds, the
    other octave or None). A tempo folded up from below 95 names the octave it was read at and carries at most
    FOLDED_CONFIDENCE. Below TEMPO_FLOOR it refuses: (None, confidence, 0.0, None). Run it on the separated drums
    when there are drums; the mix is the first read. The phase is searched in 48 steps a beat (about 10 ms at 128)
    on a short-window envelope, so a chop cut on this grid lands with the kick."""
    hop = 128
    oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    if len(oenv) < 200: return None, 0.0, 0.0, None
    o = oenv - oenv.mean(); ac = librosa.autocorrelate(o); ac = ac / (abs(ac[0]) + 1e-9)
    lag_lo, lag_hi = int(60 / hi * sr / hop), int(60 / lo * sr / hop)
    if lag_hi >= len(ac): return None, 0.0, 0.0, None
    i = max(range(lag_lo, lag_hi), key=lambda k: ac[k] + (0.5 * ac[2 * k] if 2 * k < len(ac) else 0))
    d = 0.0
    if 0 < i < len(ac) - 1:
        a, b, c = ac[i - 1], ac[i], ac[i + 1]
        den = a - 2 * b + c
        if den != 0: d = float(np.clip(0.5 * (a - c) / den, -1, 1))
    raw = bpm = 60.0 / ((i + d) * hop / sr)
    while bpm < 95: bpm *= 2
    while bpm > 185: bpm /= 2
    conf = float(np.clip(ac[i], 0, 1))
    if conf < TEMPO_FLOOR: return None, round(conf, 3), 0.0, None
    alt = round(raw, 1) if abs(bpm - raw) > 1 else None
    if alt is not None: conf = min(conf, FOLDED_CONFIDENCE)
    # The beat phase: the offset inside one beat whose comb of onsets is strongest, read off a short-window envelope
    # (512 samples, 23 ms) because the tempo's 93 ms window smears an attack by tens of milliseconds.
    penv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop, n_fft=512, n_mels=40)
    beat = 60.0 / bpm; t = librosa.frames_to_time(np.arange(len(penv)), sr=sr, hop_length=hop)
    best, best_s = 0.0, -1.0
    for ph in np.linspace(0, beat, 48, endpoint=False):
        s = float(np.sum(np.interp(np.arange(int((t[-1] - ph) / beat)) * beat + ph, t, penv)))
        if s > best_s: best_s, best = s, float(ph)
    return round(bpm, 1), round(conf, 3), round(best, 3), alt


def analyze(path: str) -> dict:
    # Measured on a five minute record: librosa.load 2.4 s, harmonic separation 10 s (and 80 s on the worker),
    # chroma_cqt 0.6 s, chroma_stft 0.3 s with the same key. So: ffmpeg for the resample, no HPSS, chroma_stft.
    y, sr = load_mono(path, 22050)
    duration = float(len(y) / sr)
    # Tempo from the middle 90 s (the beat tracker's dynamic programme is the slow part on the worker's CPU;
    # a dance record does not change tempo), energy and key from the whole record.
    mid = len(y) // 2; half = 45 * sr
    ex = y[max(0, mid - half): mid + half] if len(y) > 2 * half + sr else y
    ex_offset = max(0, mid - half) if len(y) > 2 * half + sr else 0
    bpm_est, tempo_conf, phase, tempo_alt = tempo_from_drums(ex, sr)
    if bpm_est is not None:
        bpm = float(bpm_est)
        beat_offset = (ex_offset / sr + phase) % (60.0 / bpm)
    else:
        # Refused: the bars still need counting, so the old tracker's number stands in, carrying the low confidence
        # it earned so the studio says it out loud instead of building on it blind.
        tempo, beats = librosa.beat.beat_track(onset_envelope=librosa.onset.onset_strength(y=ex, sr=sr), sr=sr, trim=False)
        bpm = float(np.atleast_1d(tempo)[0]) or 120.0
        while bpm < 95: bpm *= 2
        while bpm > 185: bpm /= 2
        beat_times = librosa.frames_to_time(beats, sr=sr) + ex_offset / sr
        beat_offset = float(beat_times[0] % (60.0 / bpm)) if len(beat_times) else 0.0
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
        "bpm": round(bpm, 1), "tempoConfidence": round(float(tempo_conf), 3), "tempoRefused": bpm_est is None, "tempoAlt": tempo_alt, "tempoFrom": "mix",
        "key": key, "keyConfidence": key_conf, "durationSec": round(duration, 2),
        "bars": n_bars, "barEnergy": [round(float(v), 3) for v in be.tolist()], "blocks": blocks, "dropAt": drop_at,
        "bestBars": {"startBar": best_start, "startSec": round(best_start * bar_sec, 2), "endSec": round((best_start + 8) * bar_sec, 2), "energy": round(best_val, 2)},
        # The beat grid's phase from the record's start, folded into one beat period.
        "beatOffsetSec": round(float(beat_offset), 3),
    }


def drum_parts(drums_path: str, out_dir: str) -> dict[str, str]:
    """The drum stem as kick, snare, hat and percussion stems (DRUM_PARTS=1): a band-and-transient split, no model.
    Kick is what sits under 160 Hz around low, dull onsets; hats what sits above 5 kHz around bright, short onsets;
    snare the mid band around mid onsets; percussion the rest. Explainable and instant; a learned drum separator is
    the upgrade behind the same switch."""
    from scipy.signal import butter, sosfiltfilt
    os.makedirs(out_dir, exist_ok=True)
    y, sr = librosa.load(drums_path, sr=44100, mono=True)
    if len(y) < sr: return {}
    lo = sosfiltfilt(butter(4, 160, "low", fs=sr, output="sos"), y)
    hi = sosfiltfilt(butter(4, 5000, "high", fs=sr, output="sos"), y)
    mid = sosfiltfilt(butter(4, [160, 5000], "band", fs=sr, output="sos"), y)
    onsets = librosa.onset.onset_detect(y=y, sr=sr, units="samples", backtrack=True, delta=0.1)
    hop = 512; frames = int(np.ceil(len(y) / hop)) + 1
    gates = {"kick": np.zeros(frames), "snare": np.zeros(frames), "hat": np.zeros(frames)}
    for o in onsets:
        n = min(len(y), o + int(0.12 * sr)); piece = y[o:n]
        if len(piece) < 256: continue
        spec = np.abs(np.fft.rfft(piece * np.hanning(len(piece)))); freqs = np.fft.rfftfreq(len(piece), 1 / sr)
        tot = spec.sum() + 1e-9; low = spec[freqs < 150].sum() / tot; cen = float((freqs * spec).sum() / tot)
        role = "kick" if (low > 0.4 and cen < 700) else "hat" if cen > 4000 else "snare"
        length = int(0.35 * sr) if role == "kick" else int(0.25 * sr) if role == "snare" else int(0.15 * sr)
        f0, f1 = o // hop, min(frames, (o + length) // hop + 1)
        gates[role][f0:f1] = 1.0
    def apply(sig: np.ndarray, gate: np.ndarray) -> np.ndarray:
        env = np.repeat(gate, hop)[: len(sig)]
        env = np.convolve(env, np.ones(int(0.01 * sr)) / int(0.01 * sr), mode="same")   # 10 ms edges
        return (sig * env).astype(np.float32)
    parts = {"kick": apply(lo, gates["kick"]), "snare": apply(mid, gates["snare"]), "hat": apply(hi, gates["hat"])}
    perc = (y - parts["kick"] - parts["snare"] - parts["hat"]).astype(np.float32)
    parts["perc"] = perc
    out = {}
    for name, sig in parts.items():
        if float(np.max(np.abs(sig)) if len(sig) else 0) < 0.01: continue
        p = os.path.join(out_dir, f"{name}.wav"); sf.write(p, sig, sr); out[name] = p
    return out


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
        import separate as sep
        t1 = time.time(); stems = sep.separate(wav, os.path.join(tmp, "sep"))
        print("STEMS", {k: os.path.basename(v) for k, v in stems.items()}, f"in {time.time() - t1:.0f}s", flush=True)
        if os.environ.get("DRUM_PARTS", "1") == "1" and "drums" in stems:
            t2 = time.time(); parts = drum_parts(stems["drums"], os.path.join(tmp, "parts"))
            print("DRUM_PARTS", {k: os.path.basename(v) for k, v in parts.items()}, f"in {time.time() - t2:.1f}s", flush=True)
        shots = slice_oneshots(stems["drums"], os.path.join(tmp, "shots"))
        print("ONESHOTS", json.dumps([asdict(s) for s in shots]), flush=True)
        print("TMP", tmp, flush=True)
    else:
        shutil.rmtree(tmp, ignore_errors=True)
