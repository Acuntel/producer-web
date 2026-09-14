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
import math
import os
import sys
from pathlib import Path

import pandas as pd

DATA = Path(__file__).resolve().parents[2] / "data" / "dna"
MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "0008_dna.sql"


def load_ddl() -> str:
    return MIGRATION.read_text()


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
    if isinstance(v, float) and math.isnan(v):
        return None
    if pd.isna(v) if not isinstance(v, (list,)) else False:
        return None
    if isinstance(v, (list, tuple)):
        return list(v)
    if hasattr(v, "item"):
        return v.item()
    return v


def copy_dataframe(cur, table: str, df: pd.DataFrame, json_cols: set[str] = frozenset()):
    from psycopg.types.json import Json
    cols = list(df.columns)
    cur.execute(f"truncate table {table}")
    with cur.copy(f"COPY {table} ({', '.join(cols)}) FROM STDIN") as copy:
        for row in df.itertuples(index=False):
            vals = []
            for col, v in zip(cols, row):
                v = clean(v)
                if col in json_cols and v is not None and not isinstance(v, Json):
                    v = Json(v if isinstance(v, dict) else json.loads(v) if isinstance(v, str) else v)
                vals.append(v)
            copy.write_row(vals)
    print(f"[load_pg] {table}: {len(df):,} rows loaded")


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
        with conn.cursor() as cur:
            cur.execute(ddl)
        conn.commit()
        print("[load_pg] DDL applied")

        songs = pd.read_parquet(DATA / "songs.parquet")
        songs["genres"] = songs["genres"].apply(lambda v: list(v) if isinstance(v, (list,)) else None)
        with conn.cursor() as cur:
            copy_dataframe(cur, "public.dna_songs", songs)

        artists_path = DATA / "artists.parquet"
        if artists_path.exists():
            artists = pd.read_parquet(artists_path)
            for col in ("top_keys", "top_progressions"):
                artists[col] = artists[col].apply(lambda v: list(v) if isinstance(v, (list,)) else [])
            with conn.cursor() as cur:
                copy_dataframe(cur, "public.dna_artists", artists, json_cols=set())

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
                copy_dataframe(cur, "public.dna_buckets", slim, json_cols={"stats"})

        patterns_path = DATA / "patterns.parquet"
        if patterns_path.exists():
            patterns = pd.read_parquet(patterns_path)
            with conn.cursor() as cur:
                copy_dataframe(cur, "public.dna_patterns", patterns)

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
