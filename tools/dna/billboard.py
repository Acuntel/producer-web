"""Billboard Hot 100 chart history -> one row per (title, performer).
docs/DNA_SPEC.md section 1: aggregate first_week, last_week, peak_pos (min),
weeks (max wks_on_chart), weeks_at_1, entries.
"""
from __future__ import annotations

import re
import sys
import time
from collections import Counter
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import download
import schema
import util

OUT = Path(__file__).resolve().parents[2] / "data" / "dna" / "raw" / "billboard_songs.parquet"

# Billboard credits featured/backing acts inline: "Elvis Presley With The
# Jordanaires", "Elvis Presley And The Jordanaires", "Bill Haley And His
# Comets". util.norm_artist already collapses "&"/" and " to a space (so
# "and"/"&" never survive into artist_norm) - this has to match on the RAW
# performer string, before that collapsing, to catch all three forms; a
# literal match against artist_norm (which is what the fold rule was first
# specified against) would only ever catch the "with" case.
FOLD_RE = re.compile(r"^(.+?)\s+(with|and|&)\s+(the\s+|his\s+|her\s+)?(.+)$", re.IGNORECASE)


def apply_performer_fold(rows: list[dict]) -> int:
    """Fold "X with/and/& (the/his/her) Y"-credited rows into the head artist X
    when X already charts on its own with more songs than this credited
    variant - e.g. Elvis Presley's post-1958 #1s are split across "Elvis
    Presley", "... With The Jordanaires" and "... And The Jordanaires" as
    three distinct Billboard performer strings otherwise. performer_raw keeps
    the literal chart credit; artist/artist_norm become the head."""
    counts = Counter(r["artist_norm"] for r in rows if r["artist_norm"])
    folded = 0
    for r in rows:
        performer = r["artist"]
        m = FOLD_RE.match(performer)
        if not m:
            continue
        head_raw = m.group(1).strip()
        head_norm = util.norm_artist(head_raw)
        if not head_norm or head_norm == r["artist_norm"]:
            continue
        if counts.get(head_norm, 0) <= counts.get(r["artist_norm"], 0):
            continue
        r["performer_raw"] = performer
        r["artist"] = head_raw
        r["artist_norm"] = head_norm
        r["join_key"] = f"{head_norm}|{r['title_norm']}"
        r["id"] = util.stable_id("billboard", head_norm, r["title_norm"])
        folded += 1
    return folded


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

    folded = apply_performer_fold(rows)

    out = schema.to_frame(rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_parquet(OUT, index=False)
    dt = time.time() - t0
    print(f"[billboard] {n_raw:,} chart rows ({dropped} dropped for bad date) "
          f"-> {len(out):,} songs, {folded:,} folded into a head performer "
          f"in {dt:.1f}s -> {OUT}")
    return out


if __name__ == "__main__":
    run()
