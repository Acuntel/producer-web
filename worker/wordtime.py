"""Word starts moved onto the voice's own onsets. Whisper's sung word times run late (0.22 to 0.65 s, MIREX 2024;
measured here at a median of 0.36 s on a CC BY acapella), so a word keeps its label and takes its time from the
syllable onset it belongs to: the first word of a phrase starts at the phrase's first strong onset, and the rest are
matched in order to the onsets nearest their own time less the record's lag (a monotonic alignment, stronger onsets
preferred). A word no onset fits keeps Whisper's time less the lag. Whisper's own time stays on the word as `asr`."""
from __future__ import annotations
import numpy as np

REACH = 0.8        # seconds: how far an onset may sit from a word's lag-corrected time
STRONG = 0.5       # share of the phrase's strongest onset that counts as a word's start


def lag_of(words: list[dict], ons: np.ndarray, strength: np.ndarray) -> float:
    """How late Whisper runs on this voice: the median gap from the nearest strong onset before each word."""
    if not len(ons): return 0.0
    strong = ons[strength >= 0.3 * (strength.max() if len(strength) else 1.0)]
    gaps = []
    for w in words:
        before = strong[(strong <= w["start"] + 0.05) & (strong >= w["start"] - REACH)]
        if len(before): gaps.append(w["start"] - float(before.max()))
    return float(np.median(gaps)) if gaps else 0.0


def align(words: list[dict], cand: np.ndarray, power: np.ndarray, lag: float) -> list[int | None]:
    """Each word to one onset index (or None), in order, minimising |onset - (asr - lag)| less 0.3 x strength."""
    n, m = len(words), len(cand)
    if not n or not m: return [None] * n
    target = np.array([w["start"] - lag for w in words])
    INF = 1e9
    # dp[i][j]: best cost with the first i words placed and every onset before j used or skipped.
    dp = np.full((n + 1, m + 1), INF); dp[0, :] = 0.0
    take = np.zeros((n + 1, m + 1), dtype=np.int8)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            d = abs(cand[j - 1] - target[i - 1])
            use = dp[i - 1, j - 1] + (d - 0.3 * power[j - 1] if d <= REACH else INF)
            skip_onset = dp[i, j - 1]
            skip_word = dp[i - 1, j] + REACH          # a word no onset fits costs as much as the worst fit
            best = min(use, skip_onset, skip_word)
            dp[i, j] = best
            take[i, j] = 1 if best == use else (2 if best == skip_onset else 3)
    out: list[int | None] = [None] * n
    i, j = n, m
    while i > 0 and j > 0:
        t = take[i, j]
        if t == 1: out[i - 1] = j - 1; i -= 1; j -= 1
        elif t == 2: j -= 1
        else: i -= 1
    return out


def refine(per_phrase: list[list[dict]], spans: list[tuple[float, float]], ons: np.ndarray, strength: np.ndarray) -> float:
    """Move every word's start onto its onset, in place. Returns the lag it measured."""
    every = [w for ws in per_phrase for w in ws]
    lag = lag_of(every, ons, strength)
    for ws, (a, b) in zip(per_phrase, spans):
        if not ws: continue
        m = (ons >= a - 0.05) & (ons < b)
        cand, power = ons[m], strength[m] / (strength[m].max() + 1e-9) if m.any() else strength[m]
        for w in ws: w["asr"] = w["start"]
        if not len(cand):
            for w in ws: w["start"] = round(max(a, w["asr"] - lag), 3)
            continue
        first = cand[power >= STRONG]
        ws[0]["start"] = round(float(first[0] if len(first) else cand[0]), 3)
        rest = ws[1:]
        pick = align(rest, cand[cand > ws[0]["start"] + 0.05], power[cand > ws[0]["start"] + 0.05], lag)
        later = cand[cand > ws[0]["start"] + 0.05]
        for w, k in zip(rest, pick):
            w["start"] = round(float(later[k]) if k is not None else max(a, w["asr"] - lag), 3)
        for x, y in zip(ws, ws[1:] + [None]):   # a word ends where the next begins, or where it ended before
            x["end"] = round(max(x["start"] + 0.05, y["start"] if y else x["end"]), 3)
    return round(lag, 3)
