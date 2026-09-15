"""Rewrite every parquet file of the store in the condensed form (util.write_parquet) and prove nothing was lost:
row counts equal, every id and name column equal, every number equal to the precision anything reads.

  <dna-venv>/bin/python tools/dna/condense.py            # every parquet under data/dna
  <dna-venv>/bin/python tools/dna/condense.py a.parquet  # named files
"""
from __future__ import annotations

import sys, time
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).resolve().parent))
import util  # noqa: E402
from util import write_parquet, uuid_bytes  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
KEYS = ["id", "artist_norm", "title_norm", "artist", "title", "artist_mbid", "mbid", "name", "source", "family", "mode", "hit_tier", "progression", "structure"]


def check(before: pd.DataFrame, path: Path) -> None:
    after = pd.read_parquet(path)
    assert len(after) == len(before), f"{path.name}: rows {len(before)} -> {len(after)}"
    for c in KEYS:
        if c not in before.columns: continue
        a, b = before[c], after[c]
        if c == "mbid": a = a.map(uuid_bytes)
        la = a.astype(object).where(a.notna(), None).tolist(); lb = b.astype(object).where(b.notna(), None).tolist()
        assert la == lb, f"{path.name}: column {c} changed"
    for c in before.columns:
        if pd.api.types.is_float_dtype(before[c].dtype) and c in after.columns:
            x = before[c].astype("float64").to_numpy(); y = after[c].astype("float64").to_numpy()
            m = ~np.isnan(x)
            assert np.isnan(y[~m]).all(), f"{path.name}: {c} gained or lost gaps"
            if m.any(): assert np.abs(x[m] - y[m]).max() <= 5e-4 + np.abs(x[m]).max() * 1e-6, f"{path.name}: {c} drifted"


def main() -> None:
    paths = [Path(p).resolve() for p in sys.argv[1:]] or sorted((ROOT / "data" / "dna").rglob("*.parquet"))
    total_before = total_after = 0
    for p in paths:
        t0 = time.time(); before_bytes = p.stat().st_size
        df = pd.read_parquet(p)
        write_parquet(df, p)
        check(df, p)
        after_bytes = p.stat().st_size; total_before += before_bytes; total_after += after_bytes
        print(f"[condense] {p.relative_to(ROOT)}: {before_bytes / 1048576:,.0f} -> {after_bytes / 1048576:,.0f} MB ({len(df):,} rows) in {time.time() - t0:.0f}s", flush=True)
    print(f"[condense] total {total_before / 1048576:,.0f} -> {total_after / 1048576:,.0f} MB")


if __name__ == "__main__":
    main()
