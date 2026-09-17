"""Fame from ListenBrainz (CC0): total listen counts per recording for every fingerprinted recording, joined by
MusicBrainz id. Batches of 1,000 at the API's pace (30 requests per window). Resumable: a partial file is reused.

Writes data/dna/raw/listens.parquet (mbid bytes, listens, listeners).   <dna-venv>/bin/python tools/dna/listens.py
"""
from __future__ import annotations

import sys, time
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import util  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
AB = ROOT / "data" / "dna" / "raw" / "acousticbrainz_songs.parquet"
OUT = ROOT / "data" / "dna" / "raw" / "listens.parquet"
UA = {"User-Agent": "TheProducerResearch/1.0 (bradyschwartz25@gmail.com)"}
uuid = lambda b: (lambda h: f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}")(bytes(b).hex())


def main() -> None:
    t0 = time.time()
    ids = pd.read_parquet(AB, columns=["mbid"])["mbid"].dropna().drop_duplicates().tolist()
    done: dict[bytes, tuple] = {}
    if OUT.exists():
        prev = pd.read_parquet(OUT)
        done = {bytes(r.mbid): (r.listens, r.listeners) for r in prev.itertuples(index=False)}
    todo = [b for b in ids if bytes(b) not in done]
    print(f"[listens] {len(ids):,} recordings, {len(done):,} known, {len(todo):,} to fetch", flush=True)
    rows = list(done.items()); sess = requests.Session(); fails = 0
    for i in range(0, len(todo), 1000):
        batch = todo[i:i + 1000]
        for attempt in range(4):
            try:
                r = sess.post("https://api.listenbrainz.org/1/popularity/recording", json={"recording_mbids": [uuid(b) for b in batch]}, headers=UA, timeout=90)
                if r.status_code == 429: time.sleep(float(r.headers.get("X-RateLimit-Reset-In", 5)) + 1); continue
                r.raise_for_status(); body = r.json(); break
            except Exception as e:
                fails += 1; time.sleep(3 * (attempt + 1)); body = None
        if not body:
            for b in batch: rows.append((bytes(b), (None, None)))
        else:
            by = {x["recording_mbid"]: x for x in body if isinstance(x, dict)}
            for b in batch:
                x = by.get(uuid(b)) or {}
                rows.append((bytes(b), (x.get("total_listen_count"), x.get("total_user_count"))))
        remaining = int(r.headers.get("X-RateLimit-Remaining", 10)) if body else 0
        if remaining <= 2: time.sleep(float(r.headers.get("X-RateLimit-Reset-In", 4)) + 0.5)
        else: time.sleep(0.35)
        if (i // 1000) % 100 == 0:
            print(f"[listens] {min(i + 1000, len(todo)):,}/{len(todo):,} in {time.time() - t0:.0f}s ({fails} retries)", flush=True)
            df = pd.DataFrame([(m, l, u) for m, (l, u) in rows], columns=["mbid", "listens", "listeners"]); util.write_parquet(df, OUT)
    df = pd.DataFrame([(m, l, u) for m, (l, u) in rows], columns=["mbid", "listens", "listeners"])
    util.write_parquet(df, OUT)
    known = df["listens"].notna().sum()
    print(f"[listens] wrote {OUT}: {len(df):,} rows, {known:,} with listens (p50 {df['listens'].median():.0f}, p90 {df['listens'].quantile(0.9):.0f}, max {df['listens'].max():,.0f}) in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
