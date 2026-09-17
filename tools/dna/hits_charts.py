"""The charts skill: what the biggest records of each chart family and decade measure, from the harvested charts
joined to the store's rows. Writes knowledge/skills/charts.md.   <dna-venv>/bin/python tools/dna/hits_charts.py
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    charts = pd.read_parquet(ROOT / "data" / "dna" / "charts.parquet")
    songs = pd.read_parquet(ROOT / "data" / "dna" / "songs.parquet", columns=["source", "artist_norm", "title_norm", "tempo", "mode", "energy", "valence", "danceability", "family", "chord_vocab", "progression", "harmony_class", "syncopation"])
    songs = songs[songs["source"] != "chordonomicon"].drop_duplicates(["artist_norm", "title_norm"])   # measured rows first; chord sheets add nothing here
    j = charts.merge(songs, on=["artist_norm", "title_norm"], how="inner")
    j["decade"] = (j["year"] // 10 * 10).astype("Int64")
    lines = ["# SKILL: the charts (every genre, every year; what the biggest records measure)", "",
             f"{len(charts):,} chart rows from {charts['source_page'].nunique()} pages across {charts['chart'].nunique()} charts; {len(j):,} of them measured in the store. Quote a number, never an adjective; say the chart and the decade.", ""]
    for chart, g in j.groupby("chart"):
        if len(g) < 60: continue
        lines.append(f"## {chart} ({len(g):,} measured records, {int(g['year'].min())} to {int(g['year'].max())})")
        for dec, d in g.groupby("decade"):
            if len(d) < 25: continue
            t = pd.to_numeric(d["tempo"], errors="coerce").dropna(); mn = (d["mode"] == "minor").mean(); e = pd.to_numeric(d["energy"], errors="coerce").dropna(); v = pd.to_numeric(d["valence"], errors="coerce").dropna()
            hc = d["harmony_class"].dropna().value_counts(normalize=True).head(2)
            fam = d["family"].dropna().value_counts(normalize=True).head(2)
            lines.append(f"- {int(dec)}s ({len(d)}): tempo p50 {t.median():.0f}{f' (p25 {t.quantile(0.25):.0f}, p75 {t.quantile(0.75):.0f})' if len(t) > 8 else ''}; {mn * 100:.0f}% minor" + (f"; energy p50 {e.median():.2f}" if len(e) else "") + (f"; valence p50 {v.median():.2f}" if len(v) else "")
                         + (f"; harmony {', '.join(f'{k} {p * 100:.0f}%' for k, p in hc.items())}" if len(hc) else "") + (f"; families {', '.join(f'{k} {p * 100:.0f}%' for k, p in fam.items())}" if len(fam) else "") + ".")
        lines.append("")
    # The all-time year-end top ten: the records a producer is expected to know.
    top = charts[charts["yearend"] & charts["position"].between(1, 3)].sort_values(["year", "position"])
    if len(top):
        lines.append("## Year-end top three, the last dozen years (Billboard Hot 100 and the UK best sellers)")
        for y, g in top[top["year"] >= top["year"].max() - 12].groupby("year"):
            lines.append(f"- {int(y)}: " + "; ".join(f"{r.position}. {r.artist}: {r.title}" for r in g.drop_duplicates(['artist_norm', 'title_norm']).head(3).itertuples()))
    out = ROOT / "knowledge" / "skills" / "charts.md"; out.write_text("\n".join(lines) + "\n")
    print(f"[charts skill] {len(j):,} measured chart records; wrote {out} ({out.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
