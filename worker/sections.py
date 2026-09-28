"""The record's sections on its own grid, in 4-bar phrases: intro, verse, chorus, build, drop, break, outro.

A dance drop is the energy jump plus the kick and bass coming back (the low end below 150 Hz returning after a
phrase without it). A chorus is a loud phrase that is not a drop; the vocal map promotes a verse to a chorus when
the record's hook line sings in it. allin1 is not used: it runs Demucs weights internally (research only)."""
from __future__ import annotations
import numpy as np

PHRASE_BARS = 4
MAX_DROP_GROUPS = 4


def bar_levels(y: np.ndarray, sr: int, downbeats: np.ndarray, bar_sec: float) -> tuple[np.ndarray, np.ndarray]:
    """RMS of the mix and of its low end (below 150 Hz) per bar of the grid, each scaled to its own loudest bar."""
    from scipy.signal import butter, sosfiltfilt
    low = sosfiltfilt(butter(4, 150, "low", fs=sr, output="sos"), y)
    edges = list(downbeats) + [downbeats[-1] + bar_sec] if len(downbeats) else []
    e, lo = [], []
    for a, b in zip(edges[:-1], edges[1:]):
        i, j = int(a * sr), int(b * sr)
        if j <= i or i >= len(y): break
        e.append(float(np.sqrt(np.mean(y[i:j] ** 2)))); lo.append(float(np.sqrt(np.mean(low[i:j] ** 2))))
    e, lo = np.array(e), np.array(lo)
    return (e / (e.max() + 1e-9), lo / (lo.max() + 1e-9)) if len(e) else (e, lo)


def label_groups(energy: list[float], low: list[float]) -> list[str]:
    """One label per 4-bar group, from its mean energy and low end."""
    n = len(energy); out = ["verse"] * n
    if not n: return out
    drop = [False] * n
    start = -1
    for i in range(n):
        # A drop is the kick and bass coming back: the low end at 0.6 or more after a group with under half of it
        # (or an energy jump of 0.2), at no less than 0.55 energy. It lasts while the energy holds (within 0.1 of
        # where it started, or 0.8 and up), for at most 16 bars unless it stays at full energy.
        if low[i] < 0.6 or energy[i] < 0.55: continue
        # Against the lowest of the two groups before: a return that straddles a 4-bar line still counts.
        returned = i > 0 and (min(low[max(0, i - 2):i]) < 0.5 * low[i] or energy[i - 1] < energy[i] - 0.2)
        if returned: drop[i], start = True, i; continue
        holds = i > 0 and drop[i - 1] and (energy[i] >= 0.8 or (energy[i] >= energy[start] - 0.1 and i - start < MAX_DROP_GROUPS))
        drop[i] = bool(holds)
    for i in range(n):
        if drop[i]: out[i] = "drop"
        elif energy[i] >= 0.8: out[i] = "chorus"
        elif i > 0 and (low[i] < 0.35 or energy[i] < 0.5) and max(energy[:i]) >= 0.75: out[i] = "break"
    for i in range(n - 1):   # the phrase right before a drop is its build
        if drop[i + 1] and not drop[i]: out[i] = "build"
    k = 0
    while k < n and energy[k] < 0.6 and out[k] not in ("build", "drop"): out[k] = "intro"; k += 1
    k = n - 1
    while k > 0 and energy[k] < 0.6 and out[k] not in ("build", "drop") and not drop[k]: out[k] = "outro"; k -= 1
    return out


def refine_drops(groups: list[tuple], labels: list[str], lo: np.ndarray) -> list[tuple]:
    """A drop starts on the bar its low end returns, not on a 4-bar line: search from three bars before the group
    to its last bar and move the boundary there (the group before gives up or takes those bars)."""
    groups = list(groups)
    for i in range(1, len(groups)):
        if labels[i] != "drop" or labels[i - 1] == "drop": continue
        a, b = groups[i][0], groups[i][1]; best = a
        top = lo[a:b].max()
        for bar in range(max(groups[i - 1][0] + 1, a - 3), b):
            if lo[bar] >= 0.6 * top and lo[bar - 1] < 0.5 * lo[bar]: best = bar; break
        if best != a:
            pa, _, pe, pl = groups[i - 1]; _, b, ge, gl = groups[i]
            groups[i - 1] = (pa, best, pe, pl); groups[i] = (best, b, ge, gl)
    return groups


def sections_of(y: np.ndarray, sr: int, grid) -> list[dict]:
    """[{label, startBar, endBar, start, end, energy, low}], runs of the same label merged."""
    d = grid.downbeats
    if len(d) < 2: return []
    bar_sec = float(np.median(np.diff(d)))
    e, lo = bar_levels(y, sr, d, bar_sec)
    groups = []
    for g in range(0, len(e), PHRASE_BARS):
        groups.append((g, min(len(e), g + PHRASE_BARS), float(e[g:g + PHRASE_BARS].mean()), float(lo[g:g + PHRASE_BARS].mean())))
    labels = label_groups([x[2] for x in groups], [x[3] for x in groups])
    groups = refine_drops(groups, labels, lo)
    out: list[dict] = []
    for (a, b, en, lw), lab in zip(groups, labels):
        if out and out[-1]["label"] == lab:
            prev = out[-1]; w = prev["endBar"] - prev["startBar"]
            prev["energy"] = round((prev["energy"] * w + en * (b - a)) / (w + b - a), 3)
            prev["low"] = round((prev["low"] * w + lw * (b - a)) / (w + b - a), 3)
            prev["endBar"] = b; prev["end"] = round(float(d[b]) if b < len(d) else float(d[-1] + bar_sec * (b - len(d) + 1)), 3)
            continue
        out.append({"label": lab, "startBar": a, "endBar": b, "start": round(float(d[a]), 3),
                    "end": round(float(d[b]) if b < len(d) else float(d[-1] + bar_sec * (b - len(d) + 1)), 3),
                    "energy": round(en, 3), "low": round(lw, 3)})
    return out


def merge_runs(sections: list[dict]) -> list[dict]:
    """Neighbours with the same label become one section (after a verse was promoted to a chorus, say)."""
    out: list[dict] = []
    for s in sections:
        if out and out[-1]["label"] == s["label"]:
            p = out[-1]; w, v = p["endBar"] - p["startBar"], s["endBar"] - s["startBar"]
            p["energy"] = round((p["energy"] * w + s["energy"] * v) / max(1, w + v), 3)
            p["low"] = round((p["low"] * w + s["low"] * v) / max(1, w + v), 3)
            p["endBar"], p["end"] = s["endBar"], s["end"]
            continue
        out.append(dict(s))
    return out


def section_at(sections: list[dict], t: float) -> dict | None:
    for s in sections:
        if s["start"] <= t < s["end"]: return s
    return sections[-1] if sections and t >= sections[-1]["end"] else (sections[0] if sections else None)
