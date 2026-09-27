"""The Producer stems worker: a link, a name or an upload in, stems + drum one-shots + facts out.
One CPU job at a time. Results go to Supabase storage and the jobs table; the
original audio is deleted when the job ends. The jobs themselves live in jobs.py and jobs_misc.py."""
from __future__ import annotations
import os, shutil, tempfile, threading, traceback, time
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
import analysis, supa
import hearing, finder, identify
import fetch, jobs, jobs_misc
from models import Job, Source  # noqa: F401  (Source is part of the posted shape)

SECRET = os.environ.get("WORKER_SECRET", "")
ALLOW_LINKS = os.environ.get("ALLOW_LINK_DOWNLOAD", "0") == "1"   # server-side downloads from media sites are off by default (terms of service, unreliable from datacenter IPs)
app = FastAPI(title="producer-stems")
pool = ThreadPoolExecutor(max_workers=int(os.environ.get("JOB_WORKERS", "2")))
state = {"queued": 0, "running": None, "done": 0, "failed": 0, "started": time.time()}
lock = threading.Lock()


@app.get("/health")
def health():
    # The model it actually loads, not a string typed once and left behind: the site shows this.
    return {"ok": True, "model": os.environ.get("DEMUCS_MODEL", "htdemucs"), "drumParts": os.environ.get("DRUM_PARTS", "1") == "1",
            "cpus": os.cpu_count(), "workers": pool._max_workers, "identifyCooldownSec": int(identify.cooling()),
            **state, "uptimeSec": int(time.time() - state["started"])}


@app.post("/jobs")
def submit(job: Job, x_worker_secret: str = Header(default="")):
    if not SECRET or x_worker_secret != SECRET: raise HTTPException(401, "bad secret")
    if job.kind not in ("stems", "hear", "tracklist"): raise HTTPException(400, "unknown job kind")
    if job.kind == "hear":
        if not job.source.stem_paths or "mix" not in job.source.stem_paths: raise HTTPException(400, "hear needs stem_paths with a mix")
    elif not (job.source.url or job.source.storage_path or job.source.query): raise HTTPException(400, "source.url, source.storage_path or source.query required")
    if (job.source.url or job.source.query) and not job.source.storage_path and not ALLOW_LINKS: raise HTTPException(400, "links are not accepted; upload the file or capture it in the browser")
    with lock: state["queued"] += 1
    pool.submit(process, job)
    return {"ok": True, "job_id": job.job_id, "queued": state["queued"]}


class IdentifyIn(BaseModel):
    storage_path: str           # a short capture or upload in the clips bucket (the middle 12 s is enough)


@app.post("/identify")
def identify_endpoint(x: IdentifyIn, x_worker_secret: str = Header(default="")):
    """What record is this: name, artist, ISRC, label, year, position in the record, the DJ's pitch. About a second."""
    if not SECRET or x_worker_secret != SECRET: raise HTTPException(401, "bad secret")
    tmp = tempfile.mkdtemp(prefix="producer-ident-")
    try:
        raw = os.path.join(tmp, "q.bin"); supa.download(x.storage_path, raw)
        t0 = time.time()
        r = identify.identify_file(raw)
        known = supa.cache_find_identity(r["key"]) if r else None
        return {"identity": r, "name": identify.display_name(r), "cached": bool(known), "ms": int((time.time() - t0) * 1000), "cooldownSec": int(identify.cooling())}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


class FindIn(BaseModel):
    query: str
    want: str | None = None        # track | mix | sample
    sources: list[str] | None = None


@app.post("/find")
def find(f: FindIn, x_worker_secret: str = Header(default="")):
    """Ranked candidates across every public source, no download. About one second."""
    if not SECRET or x_worker_secret != SECRET: raise HTTPException(401, "bad secret")
    res = finder.search(f.query.strip()[:160], f.sources, f.want)
    return {"query": f.query, "candidates": finder.to_json(res[:16]), "sources": list(finder.SOURCES)}


class GrabIn(BaseModel):
    prompt: str                       # "a warm analog synth pad", "the vocal chop", "that metallic perc"
    candidates: list[dict] = []       # [{id, name, embedding}] the caller already holds for the record's stems and one-shots


@app.post("/grab")
def grab(g: GrabIn, x_worker_secret: str = Header(default="")):
    """Grab by sound: the prompt's CLAP embedding against the record's stem and one-shot embeddings, ranked."""
    if not SECRET or x_worker_secret != SECRET: raise HTTPException(401, "bad secret")
    import numpy as np
    t0 = time.time()
    emb = hearing.clap_text_embed(g.prompt.strip()[:160])
    scored = []
    for c in g.candidates:
        e = c.get("embedding")
        if not e or len(e) != len(emb): continue
        v = np.array(e, dtype=np.float32); sim = float(np.dot(emb, v) / (np.linalg.norm(emb) * np.linalg.norm(v) + 1e-9))
        scored.append({"id": c.get("id"), "name": c.get("name"), "score": round(sim, 3)})
    scored.sort(key=lambda x: -x["score"])
    return {"prompt": g.prompt, "ranked": scored[:12], "ms": int((time.time() - t0) * 1000)}


class MatchIn(BaseModel):
    owner: str
    storage_path: str          # a short recording the user made ("ding ding dong")
    candidates: list[dict] = []   # [{id, name, embedding}] from the caller; the worker adds nothing it cannot see


@app.post("/match")
def match(m: MatchIn, x_worker_secret: str = Header(default="")):
    """Query by sound: CLAP embedding of the recording against candidate embeddings, plus its pitch contour."""
    if not SECRET or x_worker_secret != SECRET: raise HTTPException(401, "bad secret")
    import numpy as np, librosa, soundfile as sf
    tmp = tempfile.mkdtemp(prefix="producer-match-")
    try:
        raw = os.path.join(tmp, "q.bin"); supa.download(m.storage_path, raw)
        wav = os.path.join(tmp, "q.wav"); analysis.ffmpeg_to_wav(raw, wav, 20)
        y, sr = librosa.load(wav, sr=22050, mono=True)
        emb = hearing.clap_embed(y, sr)
        f0, voiced, _ = librosa.pyin(y, fmin=60, fmax=1200, sr=sr)
        pitches = [float(librosa.hz_to_midi(f)) for f, v in zip(f0, voiced) if v and f]
        contour = [hearing.midi_name(p) for p in pitches[:: max(1, len(pitches) // 12)]][:12] if pitches else []
        onsets = librosa.onset.onset_detect(y=y, sr=sr, units="time")
        scored = []
        for c in m.candidates:
            e = c.get("embedding")
            if not e or len(e) != len(emb): continue
            v = np.array(e, dtype=np.float32); sim = float(np.dot(emb, v) / (np.linalg.norm(emb) * np.linalg.norm(v) + 1e-9))
            scored.append({"id": c.get("id"), "name": c.get("name"), "score": round(sim, 3)})
        scored.sort(key=lambda x: -x["score"])
        return {"matches": scored[:8], "contour": contour, "hits": len(onsets), "durationSec": round(len(y) / sr, 2)}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def process(job: Job) -> None:
    tmp = tempfile.mkdtemp(prefix="producer-job-")
    with lock: state["queued"] -= 1; state["running"] = job.job_id
    try:
        supa.update_job(job.job_id, status="running", progress=5)
        if job.kind == "hear": jobs_misc.process_hear(job, tmp)
        elif job.kind == "tracklist": jobs_misc.process_tracklist(job, tmp)
        else: jobs.process_stems(job, tmp)
        with lock: state["done"] += 1
    except fetch.NotTheOriginal as e:
        # Not silent and not a crash: the one line the producer says, and what was found, for a "yes, use it".
        print(f"not the original: {e.verdict.version} {e.tried}", flush=True)
        with lock: state["done"] += 1
        try: supa.update_job(job.job_id, status="error", error=str(e)[:300], result=e.result())
        except Exception: pass
    except Exception as e:
        traceback.print_exc()
        with lock: state["failed"] += 1
        try: supa.update_job(job.job_id, status="error", error=str(e)[:300])
        except Exception: pass
    finally:
        with lock: state["running"] = None
        shutil.rmtree(tmp, ignore_errors=True)
