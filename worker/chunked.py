"""Chunked overlap-add inference for the separators: fixed-length windows, linear crossfades between them."""
from __future__ import annotations
import numpy as np


def _window(n: int, fade: int, first: bool, last: bool) -> np.ndarray:
    w = np.ones(n, dtype=np.float32)
    if not first: w[:fade] = np.linspace(0, 1, fade, dtype=np.float32)
    if not last: w[-fade:] = np.linspace(1, 0, fade, dtype=np.float32)
    return w


def overlap_add(fn, mix: np.ndarray, chunk: int, overlap: int = 2, batch: int = 1, progress=None, first: tuple[int, int] | None = None, on_first=None) -> np.ndarray:
    """fn maps a (b, 2, chunk) float32 array to (b, stems, 2, chunk) or (b, 2, chunk). mix is (2, n).
    Returns (stems, 2, n): each window weighted by a crossfade, the sum divided by the summed weights.
    With first=(a, b) in samples, the windows that cover that span run before the rest, and on_first gets the
    finished span (stems, 2, b - a) the moment they are done: the hook lands first, with no work done twice."""
    n = mix.shape[1]
    step = chunk // max(1, overlap); fade = chunk // 10; border = chunk - step
    x = np.pad(mix, ((0, 0), (border, border)), mode="reflect" if n > 2 * border else "constant")
    total = x.shape[1]
    starts = list(range(0, max(1, total - border), step))
    if first:
        a, b = first[0] + border, first[1] + border
        head = [s for s in starts if s < b and s + chunk > a]
        starts = head + [s for s in starts if s not in head]
        pending = len(head)
    out = None; weight = np.zeros(total, dtype=np.float32)
    for bi in range(0, len(starts), batch):
        group = starts[bi: bi + batch]
        parts = []
        for s in group:
            part = x[:, s: s + chunk]
            if part.shape[1] < chunk:
                pad = chunk - part.shape[1]
                part = np.pad(part, ((0, 0), (0, pad)), mode="reflect" if part.shape[1] > pad else "constant")
            parts.append(part)
        y = np.asarray(fn(np.stack(parts).astype(np.float32)))
        if y.ndim == 3: y = y[:, None]
        if out is None: out = np.zeros((y.shape[1], 2, total), dtype=np.float32)
        for k, s in enumerate(group):
            length = min(chunk, total - s)
            w = _window(chunk, fade, s == 0, s + chunk >= total)[:length]
            out[:, :, s: s + length] += y[k][:, :, :length] * w
            weight[s: s + length] += w
        if progress: progress(min(len(starts), bi + batch), len(starts))
        if first and on_first and pending and bi + batch >= pending:
            on_first(out[:, :, a:b] / np.maximum(weight[a:b], 1e-6)); pending = 0
    out /= np.maximum(weight, 1e-6)
    return out[:, :, border: border + n]
