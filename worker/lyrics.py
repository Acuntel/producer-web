"""Every sung word with a time: faster-whisper (MIT) with whisper-large-v3-turbo (MIT) and word_timestamps on,
run on the isolated vocal. The words label the voice's own phrases; cuts never come from them.

VOCAL_WHISPER_MODEL picks the model ("large-v3-turbo" by default; "small" is the fast fallback the listening pass
already bakes into the image). Any failure returns no words and the reason, never an exception."""
from __future__ import annotations
import os, re

_models: dict[str, object] = {}
MODEL = os.environ.get("VOCAL_WHISPER_MODEL", "large-v3-turbo")
VAD = os.environ.get("VOCAL_WHISPER_VAD", "0") == "1"


def model(name: str = MODEL):
    from faster_whisper import WhisperModel
    if name not in _models:
        _models[name] = WhisperModel(name, device="cpu", compute_type="int8", cpu_threads=int(os.environ.get("OMP_NUM_THREADS", "4")))
    return _models[name]


def words(vocal_path: str, name: str = MODEL, max_sec: float = 480.0) -> dict:
    """{model, language, words: [{w, start, end, p}]} on the vocal's own timeline."""
    try:
        # No VAD: Silero is a speech detector and drops sung lines (measured on a CC BY acapella: 26 words with it,
        # 47 without, the whole chorus missing with it). What it would have caught, a "thank you" hallucinated on
        # silence, falls outside every phrase and is dropped by assign().
        segs, info = model(name).transcribe(vocal_path, beam_size=1, word_timestamps=True, vad_filter=VAD, condition_on_previous_text=False)
        out = []
        for s in segs:
            if s.start > max_sec: break
            for w in s.words or []:
                t = w.word.strip()
                if t: out.append({"w": t, "start": round(float(w.start), 3), "end": round(float(w.end), 3), "p": round(float(w.probability), 3)})
        return {"model": name, "language": info.language, "words": out}
    except Exception as e:
        return {"model": name, "language": None, "words": [], "error": str(e)[:200]}


def assign(ws: list[dict], spans: list[tuple[float, float]], reach: float = 0.6) -> list[list[dict]]:
    """Each word to the phrase it overlaps most, or to the nearest phrase within `reach` seconds when it overlaps none
    (sung word times drift). A word no phrase claims is dropped: it was a breath, a bleed or a guess."""
    out: list[list[dict]] = [[] for _ in spans]
    for w in ws:
        best, best_ov = -1, 0.0
        for i, (a, b) in enumerate(spans):
            ov = min(b, w["end"]) - max(a, w["start"])
            if ov > best_ov: best, best_ov = i, ov
        if best < 0:
            mid = (w["start"] + w["end"]) / 2
            dist = [max(a - mid, mid - b, 0.0) for a, b in spans]
            if dist and min(dist) <= reach: best = int(min(range(len(dist)), key=dist.__getitem__))
        if best >= 0: out[best].append(w)
    return out


def norm(text: str) -> list[str]:
    return [t for t in re.sub(r"[^a-z0-9' ]+", " ", text.lower()).replace("'", "").split() if t]


def line_similarity(a: list[str], b: list[str]) -> float:
    """How much two lines share, 0 to 1, by the longest common run of words (order kept)."""
    if not a or not b: return 0.0
    from difflib import SequenceMatcher
    return SequenceMatcher(None, a, b, autojunk=False).ratio()
