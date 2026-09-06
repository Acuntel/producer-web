"""The Producer stems worker: a link or an upload in, stems + drum one-shots + facts out.
One CPU job at a time. Results go to Supabase storage and the jobs table; the
original audio is deleted when the job ends."""
from __future__ import annotations
import os, shutil, subprocess, tempfile, threading, traceback, time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
import analysis, supa

SECRET = os.environ.get("WORKER_SECRET", "")
MAX_SECONDS = int(os.environ.get("MAX_SECONDS", "480"))
ALLOW_LINKS = os.environ.get("ALLOW_LINK_DOWNLOAD", "0") == "1"   # server-side downloads from media sites are off by default (terms of service, unreliable from datacenter IPs)
app = FastAPI(title="producer-stems")
pool = ThreadPoolExecutor(max_workers=1)
state = {"queued": 0, "running": None, "done": 0, "failed": 0, "started": time.time()}
lock = threading.Lock()


class Source(BaseModel):
    url: str | None = None
    storage_path: str | None = None
    name: str | None = None


class Job(BaseModel):
    job_id: str
    owner: str
    project_id: str | None = None
    source: Source


@app.get("/health")
def health():
    return {"ok": True, "model": "htdemucs", **state, "uptimeSec": int(time.time() - state["started"])}


@app.post("/jobs")
def submit(job: Job, x_worker_secret: str = Header(default="")):
    if not SECRET or x_worker_secret != SECRET: raise HTTPException(401, "bad secret")
    if not (job.source.url or job.source.storage_path): raise HTTPException(400, "source.url or source.storage_path required")
    if job.source.url and not job.source.storage_path and not ALLOW_LINKS: raise HTTPException(400, "links are not accepted; upload the file or capture it in the browser")
    with lock: state["queued"] += 1
    pool.submit(process, job)
    return {"ok": True, "job_id": job.job_id, "queued": state["queued"]}


def fetch_source(job: Job, tmp: str) -> tuple[str, str]:
    """Returns (wav path, display name)."""
    src = job.source
    if src.storage_path:
        raw = os.path.join(tmp, "upload.bin")
        supa.download(src.storage_path, raw)
        name = src.name or os.path.basename(src.storage_path)
    else:
        out = os.path.join(tmp, "dl.%(ext)s")
        cmd = ["yt-dlp", "-f", "bestaudio/best", "--no-playlist", "--max-downloads", "1", "--match-filter", f"duration < {MAX_SECONDS + 420}", "-o", out, "--print", "title", "--no-simulate", "--quiet", "--no-warnings", src.url]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        lines = [l for l in r.stdout.splitlines() if l.strip()]
        files = [f for f in os.listdir(tmp) if f.startswith("dl.")]
        if r.returncode not in (0, 101) or not files:
            raise RuntimeError(f"download failed: {(r.stderr or r.stdout)[-300:]}")
        raw = os.path.join(tmp, files[0])
        name = src.name or (lines[0] if lines else "linked track")
    wav = os.path.join(tmp, "src.wav")
    analysis.ffmpeg_to_wav(raw, wav, MAX_SECONDS)
    os.remove(raw)
    return wav, name


def process(job: Job) -> None:
    tmp = tempfile.mkdtemp(prefix="producer-job-")
    with lock: state["queued"] -= 1; state["running"] = job.job_id
    try:
        supa.update_job(job.job_id, status="running", progress=5)
        wav, name = fetch_source(job, tmp)
        supa.update_job(job.job_id, progress=15)
        facts = analysis.analyze(wav)
        facts["name"] = name
        supa.update_job(job.job_id, progress=25, result={"facts": facts, "stage": "separating"})
        stems = analysis.separate(wav, os.path.join(tmp, "sep"))
        supa.update_job(job.job_id, progress=75, result={"facts": facts, "stage": "slicing"})
        shots = analysis.slice_oneshots(stems["drums"], os.path.join(tmp, "shots")) if "drums" in stems else []
        supa.update_job(job.job_id, progress=85, result={"facts": facts, "stage": "uploading"})
        base = f"{job.owner}/stems/{job.job_id}"
        rows, stem_out, shot_out = [], [], []
        for stem, p in stems.items():
            mp3 = os.path.join(tmp, f"{stem}.mp3")
            analysis.ffmpeg_to_mp3(p, mp3)
            path = supa.upload(f"{base}/{stem}.mp3", mp3, "audio/mpeg")
            stem_out.append({"stem": stem, "path": path})
            rows.append({"owner": job.owner, "project_id": job.project_id, "name": f"{name} · {stem}", "storage_path": path, "mime": "audio/mpeg", "duration_sec": facts["durationSec"], "bpm": facts["bpm"], "key": facts["key"], "source": {"kind": "stem", "stem": stem, "job_id": job.job_id, "from": name}})
        for s in shots:
            path = supa.upload(f"{base}/oneshot-{s.role}.wav", s.path, "audio/wav")
            d = asdict(s); d["path"] = path
            shot_out.append(d)
            rows.append({"owner": job.owner, "project_id": job.project_id, "name": f"{name} · {s.role}", "storage_path": path, "mime": "audio/wav", "duration_sec": s.durationSec, "bpm": None, "key": None, "source": {"kind": "oneshot", "role": s.role, "job_id": job.job_id, "from": name, "fundamentalHz": s.fundamentalHz, "centroidHz": s.centroidHz}})
        clips = supa.insert_clips(rows) if rows else []
        by_path = {c["storage_path"]: c["id"] for c in clips}
        for x in stem_out: x["clipId"] = by_path.get(x["path"])
        for x in shot_out: x["clipId"] = by_path.get(x["path"])
        supa.update_job(job.job_id, status="done", progress=100, result={"facts": facts, "stems": stem_out, "oneshots": shot_out, "name": name})
        with lock: state["done"] += 1
    except Exception as e:
        traceback.print_exc()
        with lock: state["failed"] += 1
        try: supa.update_job(job.job_id, status="error", error=str(e)[:300])
        except Exception: pass
    finally:
        with lock: state["running"] = None
        shutil.rmtree(tmp, ignore_errors=True)
