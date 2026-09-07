"""Identify: what record is this, and what is in this mix. A short cut of audio goes to
Shazam's recognition service (shazamio) and comes back as a named record with its position
and the DJ's pitch adjustment. A mix is cut every few seconds and the hits are merged into
a tracklist with timestamps. No key needed; about 0.2 s per cut from a server."""
from __future__ import annotations
import asyncio, os, subprocess, tempfile
from concurrent.futures import ThreadPoolExecutor

CUT_SEC = 12          # 12 s cuts identify reliably; 6 s cuts sometimes pick the wrong version
STEP_SEC = 20         # a tracklist cut every 20 s: 180 cuts for an hour, about 40 s with four workers
MERGE_WINDOW = 90     # the same record heard again within 90 s is one entry (two decks layered, a long blend)


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


def identify_bytes(path: str) -> dict | None:
    """One short file (already cut). Runs its own event loop so worker threads can call it."""
    from shazamio import Shazam
    async def go():
        return await Shazam().recognize(path)
    try:
        return _parse(asyncio.run(go()))
    except Exception as e:
        print("identify failed", str(e)[:120], flush=True)
        return None


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


def tracklist(path: str, duration: float, step: float = STEP_SEC, cut: float = CUT_SEC, workers: int = 4, progress=None) -> list[dict]:
    """Every `step` seconds a `cut`-second slice is identified; hits are merged into entries.
    Two decks layered come back as alternating hits, so an entry absorbs a repeat within MERGE_WINDOW."""
    starts = [float(s) for s in range(0, max(1, int(duration - cut / 2)), int(step))]
    hits: dict[float, dict | None] = {}
    with tempfile.TemporaryDirectory(prefix="tl-") as td:
        def one(s: float):
            p = _cut(path, s, cut, os.path.join(td, f"c{int(s)}.wav"))
            return s, identify_bytes(p)
        done = 0
        with ThreadPoolExecutor(max_workers=workers) as ex:
            for s, r in ex.map(one, starts):
                hits[s] = r; done += 1
                if progress and done % 8 == 0: progress(done, len(starts))
    entries: list[dict] = []
    for s in starts:
        r = hits.get(s)
        if not r: continue
        prev = next((e for e in reversed(entries) if e["key"] == r["key"] and s - e["end"] <= MERGE_WINDOW), None)
        if prev:
            prev["end"] = s + cut; prev["hits"] += 1
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
