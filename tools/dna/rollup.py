"""Combine every per-source fragment into data/dna/songs.parquet, then build
the four rollups (docs/DNA_SPEC.md section 3): artists.parquet, buckets.parquet
+ data/galton.json, patterns.parquet, hits.json. Each rollup lives in its own
module (artists_rollup.py, buckets_rollup.py, patterns_rollup.py,
hits_rollup.py) - this file just combines and orchestrates them.
"""
from __future__ import annotations

import re
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import schema
import util

RAW = Path(__file__).resolve().parents[2] / "data" / "dna" / "raw"
SONGS_OUT = Path(__file__).resolve().parents[2] / "data" / "dna" / "songs.parquet"

FRAGMENTS = ["billboard_songs.parquet", "spotify_songs.parquet",
             "chordonomicon_songs.parquet", "lakh_songs.parquet",
             "mcgill_songs.parquet", "library_songs.parquet"]

# "Elvis Presley With The Jordanaires", "... And The Jordanaires", "Bill
# Haley And His Comets": Billboard (and some other sources) credit featured
# or backing acts inline. Applied to artist_norm (after util.norm_artist's
# own "&"/" and " -> " " collapsing), so in practice only the "with" form
# still contains its separator word here - "and"/"&" variants would need to
# be matched against the raw artist string instead, before that collapsing.
FOLD_RE = r"^(.+?)\s+(with|and|&)\s+(the\s+|his\s+|her\s+)?(.+)$"
FOLD_MIN_HEAD_SONGS = 20


def apply_artist_fold(df: pd.DataFrame) -> pd.DataFrame:
    """Global, cross-source fold: an artist_norm matching FOLD_RE whose head
    (group 1) is itself an artist_norm with >= FOLD_MIN_HEAD_SONGS songs gets
    rewritten to that head, so an artist's charting isn't split across
    differently-credited rows. performer_raw preserves the pre-fold artist
    string on the rows this changes."""
    counts = df["artist_norm"].value_counts()
    heads = set(counts[counts >= FOLD_MIN_HEAD_SONGS].index)
    extracted = df["artist_norm"].str.extract(FOLD_RE, flags=re.IGNORECASE)[0].str.strip()
    fold_mask = extracted.notna() & extracted.isin(heads) & (extracted != df["artist_norm"])
    n_folded = int(fold_mask.sum())
    if n_folded:
        df = df.copy()
        df.loc[fold_mask, "performer_raw"] = df.loc[fold_mask, "artist"]
        df.loc[fold_mask, "artist_norm"] = extracted[fold_mask]
        df.loc[fold_mask, "join_key"] = extracted[fold_mask] + "|" + df.loc[fold_mask, "title_norm"]
        df.loc[fold_mask, "id"] = [
            util.stable_id(s, a, t) for s, a, t in
            zip(df.loc[fold_mask, "source"], extracted[fold_mask], df.loc[fold_mask, "title_norm"])
        ]
    print(f"[rollup] artist fold: {n_folded:,} rows folded into a head artist (>= {FOLD_MIN_HEAD_SONGS} songs)")
    return df


def disambiguate_ids(df: pd.DataFrame) -> pd.DataFrame:
    """id = sha1(source|artist_norm|title_norm) collides for real, distinct
    rows within one source: Lakh has several independently-arranged MIDI files
    of the same hit (e.g. three different "Def Leppard - Hysteria" takes), and
    Spotify's catalog has duplicate title/artist entries across releases. These
    are genuinely different rows worth keeping (different tempo, grids, audio
    features), so append -2, -3, ... to the id rather than dropping any of
    them - only load_pg.py's primary key needs the id to be unique."""
    dup_mask = df["id"].duplicated(keep=False)
    if not dup_mask.any():
        return df
    n_before = dup_mask.sum()
    counters: dict[str, int] = {}
    ids = df["id"].tolist()
    for i in df.index[dup_mask]:
        base = ids[i]
        counters[base] = counters.get(base, 0) + 1
        if counters[base] > 1:
            ids[i] = f"{base}-{counters[base]}"
    df = df.copy()
    df["id"] = ids
    print(f"[rollup] {n_before:,} rows shared an id with another row (real duplicate "
          f"content, e.g. multiple Lakh arrangements of the same song) - suffixed to stay unique")
    return df


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
    combined = apply_artist_fold(combined)
    combined = disambiguate_ids(combined)
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
