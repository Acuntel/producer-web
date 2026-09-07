"""Supabase REST helpers for the worker (service role; never exposed to a browser)."""
from __future__ import annotations
import json, os, urllib.parse
import requests

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
BUCKET = os.environ.get("SUPABASE_BUCKET", "clips")


def _h(extra: dict | None = None) -> dict:
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
    if extra: h.update(extra)
    return h


def update_job(job_id: str, **fields) -> None:
    r = requests.patch(f"{URL}/rest/v1/jobs?id=eq.{job_id}", headers=_h({"Content-Type": "application/json", "Prefer": "return=minimal"}), data=json.dumps(fields), timeout=30)
    r.raise_for_status()


def upload(path_in_bucket: str, file_path: str, mime: str) -> str:
    with open(file_path, "rb") as f:
        r = requests.post(f"{URL}/storage/v1/object/{BUCKET}/{path_in_bucket}", headers=_h({"Content-Type": mime, "x-upsert": "true"}), data=f, timeout=300)
    r.raise_for_status()
    return path_in_bucket


def download(path_in_bucket: str, dst: str) -> str:
    with requests.get(f"{URL}/storage/v1/object/{BUCKET}/{path_in_bucket}", headers=_h(), stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(dst, "wb") as f:
            for chunk in r.iter_content(1 << 16): f.write(chunk)
    return dst


def insert_clips(rows: list[dict]) -> list[dict]:
    # PostgREST bulk inserts need every row to carry the same keys; fill the gaps with nulls.
    keys = sorted({k for r in rows for k in r})
    rows = [{k: r.get(k) for k in keys} for r in rows]
    r = requests.post(f"{URL}/rest/v1/clips", headers=_h({"Content-Type": "application/json", "Prefer": "return=representation"}), data=json.dumps(rows), timeout=30)
    if not r.ok: print("insert_clips failed", r.status_code, r.text[:300], flush=True)
    r.raise_for_status()
    return r.json()


def set_clip_embedding(clip_id: str, source: dict, embedding: list[float] | None) -> None:
    """After the listening pass: the embedding lands on the clip row that was published before it."""
    if not embedding: return
    body = {"source": {**source, "embedding": embedding}}
    requests.patch(f"{URL}/rest/v1/clips?id=eq.{clip_id}", headers=_h({"Content-Type": "application/json", "Prefer": "return=minimal"}), data=json.dumps(body), timeout=15)


# --- The mix cache: a tracklist read once at a link serves everyone who asks for that mix again. ---
def mix_cache_find(url: str) -> dict | None:
    if not url or not url.startswith("http"): return None
    r = requests.get(f"{URL}/rest/v1/mix_cache?source_url=eq.{urllib.parse.quote(url, safe='')}&select=source_url,result,hits&limit=1", headers=_h(), timeout=20)
    if not r.ok or not r.json(): return None
    row = r.json()[0]
    requests.patch(f"{URL}/rest/v1/mix_cache?source_url=eq.{urllib.parse.quote(url, safe='')}", headers=_h({"Content-Type": "application/json", "Prefer": "return=minimal"}), data=json.dumps({"hits": (row.get("hits") or 0) + 1}), timeout=10)
    return row


def mix_cache_put(url: str, result: dict) -> None:
    body = {"source_url": url, "result": {k: v for k, v in result.items() if k in ("kind", "name", "durationSec", "tracklist", "sourceUrl", "coveredSec", "partial", "timing")}}
    requests.post(f"{URL}/rest/v1/mix_cache", headers=_h({"Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"}), data=json.dumps(body), timeout=30)


# --- The fingerprint cache: one analyzed record serves everyone who finds it again. ---
def cache_find_url(url: str) -> dict | None:
    """The same source link seen before: no download, no fingerprint."""
    if not url or not url.startswith("http"): return None
    q = urllib.parse.quote(json.dumps([url]))
    r = requests.get(f"{URL}/rest/v1/record_cache?source_urls=cs.{q}&select=fingerprint,base_path,result,hits&limit=1", headers=_h(), timeout=20)
    if not r.ok or not r.json(): return None
    row = r.json()[0]
    requests.patch(f"{URL}/rest/v1/record_cache?fingerprint=eq.{row['fingerprint']}", headers=_h({"Content-Type": "application/json", "Prefer": "return=minimal"}), data=json.dumps({"hits": (row.get("hits") or 0) + 1}), timeout=10)
    return row


def cache_find_identity(identity: str) -> dict | None:
    """The same record (Shazam key) analyzed before, from any copy or capture: no fingerprint needed."""
    if not identity: return None
    r = requests.get(f"{URL}/rest/v1/record_cache?identity=eq.{urllib.parse.quote(identity)}&select=fingerprint,base_path,result,hits&limit=1", headers=_h(), timeout=20)
    if not r.ok or not r.json(): return None
    row = r.json()[0]
    requests.patch(f"{URL}/rest/v1/record_cache?fingerprint=eq.{row['fingerprint']}", headers=_h({"Content-Type": "application/json", "Prefer": "return=minimal"}), data=json.dumps({"hits": (row.get("hits") or 0) + 1}), timeout=10)
    return row


def cache_set_identity(key: str, identity: str) -> None:
    if not identity: return
    requests.patch(f"{URL}/rest/v1/record_cache?fingerprint=eq.{key}", headers=_h({"Content-Type": "application/json", "Prefer": "return=minimal"}), data=json.dumps({"identity": identity}), timeout=10)


def cache_find(raw_fp: list[int], duration: float) -> dict | None:
    """Rows within a few seconds of the same duration, compared by fingerprint similarity."""
    import fingerprint as fpmod
    lo, hi = max(0.0, duration - 6.0), duration + 6.0
    r = requests.get(f"{URL}/rest/v1/record_cache?duration_sec=gte.{lo:.1f}&duration_sec=lte.{hi:.1f}&select=fingerprint,base_path,result,raw&limit=200", headers=_h(), timeout=20)
    if not r.ok: return None
    best, best_sim = None, 0.0
    for row in r.json():
        raw = row.get("raw") or []
        sim = fpmod.similarity(raw_fp, raw) if raw else 0.0
        if sim > best_sim: best, best_sim = row, sim
    if best and best_sim >= fpmod.MATCH:
        print(f"cache match {best['fingerprint']} sim {best_sim}", flush=True)
        requests.patch(f"{URL}/rest/v1/record_cache?fingerprint=eq.{best['fingerprint']}", headers=_h({"Content-Type": "application/json", "Prefer": "return=minimal"}), data=json.dumps({"hits": (best.get("hits") or 0) + 1}), timeout=10)
        return best
    return None


def cache_put(key: str, raw_fp: list[int], duration: float, owner: str, base_path: str, result: dict, source_url: str | None = None, identity: str | None = None) -> None:
    # Copy the finished files to the shared area so any user can read them, then record the result.
    shared = f"shared/records/{key}"
    for kind, items in (("stems", result.get("stems") or []), ("oneshots", result.get("oneshots") or [])):
        for it in items:
            src = it["path"]; dst = f"{shared}/{os.path.basename(src)}"
            rr = requests.post(f"{URL}/storage/v1/object/copy", headers=_h({"Content-Type": "application/json"}), data=json.dumps({"bucketId": BUCKET, "sourceKey": src, "destinationKey": dst}), timeout=60)
            if rr.ok: it["path"] = dst
    body = {"fingerprint": key, "base_path": shared, "raw": raw_fp, "duration_sec": round(duration, 2), "result": {k: v for k, v in result.items() if k in ("facts", "stems", "oneshots", "hearing", "name")}, "first_owner": owner, "source_urls": [source_url] if source_url else [], "identity": identity or None}
    requests.post(f"{URL}/rest/v1/record_cache", headers=_h({"Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"}), data=json.dumps(body), timeout=30)


def cache_add_url(key: str, url: str) -> None:
    """A second source link for a record already in the cache (the same track on another page)."""
    r = requests.get(f"{URL}/rest/v1/record_cache?fingerprint=eq.{key}&select=source_urls", headers=_h(), timeout=10)
    if not r.ok or not r.json(): return
    urls = list(dict.fromkeys((r.json()[0].get("source_urls") or []) + [url]))[:20]
    requests.patch(f"{URL}/rest/v1/record_cache?fingerprint=eq.{key}", headers=_h({"Content-Type": "application/json", "Prefer": "return=minimal"}), data=json.dumps({"source_urls": urls}), timeout=10)


def adopt_cached(owner: str, project_id: str | None, name: str, cached: dict) -> dict:
    """Register the shared files as this user's clips (rows only; the files stay shared)."""
    res = dict(cached.get("result") or {})
    rows = []
    facts = res.get("facts") or {}
    for it in res.get("stems") or []:
        rows.append({"owner": owner, "project_id": project_id, "name": f"{name} · {it['stem']}", "storage_path": it["path"], "mime": "audio/mpeg", "duration_sec": facts.get("durationSec"), "bpm": facts.get("bpm"), "key": facts.get("key"), "source": {"kind": "stem", "stem": it["stem"], "from": name, "cached": True}})
    for it in res.get("oneshots") or []:
        rows.append({"owner": owner, "project_id": project_id, "name": f"{name} · {it['role']}", "storage_path": it["path"], "mime": "audio/wav", "duration_sec": it.get("durationSec"), "source": {"kind": "oneshot", "role": it.get("role"), "from": name, "fundamentalHz": it.get("fundamentalHz"), "centroidHz": it.get("centroidHz"), "embedding": it.get("embedding"), "cached": True}})
    clips = insert_clips(rows) if rows else []
    by_path = {c["storage_path"]: c["id"] for c in clips}
    for it in res.get("stems") or []: it["clipId"] = by_path.get(it["path"])
    for it in res.get("oneshots") or []: it["clipId"] = by_path.get(it["path"])
    return res
