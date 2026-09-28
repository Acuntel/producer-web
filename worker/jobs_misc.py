"""The two jobs that separate nothing: a DJ mix read into a tracklist, and our own render listened to."""
from __future__ import annotations
import os, subprocess, time
import analysis, fetch, finder, hearing, identify, supa
from models import Job

MAX_SECONDS = int(os.environ.get("MAX_SECONDS", "480"))
TRACKLIST_MAX_SECONDS = int(os.environ.get("TRACKLIST_MAX_SECONDS", "7200"))   # a two hour mix, identified in cuts, never separated


def process_tracklist(job: Job, tmp: str) -> None:
    """A DJ mix in, its tracklist out: every 20 s a 12 s cut is identified, hits merge into entries with
    timestamps, the DJ's pitch adjustment and a ready query for the finder. Nothing is separated."""
    t0 = time.time()
    from_sec = float(job.source.from_sec or 0.0)
    # A mix read before (same link) is served at once, for anyone; a "keep going" run merges into it.
    pre_urls = [job.source.url] if job.source.url else []
    if not pre_urls and job.source.query:
        try: pre_urls = [c.url for c in finder.search(job.source.query, None, "mix")[:6]]
        except Exception: pre_urls = []
    known = next((k for k in (supa.mix_cache_find(u) for u in pre_urls) if k), None) if not job.source.storage_path else None
    if known and not from_sec and not (known.get("result") or {}).get("partial"):
        res = dict(known["result"]); res["cached"] = True
        print(f"mix cache hit {known['source_url']}", flush=True)
        supa.update_job(job.job_id, status="done", progress=100, result=res)
        return
    got = fetch.fetch_source(job, tmp, TRACKLIST_MAX_SECONDS, mono16=True); wav, name, resolved = got.wav, got.name, got.resolved
    duration = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav], capture_output=True, text=True).stdout.strip() or 0)
    t_fetch = time.time() - t0
    if identify.cooling() > 0:
        cool = int(identify.cooling())
        supa.update_job(job.job_id, status="done", progress=100, result={"kind": "tracklist", "name": name, "durationSec": round(duration, 1), "tracklist": (known or {}).get("result", {}).get("tracklist", []), "coveredSec": from_sec, "partial": True, "cooldownSec": cool, "sourceUrl": resolved})
        return
    supa.update_job(job.job_id, progress=20, result={"kind": "tracklist", "name": name, "durationSec": round(duration, 1), "stage": "identifying"})
    def prog(done: int, total: int, entries: list[dict] | None = None):
        try: supa.update_job(job.job_id, progress=20 + int(75 * done / max(1, total)), result={"kind": "tracklist", "name": name, "durationSec": round(duration, 1), "stage": "identifying", "tracklist": entries or [], "cuts": done})
        except Exception: pass
    stats: dict = {}
    entries = identify.tracklist(wav, duration, progress=prog, from_sec=from_sec, stats=stats)
    if known and from_sec:
        # Keep going: the earlier entries stay, the new ones follow.
        earlier = [e for e in (known.get("result") or {}).get("tracklist", []) if e.get("start", 0) < from_sec]
        entries = earlier + [e for e in entries if e.get("start", 0) >= from_sec]
    cool = identify.cooling()
    final = {"kind": "tracklist", "name": name, "durationSec": round(duration, 1), "tracklist": entries, "sourceUrl": resolved, "cooldownSec": int(cool) if cool else 0,
             "coveredSec": stats.get("coveredSec", duration), "partial": bool(stats.get("partial")),
             "timing": {"fetchSec": round(t_fetch, 1), "identifySec": round(time.time() - t0 - t_fetch, 1), "cuts": stats.get("cuts", 0), "named": stats.get("named", 0), "boundaries": stats.get("boundaries", 0)}}
    supa.update_job(job.job_id, status="done", progress=100, result=final)
    if resolved:
        try: supa.mix_cache_put(resolved, final)
        except Exception as e: print("mix cache put failed", e, flush=True)


def process_hear(job: Job, tmp: str) -> None:
    """Our own render: no download, no separation. Listen, report."""
    paths = job.source.stem_paths or {}
    local = {}
    for name, sp in paths.items():
        raw = os.path.join(tmp, f"{name}.bin"); supa.download(sp, raw)
        wav = os.path.join(tmp, f"{name}.wav"); analysis.ffmpeg_to_wav(raw, wav, MAX_SECONDS); local[name] = wav
    supa.update_job(job.job_id, progress=30)
    facts = analysis.analyze(local["mix"]); facts["name"] = job.source.name or "our render"
    stems = {k: v for k, v in local.items() if k != "mix"}
    supa.update_job(job.job_id, progress=50, result={"facts": facts, "stage": "listening"})
    heard = hearing.hear(local["mix"], stems, facts)
    heard.pop("embeddings", None)
    supa.update_job(job.job_id, status="done", progress=100, result={"facts": facts, "name": facts["name"], "hearing": heard, "kind": "hear"})

