"""The stems job: find the record (or take the upload), check it is the record that was asked for, hear it,
separate it, publish stems and one-shots, and listen. The original audio is deleted when the job ends."""
from __future__ import annotations
import os, time
from dataclasses import asdict
import analysis, fetch, finder, fingerprint, hearing, identify, resolver, separate, supa
from models import Job

MAX_SECONDS = int(os.environ.get("MAX_SECONDS", "480"))


def _cached_by_url(job: Job, ask: resolver.Ask | None) -> tuple[dict | None, str | None]:
    """A link (or a ranked candidate for a name) that was analyzed before, for anyone. A cached record that
    Shazam named as something other than the ask is not taken: it may be the cover somebody else pulled."""
    src = job.source
    if src.storage_path: return None, None
    urls = [src.url] if src.url else []
    if not urls and src.query:
        try: urls = [c.url for c in finder.search(src.query, None, None, ask=ask)[:6]]
        except Exception: urls = []
    for u in urls:
        known = supa.cache_find_url(u)
        if not known: continue
        if ask and not (resolver.verify(ask, (known.get("result") or {}).get("identity")).ok or fetch.accepts(src, "any")): continue
        return known, u
    return None, None


def _done_from_cache(job: Job, name: str, known: dict, extra: dict) -> None:
    result = supa.adopt_cached(job.owner, job.project_id, name, known)
    result.update({"name": name, "cached": True, "facts": (known.get("result") or {}).get("facts"), **extra})
    supa.update_job(job.job_id, status="done", progress=100, result=result)


def process_stems(job: Job, tmp: str) -> None:
    ask = fetch.ask_of(job.source) if not job.source.url and not job.source.storage_path else None
    known, pre_url = _cached_by_url(job, ask)
    if known:
        print(f"cache hit by url {pre_url}", flush=True)
        name = job.source.name or (known.get("result") or {}).get("name") or "record"
        _done_from_cache(job, name, known, {"version": "original"} if ask else {})
        return
    timing: dict[str, float] = {}; t0 = time.time()
    def stamp(k: str): timing[k] = round(time.time() - t0, 1)
    got = fetch.fetch_source(job, tmp, MAX_SECONDS, verify=bool(ask)); stamp("fetched")
    wav, name, resolved = got.wav, got.name, got.resolved
    version = {"version": got.verdict.version, "versionNote": got.verdict.message} if got.verdict else {}
    supa.update_job(job.job_id, progress=12, result={"stage": "identifying", **version})
    # Who is this: a name, artist, ISRC, label and year from the sound itself. A name ask was identified while
    # it was checked; uploads and captures get their true name here.
    ident = got.ident
    if not got.identified:
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
        _done_from_cache(job, name, known_id, {"identity": ident, "timing": timing, **version})
        return
    supa.update_job(job.job_id, progress=15, result={"stage": "listening: tempo, key, structure", "identity": ident, "name": name, **version})
    facts = analysis.analyze(wav); facts["name"] = name
    if ident: facts["identity"] = ident
    stamp("analyzed")
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
        result = supa.adopt_cached(job.owner, job.project_id, name, cached)
        result.update({"facts": facts, "name": name, "cached": True, "identity": ident, "timing": timing, **version})
        supa.update_job(job.job_id, status="done", progress=100, result=result)
        return
    final = separate_and_publish(job, tmp, wav, name, facts, ident, timing, stamp, version)
    if rawfp:
        try: supa.cache_put(fingerprint.key_of(rawfp[0]), rawfp[0], rawfp[1], job.owner, f"{job.owner}/stems/{job.job_id}", final, resolved, ident["key"] if ident and ident.get("confident") else None)
        except Exception as e: print("cache put failed", e, flush=True)


def separate_and_publish(job: Job, tmp: str, wav: str, name: str, facts: dict, ident: dict | None, timing: dict, stamp, version: dict) -> dict:
    """Vocals first: the hook region's voice, then the whole voice (lossless), then drums, bass and the rest."""
    base = f"{job.owner}/stems/{job.job_id}"
    sep_dir = os.path.join(tmp, "sep")
    bar_sec = 240.0 / float(facts.get("bpm") or 126)
    start = float((facts.get("bestBars") or {}).get("startSec") or 0.0)
    preview: dict = {"stems": [], "oneshots": []}
    def report(progress: int, stage: str, **more) -> None:
        supa.update_job(job.job_id, progress=progress, result={"facts": facts, "stage": stage, "preview": preview, "timing": timing, **version, **more})
    def on_hook(paths: dict) -> None:
        # The best 16 bars' voice lands while the rest of the record is still separating.
        stamp("hookVocal")
        preview["stems"].append({"stem": "vocals", "path": supa.upload(f"{base}/preview-vocals.flac", paths["vocals"], "audio/flac"), "startSec": start, "bars": 16})
        report(35, "the voice of the best bars is here; separating the whole vocal")
        try:
            ps = separate.band_stems(paths["instrumental"], os.path.join(tmp, "psep"))
            for stem, p in ps.items():
                mp3 = os.path.join(tmp, f"preview-{stem}.mp3"); analysis.ffmpeg_to_mp3(p, mp3)
                preview["stems"].append({"stem": stem, "path": supa.upload(f"{base}/preview-{stem}.mp3", mp3, "audio/mpeg"), "startSec": start, "bars": 16})
            shots = analysis.slice_oneshots(ps["drums"], os.path.join(tmp, "pshots")) if "drums" in ps else []
            preview["oneshots"] = [{**asdict(sh), "path": supa.upload(f"{base}/preview-oneshot-{os.path.basename(sh.path)}", sh.path, "audio/wav")} for sh in shots]
            stamp("previewReady"); report(45, "the best bars are separated; separating the whole vocal")
        except Exception as e: print("preview stems failed", e, flush=True)
    report(22, "separating the voice, the best bars first")
    v = separate.vocal(wav, sep_dir, hook_sec=(start, start + 16 * bar_sec), on_hook=on_hook); stamp("vocalSeparated")
    vocal_out = {"stem": "vocals", "path": supa.upload(f"{base}/vocals.flac", v["vocals"], "audio/flac")}
    report(55, "the whole vocal is here; separating the drums, the bass and the rest", stems=[vocal_out])
    stems = {"vocals": v["vocals"], **separate.band_stems(v["instrumental"], sep_dir)}; stamp("separated")
    retempo_from_drums(stems, facts, stamp)
    if os.environ.get("DRUM_PARTS", "1") == "1" and "drums" in stems:
        try:
            for part, path in analysis.drum_parts(stems["drums"], os.path.join(tmp, "parts")).items(): stems[f"drum-{part}"] = path
            stamp("drumParts")
        except Exception as e: print("drum parts failed", e, flush=True)
    shots = analysis.slice_oneshots(stems["drums"], os.path.join(tmp, "shots")) if "drums" in stems else []
    report(72, "uploading", stems=[vocal_out])
    stem_out, shot_out, rows = publish(job, tmp, base, name, facts, stems, shots, {"vocals": vocal_out["path"]})
    stamp("uploaded")
    report(80, "listening", stems=stem_out, oneshots=shot_out, name=name, identity=ident)
    heard = listen(wav, {k: stems[k] for k in ("drums", "bass", "vocals", "other") if k in stems}, facts, stem_out, shot_out, shots, rows)
    stamp("heard")
    final = {"facts": facts, "stems": stem_out, "oneshots": shot_out, "name": name, "hearing": heard, "identity": ident, "timing": timing, "separator": separate.MODEL_NAME, **version}
    supa.update_job(job.job_id, status="done", progress=100, result=final)
    return final


def retempo_from_drums(stems: dict, facts: dict, stamp) -> None:
    """The tempo again, from the drums alone: a mix's vocal and pads blur the onsets the count is made from.
    The drums' read replaces the mix's when it is at least as sure; a refused read changes nothing."""
    if "drums" not in stems: return
    try:
        yd, srd = analysis.load_mono(stems["drums"], 22050)
        bpm_d, conf_d, off_d, alt_d = analysis.tempo_from_drums(yd, srd)
        if bpm_d is not None and conf_d >= float(facts.get("tempoConfidence") or 0):
            facts.update(bpm=bpm_d, tempoConfidence=conf_d, beatOffsetSec=off_d, tempoAlt=alt_d, tempoRefused=False, tempoFrom="drums")
        stamp("drumsTempo")
    except Exception as e: print("drums tempo failed", e, flush=True)


def publish(job: Job, tmp: str, base: str, name: str, facts: dict, stems: dict, shots: list, uploaded: dict[str, str] | None = None) -> tuple[list, list, list]:
    """Stems as clips rows. The vocal was uploaded already, as FLAC; the rest go up as MP3."""
    rows, stem_out, shot_out = [], [], []
    for stem, p in stems.items():
        if uploaded and stem in uploaded: path, mime = uploaded[stem], "audio/flac"
        else:
            mp3 = os.path.join(tmp, f"{stem}.mp3"); analysis.ffmpeg_to_mp3(p, mp3)
            path, mime = supa.upload(f"{base}/{stem}.mp3", mp3, "audio/mpeg"), "audio/mpeg"
        stem_out.append({"stem": stem, "path": path})
        rows.append({"owner": job.owner, "project_id": job.project_id, "name": f"{name} · {stem}", "storage_path": path, "mime": mime, "duration_sec": facts["durationSec"], "bpm": facts["bpm"], "key": facts["key"], "source": {"kind": "stem", "stem": stem, "job_id": job.job_id, "from": name}})
    for sh in shots:
        path = supa.upload(f"{base}/oneshot-{os.path.basename(sh.path)}", sh.path, "audio/wav")
        d = asdict(sh); d["path"] = path; shot_out.append(d)
        rows.append({"owner": job.owner, "project_id": job.project_id, "name": f"{name} · {sh.role}", "storage_path": path, "mime": "audio/wav", "duration_sec": sh.durationSec, "bpm": None, "key": None, "source": {"kind": "oneshot", "role": sh.role, "job_id": job.job_id, "from": name, "fundamentalHz": sh.fundamentalHz, "centroidHz": sh.centroidHz}})
    clips = supa.insert_clips(rows) if rows else []
    by_path = {c["storage_path"]: c["id"] for c in clips}
    for x in stem_out + shot_out: x["clipId"] = by_path.get(x["path"])
    return stem_out, shot_out, rows


def listen(wav: str, stems: dict, facts: dict, stem_out: list, shot_out: list, shots: list, rows: list) -> dict:
    """The ears: per-stem listening, drum and bass transcription, lyrics, descriptors; embeddings land on the rows."""
    try: heard = hearing.hear(wav, stems, facts)
    except Exception as e: heard = {"error": str(e)[:200], "report": ""}
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
            x["embedding"] = [round(float(v), 4) for v in hearing.clap_embed(yy, sr)]
            supa.set_clip_embedding(x["clipId"], source_by_path[x["path"]], x["embedding"])
        except Exception: pass
    return heard
