"""The melody of an isolated vocal: f0 per 10 ms over each phrase, cut into notes, and where each phrase sits
against the record's key.

The tracker is librosa.pyin (ISC), run only over the phrases, never over the silence between them. RMVPE is the
better singing tracker (Apache code, MIT weights) and plugs in here when it is installed; until then pyin is it,
and the map says which one ran."""
from __future__ import annotations
import numpy as np

SR = 16000
HOP = 160            # 10 ms
NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
PC = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
MAJOR = [0, 2, 4, 5, 7, 9, 11]
MINOR = [0, 2, 3, 5, 7, 8, 10]
MODEL = "pyin"


def f0_track(y: np.ndarray, spans: list[tuple[float, float]]) -> np.ndarray:
    """MIDI per 10 ms hop over the whole vocal (NaN where unvoiced or outside every span). y is mono at 16 kHz."""
    import librosa
    n = len(y) // HOP + 1
    out = np.full(n, np.nan)
    for a, b in spans:
        i, j = max(0, int(a * SR) - 512), min(len(y), int(b * SR) + 512)
        if j - i < 2048: continue
        f0, voiced, _ = librosa.pyin(y[i:j], fmin=65.0, fmax=1050.0, sr=SR, frame_length=1024, hop_length=HOP, center=True)
        m = np.where(voiced & np.isfinite(f0), librosa.hz_to_midi(np.where(np.isfinite(f0), f0, 1.0)), np.nan)
        k = i // HOP
        out[k:k + len(m)] = m[: max(0, n - k)]
    return out


def notes_of(midi: np.ndarray, a: float, b: float, min_sec: float = 0.06) -> list[dict]:
    """Stable-pitch runs inside [a, b]: a new note starts when the rounded pitch changes and holds, or after a gap."""
    i, j = int(a * SR / HOP), min(len(midi), int(b * SR / HOP) + 1)
    seg = midi[i:j]
    if not len(seg): return []
    # A 5-hop median smooths vibrato and pyin's octave flicker without moving note boundaries much.
    sm = seg.copy()
    for k in range(len(seg)):
        w = seg[max(0, k - 2): k + 3]; w = w[np.isfinite(w)]
        sm[k] = np.median(w) if len(w) >= 3 else np.nan
    out: list[dict] = []
    run_start, run_vals = None, []
    def close(end_k: int) -> None:
        if run_start is None or not run_vals: return
        if (end_k - run_start) * HOP / SR >= min_sec:
            out.append({"start": round((i + run_start) * HOP / SR, 3), "end": round((i + end_k) * HOP / SR, 3), "midi": round(float(np.median(run_vals)), 2)})
    for k, v in enumerate(sm):
        if not np.isfinite(v):
            close(k); run_start, run_vals = None, []; continue
        if run_start is None: run_start, run_vals = k, [v]; continue
        if abs(round(v) - round(float(np.median(run_vals)))) >= 1 and (k + 2 < len(sm) and np.isfinite(sm[k + 2]) and abs(round(sm[k + 2]) - round(v)) < 1):
            close(k); run_start, run_vals = k, [v]; continue
        run_vals.append(v)
    close(len(sm))
    return out[:96]


def key_of(name: str | None) -> tuple[int, list[int]] | None:
    """"A minor" -> (9, MINOR scale)."""
    if not name: return None
    parts = name.strip().split()
    if not parts or parts[0] not in PC: return None
    return PC[parts[0]], (MINOR if len(parts) > 1 and parts[1].lower().startswith("min") else MAJOR)


def weights(notes: list[dict]) -> np.ndarray:
    """Duration-weighted pitch-class histogram of a phrase's notes."""
    h = np.zeros(12)
    for n in notes: h[int(round(n["midi"])) % 12] += n["end"] - n["start"]
    return h


def key_rel(notes: list[dict], source_key: str | None) -> tuple[int | None, float | None]:
    """(keyRelToSource, inKey). inKey is the share of sung time inside the record's scale. keyRelToSource is the
    shift, -5 to +6 semitones, that best fits the phrase to the record's scale (0 on a tie): 0 means the phrase sits
    in the record's key, +2 means it sings as if the key were two semitones higher."""
    k = key_of(source_key); h = weights(notes)
    if k is None or h.sum() <= 0: return None, None
    tonic, scale = k
    def fit(shift: int) -> float: return float(sum(h[(tonic + shift + s) % 12] for s in scale) / h.sum())
    in_key = fit(0)
    best, best_fit = 0, in_key
    for s in (1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6):
        f = fit(s)
        if f > best_fit + 0.08: best, best_fit = s, f   # a clear win only: a short line fits several keys
    return best, round(in_key, 3)


def contour(midi: np.ndarray, a: float, b: float, points: int = 24) -> np.ndarray | None:
    """The phrase's pitch shape relative to its own median, resampled to a fixed length (voiced hops only)."""
    seg = midi[int(a * SR / HOP): int(b * SR / HOP) + 1]
    v = seg[np.isfinite(seg)]
    if len(v) < 8: return None
    x = np.interp(np.linspace(0, len(v) - 1, points), np.arange(len(v)), v)
    return x - np.median(x)


def similarity(c1: np.ndarray | None, c2: np.ndarray | None) -> float:
    """How alike two contours are, 0 to 1: 1 minus their mean absolute difference over two semitones."""
    if c1 is None or c2 is None: return 0.0
    return float(max(0.0, 1.0 - np.mean(np.abs(c1 - c2)) / 2.0))
