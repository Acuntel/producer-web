"""Identify: what record is this, and what is in this mix. A short cut of audio goes to
Shazam's recognition service (shazamio) and comes back as a named record with its position
and the DJ's pitch adjustment. A mix is cut every few seconds and the hits are merged into
a tracklist with timestamps. No key needed; about 0.2 s per cut from a server."""
from __future__ import annotations
import asyncio, os, subprocess, tempfile
from concurrent.futures import ProcessPoolExecutor

CUT_SEC = 12          # 12 s cuts identify reliably; 6 s cuts sometimes pick the wrong version
STEP_SEC = 60         # coarse pass: a cut every minute catches any record that lasts 70 s in the mix; boundaries are refined after
REFINE_SEC = 30       # a boundary between two records is narrowed to this by midpoint cuts
MERGE_WINDOW = 90     # the same record heard again within 90 s is one entry (two decks layered, a long blend)
# The recognition signature is pure Python and CPU bound: threads serialize on the GIL (1.7 s per cut on the
# worker), processes run the cuts in parallel on the cores the container has.
WORKERS = max(2, min(8, int(os.environ.get("IDENTIFY_WORKERS", "4"))))
# The recognition service throttles bursts from one address (measured: after about 30 requests in a few seconds,
# answers take 7 s or time out). A pacing gate keeps every process under IDENTIFY_RATE requests per second.
RATE = float(os.environ.get("IDENTIFY_RATE", "1.5"))
_GATE = os.path.join(tempfile.gettempdir(), "producer-identify.gate")


def _pace() -> None:
    """A file-locked token gate shared by every process: at most RATE requests per second worker-wide."""
    import fcntl, time as _t
    with open(_GATE, "a+") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            f.seek(0); last = float((f.read() or "0").strip() or 0)
            nxt = max(_t.time(), last + 1.0 / RATE)
            f.seek(0); f.truncate(); f.write(f"{nxt:.4f}")
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)
    wait = nxt - _t.time()
    if wait > 0: _t.sleep(wait)


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


def identify_bytes(path: str) -> dict | None:
    """One short file (already cut). Runs its own event loop so worker threads and processes can call it.
    A hung request is cut off at TIMEOUT_SEC: one slow answer must never hold a whole tracklist."""
    import time as _t
    from shazamio import Shazam
    async def go():
        return await asyncio.wait_for(Shazam().recognize(path), timeout=TIMEOUT_SEC)
    _pace()
    t0 = _t.time()
    try:
        r = _parse(asyncio.run(go()))
    except Exception as e:
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
        if r is None and duration > 3 * CUT_SEC:
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
    """Adaptive: a coarse cut every `step` seconds names the records; wherever two neighbours disagree (or one
    is silent) the boundary is narrowed by midpoint cuts down to REFINE_SEC. About 120 coarse cuts plus two or
    three per transition for two hours, instead of a cut every few seconds. Hits merge into entries; two decks
    layered come back as alternating hits, so an entry absorbs a repeat within MERGE_WINDOW."""
    hits: dict[float, dict | None] = {}
    total_est = int(duration / step) + 3 * int(duration / 180) + 4
    done = 0
    with tempfile.TemporaryDirectory(prefix="tl-") as td, ProcessPoolExecutor(max_workers=workers) as ex:
        def run(starts: list[float]):
            nonlocal done
            todo = [s for s in starts if s not in hits and s + cut <= duration + 1]
            for s, r in ex.map(_one_cut, [(path, s, cut, td) for s in todo], chunksize=1):
                hits[s] = r; done += 1
                if progress and done % 4 == 0: progress(min(done, total_est), total_est, merge_hits(hits, cut))
        # Coarse pass in order, skipping ahead after a confident hit: a record plays for minutes in a mix, so the
        # next cut lands two minutes on; a change sooner than that is caught by the refinement below.
        s0 = 0.0
        while s0 + cut <= duration + 1:
            run([s0])
            r0 = hits.get(s0)
            s0 += (2 * step) if (r0 and r0.get("confident")) else step
        # Refine: between two cuts that name different records (or one names nothing), cut the midpoint, repeat
        # until the gap is REFINE_SEC. A miss next to a hit gets a second chance the same way.
        for _ in range(4):
            keys = sorted(hits)
            mids = []
            for a, b in zip(keys, keys[1:]):
                ka = (hits[a] or {}).get("key"); kb = (hits[b] or {}).get("key")
                if b - a > REFINE_SEC and (ka != kb or ka is None): mids.append(round((a + b) / 2, 1))
            if not mids: break
            run(mids)
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
