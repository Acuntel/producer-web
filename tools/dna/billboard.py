"""Billboard Hot 100 chart history -> one row per (title, performer).
docs/DNA_SPEC.md section 1: aggregate first_week, last_week, peak_pos (min),
weeks (max wks_on_chart), weeks_at_1, entries.

Performer-credit folding ("Elvis Presley With The Jordanaires" -> "Elvis
Presley") happens in rollup.py, after all sources are combined - it needs a
global view of artist_norm song counts, and other sources can carry the same
"X with/and/& Y" pattern too.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import download
import schema
import util

OUT = Path(__file__).resolve().parents[2] / "data" / "dna" / "raw" / "billboard_songs.parquet"


def run() -> pd.DataFrame | None:
    t0 = time.time()
    src = download.ensure("billboard")
    if src is None:
        print("[billboard] SKIPPED: source not downloaded")
        return None

    df = pd.read_csv(src, dtype=str)
    n_raw = len(df)
    df["peak_pos"] = pd.to_numeric(df["peak_pos"], errors="coerce")
    df["current_week"] = pd.to_numeric(df["current_week"], errors="coerce")
    df["wks_on_chart"] = pd.to_numeric(df["wks_on_chart"], errors="coerce")
    df["chart_week"] = pd.to_datetime(df["chart_week"], errors="coerce")
    dropped = df["chart_week"].isna().sum()
    df = df.dropna(subset=["chart_week", "title", "performer"])

    grouped = df.groupby(["title", "performer"], dropna=False)
    agg = grouped.agg(
        first_week=("chart_week", "min"),
        last_week=("chart_week", "max"),
        peak_pos=("peak_pos", "min"),
        weeks=("wks_on_chart", "max"),
        entries=("chart_week", "count"),
    ).reset_index()
    weeks_at_1 = grouped.apply(lambda g: int((g["current_week"] == 1).sum()), include_groups=False)
    agg["weeks_at_1"] = agg.set_index(["title", "performer"]).index.map(weeks_at_1)

    rows = []
    for r in agg.itertuples(index=False):
        artist_norm = util.norm_artist(r.performer)
        title_norm = util.norm_title(r.title)
        row = schema.empty_row()
        peak = int(r.peak_pos) if pd.notna(r.peak_pos) else None
        year = int(r.first_week.year) if pd.notna(r.first_week) else None
        row.update({
            "id": util.stable_id("billboard", artist_norm, title_norm),
            "source": "billboard", "title": r.title, "artist": r.performer,
            "artist_norm": artist_norm, "title_norm": title_norm,
            "join_key": f"{artist_norm}|{title_norm}",
            "year": year, "decade": util.decade_of(year),
            "chart_peak": peak,
            "chart_weeks": int(r.weeks) if pd.notna(r.weeks) else None,
            "chart_first": r.first_week.date() if pd.notna(r.first_week) else None,
            "chart_last": r.last_week.date() if pd.notna(r.last_week) else None,
            "weeks_at_1": int(r.weeks_at_1) if pd.notna(r.weeks_at_1) else 0,
            "hit_tier": util.hit_tier(peak),
        })
        rows.append(row)

    out = schema.to_frame(rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_parquet(OUT, index=False)
    dt = time.time() - t0
    print(f"[billboard] {n_raw:,} chart rows ({dropped} dropped for bad date) "
          f"-> {len(out):,} songs in {dt:.1f}s -> {OUT}")
    return out


if __name__ == "__main__":
    run()
