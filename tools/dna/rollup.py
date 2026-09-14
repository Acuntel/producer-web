"""Combine every per-source fragment into data/dna/songs.parquet, then build
the four rollups (docs/DNA_SPEC.md section 3): artists.parquet, buckets.parquet
+ data/galton.json, patterns.parquet, hits.json. Each rollup lives in its own
module (artists_rollup.py, buckets_rollup.py, patterns_rollup.py,
hits_rollup.py) - this file just combines and orchestrates them.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import schema

RAW = Path(__file__).resolve().parents[2] / "data" / "dna" / "raw"
SONGS_OUT = Path(__file__).resolve().parents[2] / "data" / "dna" / "songs.parquet"

FRAGMENTS = ["billboard_songs.parquet", "spotify_songs.parquet",
             "chordonomicon_songs.parquet", "lakh_songs.parquet",
             "mcgill_songs.parquet", "library_songs.parquet"]


def combine() -> pd.DataFrame:
    frames = []
    for name in FRAGMENTS:
        p = RAW / name
        if not p.exists():
            print(f"[rollup] missing fragment, skipping: {name}")
            continue
        df = pd.read_parquet(p)
        frames.append(df)
        print(f"[rollup] {name}: {len(df):,} rows")
    if not frames:
        raise SystemExit("[rollup] no fragments found - run the per-source scripts first")
    combined = pd.concat(frames, ignore_index=True)
    combined = combined[schema.COLUMN_NAMES]
    SONGS_OUT.parent.mkdir(parents=True, exist_ok=True)
    combined.to_parquet(SONGS_OUT, index=False)
    print(f"[rollup] songs.parquet: {len(combined):,} total rows -> {SONGS_OUT}")
    return combined


def run() -> dict:
    t0 = time.time()
    songs = combine()

    import artists_rollup
    import buckets_rollup
    import hits_rollup
    import patterns_rollup

    artists = artists_rollup.run(songs)
    buckets, galton_bytes = buckets_rollup.run(songs)
    patterns = patterns_rollup.run(songs)
    hits = hits_rollup.run(songs)

    dt = time.time() - t0
    print(f"[rollup] done in {dt:.1f}s")
    return {
        "songs": songs, "artists": artists, "buckets": buckets,
        "galton_bytes": galton_bytes, "patterns": patterns, "hits": hits,
    }


if __name__ == "__main__":
    run()
