"""Identify: what record is this, and what is in this mix. A short cut of audio goes to
Shazam's recognition service (shazamio) and comes back as a named record with its position
and the DJ's pitch adjustment. A mix is cut every few seconds and the hits are merged into
a tracklist with timestamps. No key needed; about 0.2 s per cut from a server."""
from __future__ import annotations
import asyncio, os, subprocess, tempfile
from concurrent.futures import ThreadPoolExecutor

CUT_SEC = 12          # 12 s cuts identify reliably; 6 s cuts sometimes pick the wrong version
STEP_SEC = 60         # coarse pass: a cut every minute catches any record that lasts 70 s in the mix; boundaries are refined after
REFINE_SEC = 30       # a boundary between two records is narrowed to this by midpoint cuts
MERGE_WINDOW = 90     # the same record heard again within 90 s is one entry (two decks layered, a long blend)
# Two threads: the pacing gate below bounds throughput anyway, and forked child processes under the live server
# hung on every request (measured: all timeouts in the pool, 0.75 s from the server process itself).
WORKERS = max(1, min(4, int(os.environ.get("IDENTIFY_WORKERS", "2"))))
# The recognition service blocks an address after a burst (measured: about 20 requests in four seconds are answered,
# then every request times out, and the block outlasted five minutes of one ping a minute). So the worker never
# gets near it: a file-locked gate shared by every process allows at most RATE requests per second and at most
# PER_MINUTE requests in any sliding minute, and a tracklist spends its cuts where the audio changes.
RATE = float(os.environ.get("IDENTIFY_RATE", "0.5"))
PER_MINUTE = int(os.environ.get("IDENTIFY_PER_MINUTE", "12"))
MAX_CUTS = int(os.environ.get("IDENTIFY_MAX_CUTS", "60"))
_GATE = os.path.join(tempfile.gettempdir(), "producer-identify.gate")


def _pace() -> None:
    """Shared across processes: waits until both the per-second and the per-minute budgets allow one request."""
    import fcntl, json as _j, time as _t
    while True:
        with open(_GATE, "a+") as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            try:
                f.seek(0); raw = f.read().strip()
                try: stamps = [float(x) for x in _j.loads(raw)] if raw.startswith("[") else []
                except Exception: stamps = []
                now = _t.time(); stamps = [x for x in stamps if now - x < 60.0]
                ok_rate = not stamps or now - max(stamps) >= 1.0 / RATE
                ok_min = len(stamps) < PER_MINUTE
                if ok_rate and ok_min:
                    stamps.append(now); f.seek(0); f.truncate(); f.write(_j.dumps(stamps)); return
                wait = max(0.05, (1.0 / RATE - (now - max(stamps))) if not ok_rate else (60.0 - (now - min(stamps)) + 0.05))
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)
        _t.sleep(min(wait, 5.0))


def segments(path: str, duration: float, min_gap: float = 40.0) -> list[tuple[float, float]]:
    """Where the mix changes: a self-similarity novelty curve over a log-mel + chroma frame per second, with a
    16 s checkerboard each side; peaks at least `min_gap` apart. Tuned on six minutes of a fast-mixing Essential
    Mix: all six known changes found within 20 s with nine boundaries. Returns (time, strength) pairs in time order."""
    import numpy as np, librosa
    y, sr = librosa.load(path, sr=8000, mono=True)
    hop = sr
    mel = librosa.power_to_db(librosa.feature.melspectrogram(y=y, sr=sr, n_fft=2048, hop_length=hop, n_mels=40), ref=np.max)
    chroma = librosa.feature.chroma_stft(y=y, sr=sr, n_fft=2048, hop_length=hop)
    feat = np.vstack([(mel - mel.mean(axis=1, keepdims=True)) / (mel.std(axis=1, keepdims=True) + 1e-6), chroma * 3.0])
    fn = feat / (np.linalg.norm(feat, axis=0, keepdims=True) + 1e-9)
    n = fn.shape[1]
    if n < 40: return []
    k = 16
    nov = np.zeros(n)
    for i in range(k, n - k):
        a = fn[:, i - k:i].mean(axis=1); b = fn[:, i:i + k].mean(axis=1)
        nov[i] = 1.0 - float(a @ b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9)
    if nov.max() > 0: nov = nov / nov.max()
    w = max(1, int(min_gap / 2))
    peaks = librosa.util.peak_pick(nov, pre_max=w // 2, post_max=w // 2, pre_avg=w, post_avg=w, delta=0.02, wait=w)
    return [(float(p), float(nov[p])) for p in peaks if 10.0 < p < duration - 10.0]


def _cut(src: str, start: float, dur: float, dst: str) -> str:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{max(0.0, start):.2f}", "-t", f"{dur:.2f}", "-i", src, "-ac", "1", "-ar", "16000", dst], check=True)
    return dst


def _parse(out: dict) -> dict | None:
    tr = out.get("track") or {}
    if not tr.get("title"): return None
    m = (out.get("matches") or [{}])[0]
    meta = {}
    for s in tr.get("sections") or []:
        for md in s.get("metadata") or []:
            if md.get("title") and md.get("text"): meta[md["title"].lower()] = md["text"]
    prov = {}
    for p in (tr.get("hub") or {}).get("providers") or []:
        for a in p.get("actions") or []:
            if a.get("uri"): prov[p.get("type", "").lower()] = a["uri"]
    tskew = float(m.get("timeskew") or 0.0); fskew = float(m.get("frequencyskew") or 0.0)
    return {
        "key": str(tr.get("key") or ""), "title": tr.get("title"), "artist": tr.get("subtitle"), "isrc": tr.get("isrc"),
        "album": meta.get("album"), "label": meta.get("label"), "year": meta.get("released"), "genre": (tr.get("genres") or {}).get("primary"),
        "cover": ((tr.get("images") or {}).get("coverart")), "url": tr.get("url"), "providers": prov,
        "offsetSec": round(float(m.get("offset") or 0.0), 1), "timeSkew": round(tskew, 4), "pitchPct": round(fskew * 100, 2),
        # A pitched record skews time and frequency together; a lone hit whose skews disagree is a weaker match.
        "confident": abs(tskew) < 0.005 or abs(tskew - fskew) < 0.008,
    }


TIMEOUT_SEC = float(os.environ.get("IDENTIFY_TIMEOUT", "8"))
COOLDOWN_SEC = float(os.environ.get("IDENTIFY_COOLDOWN", "600"))
_COOL = os.path.join(tempfile.gettempdir(), "producer-identify.cool")


def cooling() -> float:
    """Seconds left of a cooldown after consecutive timeouts (the service blocking this address), else 0."""
    import time as _t
    try:
        with open(_COOL) as f: until, n = f.read().split()
        return max(0.0, float(until) - _t.time())
    except Exception: return 0.0


def _note_outcome(timed_out: bool) -> None:
    """Three timeouts in a row start a cooldown; one answer clears the count."""
    import time as _t
    try:
        try:
            with open(_COOL) as f: until, n = f.read().split(); n = int(n)
        except Exception: until, n = "0", 0
        n = n + 1 if timed_out else 0
        new_until = _t.time() + COOLDOWN_SEC if n >= 3 else float(until)
        with open(_COOL, "w") as f: f.write(f"{new_until:.1f} {n}")
        if n == 3: print(f"identify: three timeouts in a row, cooling down for {int(COOLDOWN_SEC)} s", flush=True)
    except Exception: pass


def identify_bytes(path: str) -> dict | None:
    """One short file (already cut). Runs its own event loop so worker threads can call it. A hung request is
    cut off at TIMEOUT_SEC; three in a row start a cooldown so nothing keeps knocking on a blocking service."""
    import time as _t
    from shazamio import Shazam
    async def go():
        return await asyncio.wait_for(Shazam().recognize(path), timeout=TIMEOUT_SEC)
    if cooling() > 0: return None
    _pace()
    t0 = _t.time()
    try:
        r = _parse(asyncio.run(go()))
        _note_outcome(False)
    except Exception as e:
        timed = isinstance(e, (asyncio.TimeoutError, TimeoutError)) or "Timeout" in type(e).__name__
        _note_outcome(timed)
        print(f"identify failed after {_t.time()-t0:.1f}s: {str(e)[:120] or type(e).__name__}", flush=True)
        return None
    if os.environ.get("IDENTIFY_DEBUG"): print(f"identify {os.path.basename(path)} {_t.time()-t0:.2f}s {'hit' if r else 'miss'}", flush=True)
    return r


def identify_file(path: str, at: float | None = None, duration: float | None = None) -> dict | None:
    """A whole record: cut CUT_SEC seconds from a third of the way in (or at `at`), identify that."""
    if duration is None:
        try: duration = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True, timeout=30).stdout.strip() or 0)
        except Exception: duration = 0.0
    start = at if at is not None else max(0.0, min(duration / 3.0, max(0.0, duration - CUT_SEC)))
    with tempfile.TemporaryDirectory(prefix="ident-") as td:
        cut = _cut(path, start, min(CUT_SEC, duration or CUT_SEC), os.path.join(td, "cut.wav"))
        r = identify_bytes(cut)
        if r is None and duration > 3 * CUT_SEC and cooling() <= 0:
            # A second cut two thirds in: intros are often unidentifiable (a DJ's own edit, a long ambient open).
            cut2 = _cut(path, duration * 2 / 3, CUT_SEC, os.path.join(td, "cut2.wav"))
            r = identify_bytes(cut2)
        if r: r["atSec"] = round(start, 1)
        return r


def display_name(ident: dict | None) -> str | None:
    if not ident or not ident.get("title"): return None
    return f"{ident['artist']} - {ident['title']}" if ident.get("artist") else ident["title"]


def _one_cut(args) -> tuple[float, dict | None]:
    path, s, cut, td = args
    p = _cut(path, s, cut, os.path.join(td, f"c{int(s)}.wav"))
    r = identify_bytes(p)
    try: os.remove(p)
    except OSError: pass
    return s, r


def tracklist(path: str, duration: float, step: float = STEP_SEC, cut: float = CUT_SEC, workers: int = WORKERS, progress=None) -> list[dict]:
    """Cuts land where the audio says the record changed: one mid-segment cut per segment (two for a long one),
    then a second chance next to every miss, then a coarse safety pass only where the segments are long.
    Capped at MAX_CUTS so a run can never approach the service's block."""
    hits: dict[float, dict | None] = {}
    found: list[tuple[float, float]] = []
    try: found = segments(path, duration)
    except Exception as e: print("segments failed", str(e)[:120], flush=True)
    # More changes than the budget allows: keep the strongest ones (the real record changes), in time order.
    keep = int(MAX_CUTS * 0.7)
    if len(found) > keep: found = sorted(sorted(found, key=lambda t: -t[1])[:keep])
    bounds = [t for t, _ in found]
    edges = [0.0] + bounds + [duration]
    plan: list[float] = []
    for a, b in zip(edges, edges[1:]):
        if b - a < cut + 4: continue
        mid = round((a + b) / 2 - cut / 2, 1)
        plan.append(max(0.0, mid))
        if b - a > 240: plan.append(round(a + (b - a) * 0.25 - cut / 2, 1)); plan.append(round(a + (b - a) * 0.75 - cut / 2, 1))
    if not bounds: plan = [float(s) for s in range(0, max(1, int(duration - cut / 2)), int(step))]
    plan = sorted({p for p in plan if 0 <= p and p + cut <= duration + 1})[:MAX_CUTS]
    total_est = min(MAX_CUTS, len(plan) + len(plan) // 3 + 2)
    done = 0
    with tempfile.TemporaryDirectory(prefix="tl-") as td, ThreadPoolExecutor(max_workers=workers) as ex:
        def run(starts: list[float]):
            nonlocal done
            todo = [s for s in starts if s not in hits and s + cut <= duration + 1 and len(hits) < MAX_CUTS]
            for s, r in ex.map(_one_cut, [(path, s, cut, td) for s in todo], chunksize=1):
                hits[s] = r; done += 1
                if progress and done % 3 == 0: progress(min(done, total_est), total_est, merge_hits(hits, cut))
        run(plan)
        # Second chance next to every miss (a mid-blend cut often names nothing; 20 s later it does).
        retry = [round(s + 20.0, 1) for s in sorted(hits) if hits[s] is None]
        run(retry)
        # Two neighbouring hits that disagree with more than 90 s between them: one midpoint cut to place the change.
        keys = sorted(k for k in hits if hits[k])
        mids = [round((a + b) / 2, 1) for a, b in zip(keys, keys[1:]) if b - a > 90 and hits[a]["key"] != hits[b]["key"]]
        run(mids)
    print(f"tracklist: {len(bounds)} boundaries, {len(hits)} cuts, {sum(1 for v in hits.values() if v)} named", flush=True)
    return merge_hits(hits, cut)


def merge_hits(hits: dict[float, dict | None], cut: float = CUT_SEC) -> list[dict]:
    entries: list[dict] = []
    for s in sorted(hits):
        r = hits.get(s)
        if not r: continue
        prev = next((e for e in reversed(entries) if e["key"] == r["key"] and s - e["end"] <= MERGE_WINDOW), None)
        if prev:
            prev["end"] = max(prev["end"], s + cut); prev["hits"] += 1
            prev["pitchPct"] = round((prev["pitchPct"] * (prev["hits"] - 1) + r["pitchPct"]) / prev["hits"], 2)
            if r["confident"]: prev["confident"] = True
            continue
        entries.append({"key": r["key"], "title": r["title"], "artist": r["artist"], "isrc": r.get("isrc"), "album": r.get("album"), "label": r.get("label"), "year": r.get("year"), "cover": r.get("cover"), "url": r.get("url"),
                        "start": s, "end": s + cut, "hits": 1, "pitchPct": r["pitchPct"], "offsetSec": r["offsetSec"], "confident": r["confident"]})
    for e in entries:
        e["confident"] = bool(e["confident"] or e["hits"] >= 2)
        e["query"] = f"{e['artist']} {e['title']}".strip() if e["artist"] else e["title"]
    return entries


if __name__ == "__main__":
    import sys, time, json
    p = sys.argv[1]; mode = sys.argv[2] if len(sys.argv) > 2 else "id"
    t0 = time.time()
    if mode == "id":
        print(json.dumps(identify_file(p), indent=1)); print(f"{time.time()-t0:.2f}s")
    else:
        d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout.strip())
        for e in tracklist(p, d, progress=lambda a, b: print(f"  {a}/{b}", flush=True)):
            print(f"  {int(e['start'])//60}:{int(e['start'])%60:02d}-{int(e['end'])//60}:{int(e['end'])%60:02d} x{e['hits']} {'ok ' if e['confident'] else '?  '} {e['artist']} - {e['title']} ({e['pitchPct']:+.1f}%)")
        print(f"{time.time()-t0:.2f}s")
