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
import hearing, finder, fingerprint, identify

SECRET = os.environ.get("WORKER_SECRET", "")
MAX_SECONDS = int(os.environ.get("MAX_SECONDS", "480"))
TRACKLIST_MAX_SECONDS = int(os.environ.get("TRACKLIST_MAX_SECONDS", "7200"))   # a two hour mix, identified in cuts, never separated
ALLOW_LINKS = os.environ.get("ALLOW_LINK_DOWNLOAD", "0") == "1"   # server-side downloads from media sites are off by default (terms of service, unreliable from datacenter IPs)
app = FastAPI(title="producer-stems")
pool = ThreadPoolExecutor(max_workers=int(os.environ.get("JOB_WORKERS", "2")))
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
    return {"ok": True, "model": "htdemucs", "cpus": os.cpu_count(), "workers": pool._max_workers, "identifyCooldownSec": int(identify.cooling()), **state, "uptimeSec": int(time.time() - state["started"])}


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


def fetch_source(job: Job, tmp: str, max_seconds: int = MAX_SECONDS, mono16: bool = False) -> tuple[str, str, str | None]:
    """Returns (wav path, display name, resolved source url or None)."""
    src = job.source
    want = "mix" if job.kind == "tracklist" else None
    if src.storage_path:
        raw = os.path.join(tmp, "upload.bin")
        supa.download(src.storage_path, raw)
        name = src.name or os.path.basename(src.storage_path)
        resolved = None
    else:
        # The record lives somewhere public. A link is tried as given; a name is searched on the sources
        # that answer from a datacenter: SoundCloud, then Bandcamp. YouTube is not in the list: it bot-checks
        # server requests, so a YouTube link gets a clear message pointing at Capture what is playing.
        if src.url and re.search(r"(youtube\.com|youtu\.be|music\.youtube)", src.url, re.I):
            raise RuntimeError("youtube blocked: YouTube refuses server downloads. Play it in a tab and use Capture what is playing, or upload the file.")
        # By name: the finder ranks every source; candidates are tried in order until one downloads
        # (DRM label uploads on SoundCloud fail fast and the next one is taken). Archive items resolve to their first audio file.
        if src.url:
            targets = [src.url]
        else:
            ranked = finder.search(src.query or "", None, want)
            targets = []
            for c in ranked[:6]:
                u = c.url
                if c.source == "archive": u = finder.archive_first_file(c.url) or c.url
                targets.append(u)
            if not targets: targets = [f"scsearch5:{src.query}"]
            print(f"finder: {len(ranked)} candidates for {src.query!r}; trying {len(targets)}", flush=True)
        errors = []
        raw = None; name = src.name; resolved = None
        for target in targets:
            out = os.path.join(tmp, "dl.%(ext)s")
            # HLS copies download as parallel fragments (Mixcloud's plain file crawls at a few hundred KB/s from a server).
            cmd = ["yt-dlp", "-f", "bestaudio[protocol^=m3u8]/bestaudio/best", "--concurrent-fragments", "8", "--ignore-errors", "--max-downloads", "1", "--match-filter", f"duration <? {max_seconds + 420}", "-o", out, "--print", "title", "--no-simulate", "--quiet", "--no-warnings", "--socket-timeout", "20"]
            if not target.startswith("scsearch"): cmd.append("--no-playlist")
            proxy = os.environ.get("YTDLP_PROXY")
            if proxy: cmd += ["--proxy", proxy]
            r = subprocess.run(cmd + [target], capture_output=True, text=True, timeout=600)
            lines = [l for l in r.stdout.splitlines() if l.strip()]
            files = [f for f in os.listdir(tmp) if f.startswith("dl.")]
            if r.returncode in (0, 101) and files:
                raw = os.path.join(tmp, files[0]); name = name or (lines[0] if lines else "linked track"); resolved = target
                supa_note = "soundcloud search" if target.startswith("scsearch") else ("archive" if "archive.org" in target else "mixcloud" if "mixcloud" in target else "soundcloud" if "soundcloud" in target else "link")
                print(f"resolved via {supa_note}: {name}", flush=True)
                break
            errors.append(f"{target.split(':')[0]}: {(r.stderr or r.stdout)[-160:].strip()}")
            for f in files:
                try: os.remove(os.path.join(tmp, f))
                except OSError: pass
        if not raw:
            raise RuntimeError("download failed: " + " | ".join(errors)[-600:])
    wav = os.path.join(tmp, "src.wav")
    if mono16: subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-t", str(max_seconds), "-ac", "1", "-ar", "16000", "-vn", wav], check=True)
    else: analysis.ffmpeg_to_wav(raw, wav, max_seconds)
    os.remove(raw)
    return wav, name, resolved


def process_tracklist(job: Job, tmp: str) -> None:
    """A DJ mix in, its tracklist out: every 20 s a 12 s cut is identified, hits merge into entries with
    timestamps, the DJ's pitch adjustment and a ready query for the finder. Nothing is separated."""
    t0 = time.time()
    wav, name, resolved = fetch_source(job, tmp, TRACKLIST_MAX_SECONDS, mono16=True)
    duration = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav], capture_output=True, text=True).stdout.strip() or 0)
    t_fetch = time.time() - t0
    supa.update_job(job.job_id, progress=20, result={"kind": "tracklist", "name": name, "durationSec": round(duration, 1), "stage": "identifying"})
    def prog(done: int, total: int, entries: list[dict] | None = None):
        try: supa.update_job(job.job_id, progress=20 + int(75 * done / max(1, total)), result={"kind": "tracklist", "name": name, "durationSec": round(duration, 1), "stage": "identifying", "tracklist": entries or [], "cuts": done})
        except Exception: pass
    entries = identify.tracklist(wav, duration, progress=prog)
    cool = identify.cooling()
    final = {"kind": "tracklist", "name": name, "durationSec": round(duration, 1), "tracklist": entries, "sourceUrl": resolved, "cooldownSec": int(cool) if cool else 0,
             "timing": {"fetchSec": round(t_fetch, 1), "identifySec": round(time.time() - t0 - t_fetch, 1), "cuts": len(range(0, max(1, int(duration - identify.CUT_SEC / 2)), int(identify.STEP_SEC)))}}
    supa.update_job(job.job_id, status="done", progress=100, result=final)


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
    if job.kind in ("hear", "tracklist"):
        try:
            supa.update_job(job.job_id, status="running", progress=5)
            if job.kind == "hear": process_hear(job, tmp)
            else: process_tracklist(job, tmp)
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
        # Instant path: a link (or the finder's top pick for a name) that was analyzed before, for anyone.
        # Every ranked candidate is checked against the cache before anything downloads: the copy that
        # was analyzed before may sit third in the list (the first two being DRM uploads that never download).
        pre_urls = [job.source.url] if job.source.url else []
        if not pre_urls and job.source.query and not job.source.storage_path:
            try: pre_urls = [c.url for c in finder.search(job.source.query, None, None)[:6]]
            except Exception: pre_urls = []
        known = None
        if not job.source.storage_path:
            for u in pre_urls:
                known = supa.cache_find_url(u)
                if known: pre_url = u; break
        if known:
            print(f"cache hit by url {pre_url}", flush=True)
            name = job.source.name or (known.get("result") or {}).get("name") or "record"
            result = supa.adopt_cached(job.owner, job.project_id, name, known)
            result["name"] = name; result["cached"] = True; result["facts"] = (known.get("result") or {}).get("facts")
            supa.update_job(job.job_id, status="done", progress=100, result=result)
            with lock: state["done"] += 1
            return
        timing: dict[str, float] = {}; t0 = time.time()
        def stamp(k: str):
            timing[k] = round(time.time() - t0, 1)
        wav, name, resolved = fetch_source(job, tmp); stamp("fetched")
        supa.update_job(job.job_id, progress=12, result={"stage": "identifying"})
        # Who is this: a name, artist, ISRC, label and year from the sound itself, in about a second. Uploads and
        # captures get their true name; a record identified before is served from the cache from any copy.
        ident = None
        try: ident = identify.identify_file(wav)
        except Exception as e: print("identify failed", e, flush=True)
        stamp("identified")
        if ident and (not job.source.name or job.source.storage_path): name = identify.display_name(ident) or name
        known_id = supa.cache_find_identity(ident["key"]) if ident and ident.get("confident") else None
        if known_id:
            print(f"cache hit by identity {ident['key']} {name}", flush=True)
            if resolved:
                try: supa.cache_add_url(known_id["fingerprint"], resolved)
                except Exception: pass
            result = supa.adopt_cached(job.owner, job.project_id, name, known_id)
            result["name"] = name; result["cached"] = True; result["facts"] = (known_id.get("result") or {}).get("facts"); result["identity"] = ident; result["timing"] = timing
            supa.update_job(job.job_id, status="done", progress=100, result=result)
            with lock: state["done"] += 1
            return
        supa.update_job(job.job_id, progress=15, result={"stage": "listening: tempo, key, structure", "identity": ident, "name": name})
        facts = analysis.analyze(wav)
        facts["name"] = name
        if ident: facts["identity"] = ident
        stamp("analyzed")
        # The cache: a record anyone already analyzed is served from storage, no separation.
        rawfp = fingerprint.raw_fingerprint(wav)
        cached = supa.cache_find(rawfp[0], rawfp[1]) if rawfp else None
        stamp("fingerprinted")
        if cached:
            print("cache hit by fingerprint", flush=True)
            if resolved:
                try: supa.cache_add_url(cached["fingerprint"], resolved)
                except Exception: pass
            if ident and ident.get("confident"):
                try: supa.cache_set_identity(cached["fingerprint"], ident["key"])
                except Exception: pass
            supa.update_job(job.job_id, progress=90, result={"facts": facts, "stage": "from cache"})
            result = supa.adopt_cached(job.owner, job.project_id, name, cached)
            result["facts"] = facts; result["name"] = name; result["cached"] = True; result["identity"] = ident; result["timing"] = timing
            supa.update_job(job.job_id, status="done", progress=100, result=result)
            with lock: state["done"] += 1
            return
        supa.update_job(job.job_id, progress=22, result={"facts": facts, "stage": "separating the best bars"})
        # Progressive: the best 16 bars are separated first (about a fifth of the work), so stems, one-shots and a
        # listen land early; the whole record follows and replaces them.
        bar_sec = 240.0 / float(facts.get("bpm") or 126)
        start = float((facts.get("bestBars") or {}).get("startSec") or 0.0)
        pre = os.path.join(tmp, "preview.wav")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{max(0.0, start):.3f}", "-t", f"{16 * bar_sec:.3f}", "-i", wav, pre], check=True)
        pstems = analysis.separate(pre, os.path.join(tmp, "psep")); stamp("previewSeparated")
        pshots = analysis.slice_oneshots(pstems["drums"], os.path.join(tmp, "pshots")) if "drums" in pstems else []
        base = f"{job.owner}/stems/{job.job_id}"
        preview_out = []
        for stem, p in pstems.items():
            mp3 = os.path.join(tmp, f"preview-{stem}.mp3"); analysis.ffmpeg_to_mp3(p, mp3)
            preview_out.append({"stem": stem, "path": supa.upload(f"{base}/preview-{stem}.mp3", mp3, "audio/mpeg"), "startSec": start, "bars": 16})
        pshot_out = []
        for sh in pshots:
            pshot_out.append({**asdict(sh), "path": supa.upload(f"{base}/preview-oneshot-{os.path.basename(sh.path)}", sh.path, "audio/wav")})
        stamp("previewReady")
        supa.update_job(job.job_id, progress=45, result={"facts": facts, "stage": "separating the whole record", "preview": {"stems": preview_out, "oneshots": pshot_out}, "timing": timing})
        stems = analysis.separate(wav, os.path.join(tmp, "sep")); stamp("separated")
        supa.update_job(job.job_id, progress=75, result={"facts": facts, "stage": "slicing", "preview": {"stems": preview_out, "oneshots": pshot_out}})
        shots = analysis.slice_oneshots(stems["drums"], os.path.join(tmp, "shots")) if "drums" in stems else []
        # Publish first, listen after: the stems and one-shots are usable the moment they exist; the listening
        # pass (about two minutes on the worker) follows and its embeddings land on the rows afterwards.
        supa.update_job(job.job_id, progress=72, result={"facts": facts, "stage": "uploading", "preview": {"stems": preview_out, "oneshots": pshot_out}, "timing": timing})
        rows, stem_out, shot_out = [], [], []
        for stem, p in stems.items():
            mp3 = os.path.join(tmp, f"{stem}.mp3")
            analysis.ffmpeg_to_mp3(p, mp3)
            path = supa.upload(f"{base}/{stem}.mp3", mp3, "audio/mpeg")
            stem_out.append({"stem": stem, "path": path})
            rows.append({"owner": job.owner, "project_id": job.project_id, "name": f"{name} · {stem}", "storage_path": path, "mime": "audio/mpeg", "duration_sec": facts["durationSec"], "bpm": facts["bpm"], "key": facts["key"], "source": {"kind": "stem", "stem": stem, "job_id": job.job_id, "from": name}})
        for sh in shots:
            path = supa.upload(f"{base}/oneshot-{os.path.basename(sh.path)}", sh.path, "audio/wav")
            d = asdict(sh); d["path"] = path
            shot_out.append(d)
            rows.append({"owner": job.owner, "project_id": job.project_id, "name": f"{name} · {sh.role}", "storage_path": path, "mime": "audio/wav", "duration_sec": sh.durationSec, "bpm": None, "key": None, "source": {"kind": "oneshot", "role": sh.role, "job_id": job.job_id, "from": name, "fundamentalHz": sh.fundamentalHz, "centroidHz": sh.centroidHz}})
        clips = supa.insert_clips(rows) if rows else []
        by_path = {c["storage_path"]: c["id"] for c in clips}
        for x in stem_out: x["clipId"] = by_path.get(x["path"])
        for x in shot_out: x["clipId"] = by_path.get(x["path"])
        stamp("uploaded")
        supa.update_job(job.job_id, progress=80, result={"facts": facts, "stems": stem_out, "oneshots": shot_out, "name": name, "identity": ident, "stage": "listening", "timing": timing})
        # The ears: per-stem listening, drum and bass transcription, lyrics, descriptors, embeddings.
        heard = {}
        try: heard = hearing.hear(wav, stems, facts)
        except Exception as e: heard = {"error": str(e)[:200], "report": ""}
        stamp("heard")
        embeddings = heard.pop("embeddings", {}) if isinstance(heard, dict) else {}
        source_by_path = {r["storage_path"]: r["source"] for r in rows}
        for x in stem_out:
            if x.get("clipId") and embeddings.get(x["stem"]):
                try: supa.set_clip_embedding(x["clipId"], source_by_path[x["path"]], embeddings.get(x["stem"]))
                except Exception: pass
        for x in shot_out:
            if not x.get("clipId"): continue
            try:
                import soundfile as sf
                local = next((sh.path for sh in shots if os.path.basename(sh.path) == os.path.basename(x["path"]).replace("oneshot-", "", 1)), None)
                if not local: continue
                yy, sr = sf.read(local, dtype="float32"); yy = yy if yy.ndim == 1 else yy.mean(axis=1)
                emb = [round(float(v), 4) for v in hearing.clap_embed(yy, sr)]
                x["embedding"] = emb
                supa.set_clip_embedding(x["clipId"], source_by_path[x["path"]], emb)
            except Exception: pass
        stamp("embedded")
        final = {"facts": facts, "stems": stem_out, "oneshots": shot_out, "name": name, "hearing": heard, "identity": ident, "timing": timing}
        supa.update_job(job.job_id, status="done", progress=100, result=final)
        if rawfp:
            try: supa.cache_put(fingerprint.key_of(rawfp[0]), rawfp[0], rawfp[1], job.owner, base, final, resolved, ident["key"] if ident and ident.get("confident") else None)
            except Exception as e: print("cache put failed", e, flush=True)
        with lock: state["done"] += 1
    except Exception as e:
        traceback.print_exc()
        with lock: state["failed"] += 1
        try: supa.update_job(job.job_id, status="error", error=str(e)[:300])
        except Exception: pass
    finally:
        with lock: state["running"] = None
        shutil.rmtree(tmp, ignore_errors=True)
