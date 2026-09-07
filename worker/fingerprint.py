"""Fingerprint cache: the same record analyzed twice is served from storage the second time,
for anyone. Chromaprint (fpcalc) raw fingerprints on the first 120 s, compared by bit
similarity with a small alignment search, so a re-encode or a different rip of one record
still matches (an exact hash does not survive an mp3 round trip)."""
from __future__ import annotations
import hashlib, json, subprocess

FRAMES = 120           # seconds fingerprinted
MATCH = 0.82           # fraction of matching bits to call two fingerprints the same record


def raw_fingerprint(wav_path: str) -> tuple[list[int], float] | None:
    try:
        r = subprocess.run(["fpcalc", "-raw", "-json", "-length", str(FRAMES), wav_path], capture_output=True, text=True, timeout=60)
        d = json.loads(r.stdout or "{}")
        fp = d.get("fingerprint")
        if not fp or not isinstance(fp, list): return None
        return [int(x) & 0xFFFFFFFF for x in fp], float(d.get("duration") or 0.0)
    except Exception:
        return None


def key_of(fp: list[int]) -> str:
    return hashlib.sha1(",".join(str(x) for x in fp[:64]).encode()).hexdigest()[:24]


def _bits(x: int) -> int: return bin(x).count("1")


def similarity(a: list[int], b: list[int], max_offset: int = 8) -> float:
    """Best fraction of equal bits over a small frame offset search."""
    if not a or not b: return 0.0
    best = 0.0
    for off in range(-max_offset, max_offset + 1):
        if off >= 0: x, y = a[off:], b
        else: x, y = a, b[-off:]
        n = min(len(x), len(y), 600)
        if n < 60: continue
        wrong = sum(_bits(x[i] ^ y[i]) for i in range(n))
        sim = 1.0 - wrong / (32.0 * n)
        if sim > best: best = sim
    return round(best, 4)


def same_record(a: list[int], b: list[int]) -> bool: return similarity(a, b) >= MATCH
