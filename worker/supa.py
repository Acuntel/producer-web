"""Supabase REST helpers for the worker (service role; never exposed to a browser)."""
from __future__ import annotations
import json, os
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
    r = requests.post(f"{URL}/rest/v1/clips", headers=_h({"Content-Type": "application/json", "Prefer": "return=representation"}), data=json.dumps(rows), timeout=30)
    r.raise_for_status()
    return r.json()
