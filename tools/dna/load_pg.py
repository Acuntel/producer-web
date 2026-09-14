"""Load songs/artists/buckets/patterns parquet into Postgres. Idempotent:
creates tables if missing (same DDL as supabase/migrations/0008_dna.sql),
truncates, bulk-loads with COPY. Skips cleanly if no DSN is given/works -
`python load_pg.py --dsn "$DNA_PG_DSN"` or `DNA_PG_DSN=... python load_pg.py`,
or a data/dna/PG_DSN file. `--dry-run` builds/prints the DDL without
connecting, to sanity-check the script with no database available.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import numpy as np
import pandas as pd

DATA = Path(__file__).resolve().parents[2] / "data" / "dna"
MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "supabase" / "migrations"
MIGRATIONS = ["0008_dna.sql", "0009_dna_performer_raw.sql"]


def load_ddl() -> str:
    return "\n".join((MIGRATIONS_DIR / name).read_text() for name in MIGRATIONS)


def resolve_dsn(cli_dsn: str | None) -> str | None:
    if cli_dsn:
        return cli_dsn
    if os.environ.get("DNA_PG_DSN"):
        return os.environ["DNA_PG_DSN"]
    dsn_file = DATA / "PG_DSN"
    if dsn_file.exists():
        return dsn_file.read_text().strip()
    return None


def clean(v):
    if v is None:
        return None
    # array-like first: pd.isna() on an array returns an array, and `if <array>:`
    # raises "truth value of an array is ambiguous" - check shape before scalar-NA.
    if isinstance(v, (list, tuple, np.ndarray)):
        return list(v)
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(v, "item"):
        return v.item()
    return v


def copy_dataframe(cur, table: str, df: pd.DataFrame, json_cols: set[str] = frozenset(), conn=None, chunk: int = 50_000):
    """Truncate once, then COPY in committed chunks: the pooled connection cancels any single
    statement that runs too long, and the free tier cannot hold two copies of a big table."""
    from psycopg.types.json import Json
    cols = list(df.columns)
    cur.execute(f"truncate table {table}")
    if conn is not None:
        conn.commit()
    n = len(df)
    for start in range(0, n, chunk):
        part = df.iloc[start:start + chunk]
        with cur.copy(f"COPY {table} ({', '.join(cols)}) FROM STDIN") as copy:
            for row in part.itertuples(index=False):
                vals = []
                for col, v in zip(cols, row):
                    v = clean(v)
                    # Integer columns arrive as floats once a fragment carried a gap ("1990.0"): whole floats go as ints.
                    if isinstance(v, float) and v == v and v.is_integer(): v = int(v)
                    if col in json_cols and v is not None and not isinstance(v, Json):
                        v = Json(v if isinstance(v, dict) else json.loads(v) if isinstance(v, str) else v)
                    vals.append(v)
                copy.write_row(vals)
        if conn is not None:
            conn.commit()
        print(f"[load_pg] {table}: {min(start + chunk, n):,}/{n:,} rows", flush=True)
    print(f"[load_pg] {table}: {n:,} rows loaded", flush=True)


def run(dsn: str | None, dry_run: bool) -> None:
    ddl = load_ddl()
    print(f"[load_pg] DDL: {len(ddl):,} bytes, {ddl.count('create table')} tables, "
          f"{ddl.count('create')} create statements")
    if dry_run:
        print("[load_pg] --dry-run: DDL parsed OK, not connecting")
        return
    if not dsn:
        print("[load_pg] SKIPPED: no DSN given (data/dna/PG_DSN missing, DNA_PG_DSN unset). "
              "Parquet files and data/galton.json are the deliverable.")
        return

    import psycopg
    try:
        conn = psycopg.connect(dsn, connect_timeout=10)
    except Exception as e:
        print(f"[load_pg] SKIPPED: connection failed: {e}")
        return

    with conn:
        conn.execute("set statement_timeout = 0")
        conn.execute("set idle_in_transaction_session_timeout = 0")
        with conn.cursor() as cur:
            cur.execute(ddl)
        conn.commit()
        print("[load_pg] DDL applied", flush=True)
        # The trigram indexes make the big copy several times slower: drop them, copy, rebuild.
        conn.execute("drop index if exists public.dna_songs_artist_norm_trgm_idx")
        conn.execute("drop index if exists public.dna_songs_title_norm_trgm_idx")
        conn.commit()

        songs = pd.read_parquet(DATA / "songs.parquet")
        # The free tier holds about 500 MB: the millions of AcousticBrainz rows stay in parquet and the bins; only named sources load.
        skip = {s for s in os.environ.get("DNA_PG_SKIP_SOURCES", "acousticbrainz").split(",") if s}
        if skip: songs = songs[~songs["source"].isin(skip)]
        # parquet round-trips list<string> columns as numpy.ndarray, not list
        songs["genres"] = songs["genres"].apply(lambda v: list(v) if isinstance(v, (list, np.ndarray)) else None)
        with conn.cursor() as cur:
            copy_dataframe(cur, "public.dna_songs", songs, conn=conn)
        with conn.cursor() as cur:
            cur.execute(ddl)   # rebuilds the trigram indexes (create index if not exists)
        conn.commit()
        print("[load_pg] indexes rebuilt", flush=True)

        artists_path = DATA / "artists.parquet"
        if artists_path.exists():
            artists = pd.read_parquet(artists_path)
            # Same tier rule for artists: one row per artist that a named source knows, plus the artists the
            # skipped sources alone know when they carry enough recordings to say something about them.
            named = set(songs["artist_norm"].dropna())
            min_songs = int(os.environ.get("DNA_PG_ARTISTS_MIN", "5"))
            before = len(artists)
            artists = artists[artists["artist_norm"].isin(named) | (artists["song_count"] >= min_songs)]
            print(f"[load_pg] artists: {len(artists):,} of {before:,} rows load (named sources, or {min_songs}+ recordings elsewhere)", flush=True)
            for col in ("decades", "families", "exemplars"):
                artists[col] = artists[col].apply(lambda v: list(v) if isinstance(v, (list, np.ndarray)) else [])
            # top_keys/top_progressions are JSON-encoded strings (artists_rollup.py:
            # nested [[value, count], ...] pairs don't survive pyarrow's plain-list
            # inference) - the DDL declares them jsonb, so load as JSON, not text[].
            with conn.cursor() as cur:
                copy_dataframe(cur, "public.dna_artists", artists, json_cols={"top_keys", "top_progressions"}, conn=conn)
            conn.commit()

        buckets_path = DATA / "buckets.parquet"
        if buckets_path.exists():
            buckets = pd.read_parquet(buckets_path)
            keep = ["level", "tempo_band", "meter_feel", "mode", "decade", "family",
                    "structure_archetype", "harmony_class", "hit_tier", "count", "mode_share"]
            stat_cols = [c for c in buckets.columns if c not in keep]
            buckets["stats"] = buckets[stat_cols].apply(
                lambda r: json.dumps({c: json.loads(r[c]) if isinstance(r[c], str) else r[c] for c in stat_cols}), axis=1)
            slim = buckets[[c for c in keep if c in buckets.columns] + ["stats"]]
            with conn.cursor() as cur:
                copy_dataframe(cur, "public.dna_buckets", slim, json_cols={"stats"}, conn=conn)
            conn.commit()

        patterns_path = DATA / "patterns.parquet"
        # The app reads patterns from parquet only; on the free tier the 647k-row table costs 105 MB of the 500 MB.
        if patterns_path.exists() and os.environ.get("DNA_SKIP_PATTERNS") != "1":
            patterns = pd.read_parquet(patterns_path)
            with conn.cursor() as cur:
                copy_dataframe(cur, "public.dna_patterns", patterns, conn=conn)

        conn.commit()
    print("[load_pg] done")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dsn", default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    run(resolve_dsn(args.dsn), args.dry_run)


if __name__ == "__main__":
    main()
