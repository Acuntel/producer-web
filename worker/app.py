"""The Producer stems worker: a link or an upload in, stems + drum one-shots + facts out.
One CPU job at a time. Results go to Supabase storage and the jobs table; the
original audio is deleted when the job ends."""
from __future__ import annotations
import os, re, shutil, subprocess, tempfile, threading, traceback, time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
import analysis, supa
import hearing

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
    query: str | None = None   # a song or artist name: the worker searches the public sources for it
    stem_paths: dict[str, str] | None = None   # kind "hear": the browser rendered mix + stem groups itself


class Job(BaseModel):
    job_id: str
    owner: str
    project_id: str | None = None
    kind: str = "stems"
    source: Source


@app.get("/health")
def health():
    return {"ok": True, "model": "htdemucs", **state, "uptimeSec": int(time.time() - state["started"])}


@app.post("/jobs")
def submit(job: Job, x_worker_secret: str = Header(default="")):
    if not SECRET or x_worker_secret != SECRET: raise HTTPException(401, "bad secret")
    if job.kind == "hear":
        if not job.source.stem_paths or "mix" not in job.source.stem_paths: raise HTTPException(400, "hear needs stem_paths with a mix")
    elif not (job.source.url or job.source.storage_path or job.source.query): raise HTTPException(400, "source.url, source.storage_path or source.query required")
    if (job.source.url or job.source.query) and not job.source.storage_path and not ALLOW_LINKS: raise HTTPException(400, "links are not accepted; upload the file or capture it in the browser")
    with lock: state["queued"] += 1
    pool.submit(process, job)
    return {"ok": True, "job_id": job.job_id, "queued": state["queued"]}


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


def fetch_source(job: Job, tmp: str) -> tuple[str, str]:
    """Returns (wav path, display name)."""
    src = job.source
    if src.storage_path:
        raw = os.path.join(tmp, "upload.bin")
        supa.download(src.storage_path, raw)
        name = src.name or os.path.basename(src.storage_path)
    else:
        # The record lives somewhere public. A link is tried as given; a name is searched on the sources
        # that answer from a datacenter: SoundCloud, then Bandcamp. YouTube is not in the list: it bot-checks
        # server requests, so a YouTube link gets a clear message pointing at Capture what is playing.
        if src.url and re.search(r"(youtube\.com|youtu\.be|music\.youtube)", src.url, re.I):
            raise RuntimeError("youtube blocked: YouTube refuses server downloads. Play it in a tab and use Capture what is playing, or upload the file.")
        # By name: the first five SoundCloud results, skipping ones that are DRM protected (official label
        # uploads often are) until one downloads. Bandcamp has no search extractor; its track links work directly.
        targets = [src.url] if src.url else [f"scsearch5:{src.query}"]
        errors = []
        raw = None; name = src.name
        for target in targets:
            out = os.path.join(tmp, "dl.%(ext)s")
            cmd = ["yt-dlp", "-f", "bestaudio/best", "--ignore-errors", "--max-downloads", "1", "--match-filter", f"duration < {MAX_SECONDS + 420}", "-o", out, "--print", "title", "--no-simulate", "--quiet", "--no-warnings", "--socket-timeout", "20"]
            if not target.startswith("scsearch"): cmd.append("--no-playlist")
            proxy = os.environ.get("YTDLP_PROXY")
            if proxy: cmd += ["--proxy", proxy]
            r = subprocess.run(cmd + [target], capture_output=True, text=True, timeout=600)
            lines = [l for l in r.stdout.splitlines() if l.strip()]
            files = [f for f in os.listdir(tmp) if f.startswith("dl.")]
            if r.returncode in (0, 101) and files:
                raw = os.path.join(tmp, files[0]); name = name or (lines[0] if lines else "linked track")
                supa_note = "soundcloud search" if target.startswith("scsearch") else "link"
                print(f"resolved via {supa_note}: {name}", flush=True)
                break
            errors.append(f"{target.split(':')[0]}: {(r.stderr or r.stdout)[-160:].strip()}")
            for f in files:
                try: os.remove(os.path.join(tmp, f))
                except OSError: pass
        if not raw:
            raise RuntimeError("download failed: " + " | ".join(errors)[-600:])
    wav = os.path.join(tmp, "src.wav")
    analysis.ffmpeg_to_wav(raw, wav, MAX_SECONDS)
    os.remove(raw)
    return wav, name


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


def process(job: Job) -> None:
    tmp = tempfile.mkdtemp(prefix="producer-job-")
    with lock: state["queued"] -= 1; state["running"] = job.job_id
    if job.kind == "hear":
        try:
            supa.update_job(job.job_id, status="running", progress=5); process_hear(job, tmp)
            with lock: state["done"] += 1
        except Exception as e:
            traceback.print_exc()
            with lock: state["failed"] += 1
            try: supa.update_job(job.job_id, status="error", error=str(e)[:300])
            except Exception: pass
        finally:
            with lock: state["running"] = None
            shutil.rmtree(tmp, ignore_errors=True)
        return
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
        # The ears: per-stem listening, drum and bass transcription, lyrics, descriptors, embeddings.
        supa.update_job(job.job_id, progress=80, result={"facts": facts, "stage": "listening"})
        heard = {}
        try: heard = hearing.hear(wav, stems, facts)
        except Exception as e: heard = {"error": str(e)[:200], "report": ""}
        embeddings = heard.pop("embeddings", {}) if isinstance(heard, dict) else {}
        supa.update_job(job.job_id, progress=88, result={"facts": facts, "stage": "uploading"})
        base = f"{job.owner}/stems/{job.job_id}"
        rows, stem_out, shot_out = [], [], []
        for stem, p in stems.items():
            mp3 = os.path.join(tmp, f"{stem}.mp3")
            analysis.ffmpeg_to_mp3(p, mp3)
            path = supa.upload(f"{base}/{stem}.mp3", mp3, "audio/mpeg")
            stem_out.append({"stem": stem, "path": path})
            rows.append({"owner": job.owner, "project_id": job.project_id, "name": f"{name} · {stem}", "storage_path": path, "mime": "audio/mpeg", "duration_sec": facts["durationSec"], "bpm": facts["bpm"], "key": facts["key"], "source": {"kind": "stem", "stem": stem, "job_id": job.job_id, "from": name, "embedding": embeddings.get(stem)}})
        for s in shots:
            path = supa.upload(f"{base}/oneshot-{os.path.basename(s.path)}", s.path, "audio/wav")
            d = asdict(s); d["path"] = path
            emb = None
            try:
                import soundfile as sf
                yy, sr = sf.read(s.path, dtype="float32"); yy = yy if yy.ndim == 1 else yy.mean(axis=1)
                emb = [round(float(v), 4) for v in hearing.clap_embed(yy, sr)]
            except Exception: pass
            shot_out.append(d)
            rows.append({"owner": job.owner, "project_id": job.project_id, "name": f"{name} · {s.role}", "storage_path": path, "mime": "audio/wav", "duration_sec": s.durationSec, "bpm": None, "key": None, "source": {"kind": "oneshot", "role": s.role, "job_id": job.job_id, "from": name, "fundamentalHz": s.fundamentalHz, "centroidHz": s.centroidHz, "embedding": emb}})
        clips = supa.insert_clips(rows) if rows else []
        by_path = {c["storage_path"]: c["id"] for c in clips}
        for x in stem_out: x["clipId"] = by_path.get(x["path"])
        for x in shot_out: x["clipId"] = by_path.get(x["path"])
        supa.update_job(job.job_id, status="done", progress=100, result={"facts": facts, "stems": stem_out, "oneshots": shot_out, "name": name, "hearing": heard})
        with lock: state["done"] += 1
    except Exception as e:
        traceback.print_exc()
        with lock: state["failed"] += 1
        try: supa.update_job(job.job_id, status="error", error=str(e)[:300])
        except Exception: pass
    finally:
        with lock: state["running"] = None
        shutil.rmtree(tmp, ignore_errors=True)
