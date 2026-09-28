"""The phrases of an isolated vocal, cut by its own loudness: a port of lib/song/vocal.ts findPhrases, so the worker's
vocal map and the browser agree on where a line starts and ends. Words from the transcriber only LABEL these phrases;
the cuts come from the voice itself (sung word timing is off by 0.22 to 0.65 s, MIREX 2024).

Differences from the browser port, both on purpose: a phrase is kept whole here (the map carries its full span), and
the "loudest window" the browser caps a long phrase to is computed as it says it is (the browser kept the first 6 s)."""
from __future__ import annotations
from dataclasses import dataclass
import numpy as np


@dataclass
class Phrase:
    start: float
    end: float
    peak_db: float
    rms_db: float
    loudest: tuple[float, float]   # the loudest window of at most max_sec inside the phrase, for a capped cut


def db(x: np.ndarray | float) -> np.ndarray | float:
    return 20 * np.log10(np.maximum(1e-7, x))


def envelope(y: np.ndarray, sr: int, hop_sec: float = 0.01, win_sec: float = 0.025) -> np.ndarray:
    """RMS in dB per hop, over a win_sec window starting at each hop (the browser's envelope, vectorised)."""
    hop = max(1, round(hop_sec * sr)); win = max(hop, round(win_sec * sr))
    n = (len(y) - win) // hop + 1
    if n <= 0: return np.zeros(0, dtype=np.float32)
    c = np.concatenate([[0.0], np.cumsum(y.astype(np.float64) ** 2)])
    starts = np.arange(n) * hop
    return db(np.sqrt((c[starts + win] - c[starts]) / win)).astype(np.float32)


def percentile(values: np.ndarray, p: float) -> float:
    if not len(values): return -120.0
    a = np.sort(values)
    return float(a[min(len(a) - 1, max(0, round((len(a) - 1) * p)))])


def spans(env: np.ndarray, open_db: float, close_db: float, join: int) -> list[tuple[int, int]]:
    """Hysteresis gate: open above open_db, close after `join` hops below close_db."""
    out: list[tuple[int, int]] = []
    inside, frm, quiet = False, 0, 0
    for i, v in enumerate(env):
        if not inside:
            if v >= open_db: inside, frm, quiet = True, i, 0
            continue
        if v >= close_db: quiet = 0; continue
        quiet += 1
        if quiet >= join: out.append((frm, i - quiet)); inside = False
    if inside: out.append((frm, len(env) - 1))
    return out


def loudest_window(env: np.ndarray, a: int, b: int, hop_sec: float, max_sec: float) -> tuple[float, float]:
    """The window of at most max_sec inside [a, b] (hops) with the most energy."""
    n = b - a + 1; w = max(1, int(round(max_sec / hop_sec)))
    if n <= w: return a * hop_sec, (b + 1) * hop_sec
    power = 10 ** (env[a:b + 1] / 10.0)
    c = np.concatenate([[0.0], np.cumsum(power)])
    best = int(np.argmax(c[w:] - c[:-w]))
    return (a + best) * hop_sec, (a + best + w) * hop_sec


def split_long(env: np.ndarray, a: int, b: int, hop_sec: float, long_sec: float, edge_sec: float = 1.0) -> list[tuple[int, int]]:
    """A span longer than long_sec is a run of lines the gate could not tell apart (reverb tails, a held note into
    the next word): cut it at its deepest dip (the envelope smoothed over 150 ms), at least edge_sec from either
    end, and again until every part is short enough. The cut is the voice's own breath, never a word time."""
    if (b - a) * hop_sec <= long_sec: return [(a, b)]
    edge = int(edge_sec / hop_sec)
    if b - a <= 2 * edge: return [(a, b)]
    k = max(1, int(0.15 / hop_sec))
    smooth = np.convolve(env[a:b + 1], np.ones(k) / k, mode="same")
    cut = a + edge + int(np.argmin(smooth[edge: len(smooth) - edge]))
    return split_long(env, a, cut, hop_sec, long_sec, edge_sec) + split_long(env, cut + 1, b, hop_sec, long_sec, edge_sec)


def find_phrases(y: np.ndarray, sr: int, hop_sec: float = 0.01, min_sec: float = 0.35, max_sec: float = 6.0,
                 join_sec: float = 0.22, over_floor_db: float = 12.0, long_sec: float = 8.0) -> list[Phrase]:
    """Every phrase in a mono vocal: well above the room the stem leaves behind, within 30 dB of its loudest moment,
    and no longer than long_sec (a longer span is cut at its deepest breath)."""
    env = envelope(y, sr, hop_sec)
    if len(env) < 4: return []
    floor = percentile(env, 0.2); loudest = float(env.max())
    open_db = max(floor + over_floor_db, loudest - 30); close_db = open_db - 6
    join = max(1, round(join_sec / hop_sec))
    out: list[Phrase] = []
    cut = [piece for a, b in spans(env, open_db, close_db, join) for piece in split_long(env, a, b, hop_sec, long_sec)]
    for a, b in cut:
        start = a * hop_sec; end = min((b + 1) * hop_sec, len(y) / sr)
        if end - start < min_sec: continue
        seg = env[a:b + 1]
        out.append(Phrase(round(start, 3), round(end, 3), round(float(seg.max()), 2), round(float(seg.mean()), 2),
                          tuple(round(x, 3) for x in loudest_window(env, a, b, hop_sec, max_sec))))
    return out


def onsets(y: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
    """The voice's own syllable onsets (backtracked to the rise) and their strength, 0 to 1."""
    import librosa
    hop = 256
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    frames = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, backtrack=False, delta=0.07)
    if not len(frames): return np.zeros(0), np.zeros(0)
    back = librosa.onset.onset_backtrack(frames, env)
    strength = env[frames] / (env.max() + 1e-9)
    return librosa.frames_to_time(back, sr=sr, hop_length=hop), strength.astype(np.float64)
