"""The record's grid: beats and downbeats in seconds, so a phrase can say which bar and beat it starts on.

beat_this (CPJKU, ISMIR 2024; code and published weights MIT) runs on the mix when it is installed and its
checkpoint loads; it needs no madmom (its "minimal" postprocessing is plain peak picking). Otherwise the grid is the
worker's own tempo path: facts.bpm and facts.beatOffsetSec, with the downbeat phase picked as the beat of the bar
where the low end (kick and bass) hits hardest. Set BEAT_THIS=0 to skip the model."""
from __future__ import annotations
import os
from dataclasses import dataclass, field
import numpy as np

_model = None


@dataclass
class Grid:
    beats: np.ndarray
    downbeats: np.ndarray
    beat_sec: float
    source: str                      # "beat_this" or "tempo"
    meta: dict = field(default_factory=dict)

    def position(self, t: float) -> tuple[int, float]:
        """(bar, beat) of time t: the bar counts from 0 at the first downbeat (negative before it), the beat is
        fractional, 0 at the downbeat. Past the ends of the tracked grid it extrapolates at the median bar length."""
        d = self.downbeats
        if not len(d): return 0, round(t / self.beat_sec, 3)
        bar_sec = float(np.median(np.diff(d))) if len(d) > 1 else 4 * self.beat_sec
        i = int(np.searchsorted(d, t, side="right")) - 1
        if i < 0:
            k = int(np.floor((t - d[0]) / bar_sec)); at = d[0] + k * bar_sec
            return k, round((t - at) / (bar_sec / 4), 3)
        nxt = d[i + 1] if i + 1 < len(d) else d[i] + bar_sec
        if t >= nxt:   # past the last tracked downbeat
            k = int(np.floor((t - d[i]) / bar_sec)); at = d[i] + k * bar_sec
            return i + k, round((t - at) / (bar_sec / 4), 3)
        return i, round((t - d[i]) / ((nxt - d[i]) / 4), 3)

    def nearest(self, t: float, which: str = "downbeats") -> float:
        arr = self.downbeats if which == "downbeats" else self.beats
        if not len(arr): return t
        return float(arr[int(np.argmin(np.abs(arr - t)))])


def from_tempo(bpm: float, offset: float, duration: float, low: np.ndarray | None = None, sr: int = 22050) -> Grid:
    """A steady grid from the tempo path. low is a mono low-passed signal: the downbeat is the beat phase (0 to 3)
    whose beats carry the most low-end energy over the record."""
    beat = 60.0 / bpm
    beats = np.arange(offset % beat, duration, beat)
    phase = 0
    if low is not None and len(beats) >= 8:
        e = np.array([float(np.sum(low[int(b * sr): int((b + 0.1) * sr)] ** 2)) for b in beats])
        phase = int(np.argmax([e[p::4].mean() for p in range(4)]))
    return Grid(beats, beats[phase::4], beat, "tempo", {"phase": phase})


def regularize(d: np.ndarray) -> np.ndarray:
    """Downbeats with the tracker's slips taken out: in a stretch with no kick it can mark a bar line twice (a gap
    under 0.6 of a bar) or skip one (a gap over 1.5 bars). The extra one is dropped (the one further from where the
    bar before predicts it) and a skipped one is filled in evenly, so bar numbers stay true after a breakdown."""
    if len(d) < 3: return d
    bar = float(np.median(np.diff(d)))
    kept = [float(d[0])]
    for t in d[1:]:
        t = float(t)
        if t - kept[-1] < 0.6 * bar:
            want = kept[-2] + bar if len(kept) >= 2 else kept[-1]
            if abs(t - want) < abs(kept[-1] - want): kept[-1] = t
            continue
        gap = t - kept[-1]
        if gap > 1.5 * bar:
            n = int(round(gap / bar))
            kept += [kept[-1] + gap * k / n for k in range(1, n)]
        kept.append(t)
    return np.array(kept)


def beat_this_grid(mix_path: str) -> Grid | None:
    global _model
    if os.environ.get("BEAT_THIS", "1") != "1": return None
    try:
        import torch
        from beat_this.inference import File2Beats
        if _model is None:
            torch.set_num_threads(int(os.environ.get("OMP_NUM_THREADS", "4")))
            _model = File2Beats(checkpoint_path=os.environ.get("BEAT_THIS_CKPT", "final0"), device="cpu", dbn=False)
        beats, downs = _model(mix_path)
        beats, downs = np.asarray(beats, dtype=np.float64), np.asarray(downs, dtype=np.float64)
        if len(beats) < 8 or len(downs) < 2: return None
        return Grid(beats, regularize(downs), float(np.median(np.diff(beats))), "beat_this", {"downbeatsRaw": len(downs)})
    except Exception as e:   # not installed, no checkpoint, or a file it cannot read: the tempo path answers
        print("beat_this unavailable:", str(e)[:160], flush=True)
        return None


def grid_for(mix_path: str, facts: dict, y_mix: np.ndarray | None = None, sr: int = 22050) -> Grid:
    g = beat_this_grid(mix_path)
    if g: return g
    low = None
    if y_mix is not None:
        from scipy.signal import butter, sosfiltfilt
        low = sosfiltfilt(butter(4, 150, "low", fs=sr, output="sos"), y_mix)
    dur = float(facts.get("durationSec") or (len(y_mix) / sr if y_mix is not None else 240))
    return from_tempo(float(facts.get("bpm") or 120), float(facts.get("beatOffsetSec") or 0.0), dur, low, sr)
