"""Melody-track measurements for lakh.py: contour, interval size, range,
2-bar repetition, and a repetition-based structure guess (lakh has no chords,
so structure comes from self-similar 8-bar rhythm windows, not section
semantics - see structure_from_repetition for the exact, documented rule).
"""
from __future__ import annotations

from collections import defaultdict

from midi_parse import majority_grid, quantize


def melody_contour(notes: list[dict], bar_ticks: int, melody_channel: int) -> str | None:
    span = 8 * bar_ticks
    early = [n for n in notes if n["channel"] == melody_channel and n["start"] < span]
    if len(early) < 4:
        return None
    windows = [[] for _ in range(4)]
    win_ticks = span / 4
    for n in early:
        idx = min(int(n["start"] // win_ticks), 3)
        windows[idx].append(n["pitch"])
    means = [sum(w) / len(w) for w in windows if w]
    if len(means) < 3:
        return None
    if max(means) - min(means) < 2:
        return "flat"
    deltas = [b - a for a, b in zip(means, means[1:])]
    signs = [1 if d > 0.5 else (-1 if d < -0.5 else 0) for d in deltas]
    nonzero = [s for s in signs if s != 0]
    if not nonzero:
        return "flat"
    if all(s > 0 for s in nonzero):
        return "rise"
    if all(s < 0 for s in nonzero):
        return "fall"
    changes = sum(1 for a, b in zip(nonzero, nonzero[1:]) if a != b)
    if changes == 1 and nonzero[0] > 0:
        return "arch"
    return "wave"


def interval_and_range(notes: list[dict], melody_channel: int) -> tuple[float | None, int | None]:
    pitches = [n["pitch"] for n in notes if n["channel"] == melody_channel]
    if len(pitches) < 2:
        return None, (max(pitches) - min(pitches) if pitches else None)
    diffs = [abs(b - a) for a, b in zip(pitches, pitches[1:])]
    return round(sum(diffs) / len(diffs), 3), max(pitches) - min(pitches)


def repetition_ratio(notes: list[dict], bar_ticks: int, melody_channel: int) -> float | None:
    cell_ticks = 2 * bar_ticks
    cells: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for n in notes:
        if n["channel"] != melody_channel:
            continue
        idx = n["start"] // cell_ticks
        rel_tick = n["start"] - idx * cell_ticks
        cells[idx].append((rel_tick, n["pitch"]))
    qualifying = {k: v for k, v in cells.items() if v}
    if len(qualifying) < 2:
        return None
    keyed = {}
    for idx, notes_in_cell in sorted(qualifying.items()):
        first_pitch = notes_in_cell[0][1]
        pattern = tuple((round(t / (bar_ticks / 16)), p - first_pitch) for t, p in notes_in_cell)
        keyed[idx] = pattern
    seen: set[tuple] = set()
    repeats = 0
    for idx in sorted(keyed):
        pattern = keyed[idx]
        if pattern in seen:
            repeats += 1
        seen.add(pattern)
    return round(repeats / len(keyed), 4)


def structure_from_repetition(notes: list[dict], bar_ticks: int, drum_notes: list[dict]) -> tuple[str | None, int | None, float | None]:
    """8-bar windows fingerprinted by their combined kick+snare 16-grid. The
    most-repeated fingerprint (>=2 occurrences) is called the chorus ('C');
    the first window is 'I' unless it IS that chorus fingerprint; the last is
    'O' unless it is; each other new fingerprint gets 'V' then 'B' then 'X'.
    This is a structural-repetition guess, not a semantic verse/chorus
    classifier - lakh has no lyrics or chords to tell the two apart otherwise.
    """
    if not drum_notes:
        return None, None, None
    n_bars = max(n["start"] // bar_ticks for n in drum_notes) + 1
    win_bars = 8
    n_windows = max(1, -(-int(n_bars) // win_bars))
    fingerprints = []
    for w in range(n_windows):
        lo, hi = w * win_bars * bar_ticks, (w + 1) * win_bars * bar_ticks
        window_notes = [n for n in drum_notes if lo <= n["start"] < hi]
        hits = defaultdict(set)
        for n in window_notes:
            _bar, slot = quantize(n["start"] - lo, bar_ticks, 16)
            hits[slot].add(n["start"] // bar_ticks)
        fingerprints.append(majority_grid(hits, win_bars, 16))

    counts: dict[str, int] = defaultdict(int)
    for fp in fingerprints:
        counts[fp] += 1
    chorus_fp = max(counts, key=counts.get) if counts and max(counts.values()) >= 2 else None

    codes: dict[str, str] = {}
    new_code_order = ["V", "B", "X"]
    new_idx = 0
    out_codes = []
    for i, fp in enumerate(fingerprints):
        if fp == chorus_fp:
            code = "C"
        elif fp in codes:
            code = codes[fp]
        elif i == 0:
            code = "I"
        elif i == len(fingerprints) - 1:
            code = "O"
        else:
            code = new_code_order[min(new_idx, len(new_code_order) - 1)]
            new_idx += 1
        codes[fp] = code
        out_codes.append(code)

    structure = " ".join(out_codes)
    first_chorus_bar = None
    chorus_windows = 0
    for i, code in enumerate(out_codes):
        if code == "C":
            chorus_windows += 1
            if first_chorus_bar is None:
                first_chorus_bar = i * win_bars
    chorus_share = round(chorus_windows / len(out_codes), 4) if out_codes else None
    return structure, first_chorus_bar, chorus_share
