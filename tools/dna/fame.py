"""Fame: one score per song from every chart the store knows, plus listens.

Sources: the Billboard weekly rows already in songs.parquet (peak, weeks, hit tier), the harvested chart pages
(data/dna/raw/charts_wiki.parquet: year-end ranks and number-one runs across the Hot 100, Dance Club, R&B/Hip-Hop,
Rap, Country, Alternative, Mainstream Rock, Latin, the UK charts, the Global 200), the buys-now feeds
(viral_now.parquet) and ListenBrainz listens (listens.parquet, joined by MusicBrainz id).

fame in [0, 1]: 0.45 * chart score (year-end rank, number-one runs, how many chart families, how many years)
              + 0.35 * listens score (log listens against the corpus's 99.9th percentile)
              + 0.20 * buys-now score (rank on a current feed, decayed by rank)
Writes data/dna/fame.parquet (artist_norm, title_norm, fame, charts, best_rank, families, years, listens) and
data/dna/charts.parquet (the chart rows folded, for Postgres).   <dna-venv>/bin/python tools/dna/fame.py
"""
from __future__ import annotations

import json, sys, time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import util  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "dna" / "raw"
FAMILY_OF = {"yearend_hot100": "pop", "yearend_global200": "pop", "no1_hot100": "pop", "no1_global200": "pop", "no1_dance_club": "house", "no1_dance_electronic": "electronic",
             "no1_rnb_hiphop": "rnb", "no1_rap": "hiphop", "no1_country": "country", "no1_alternative": "rock", "no1_mainstream_rock": "rock", "no1_latin": "latin",
             "no1_uk": "pop", "no1_uk_dance": "house", "uk_yearend": "pop"}
CHART_NAMES = {"yearend_hot100": "Billboard year-end Hot 100", "yearend_global200": "Billboard year-end Global 200", "no1_hot100": "Hot 100 number ones", "no1_global200": "Global 200 number ones",
               "no1_dance_club": "Dance Club Songs number ones", "no1_dance_electronic": "Hot Dance/Electronic number ones", "no1_rnb_hiphop": "R&B/Hip-Hop number ones", "no1_rap": "Hot Rap Songs number ones",
               "no1_country": "Hot Country Songs number ones", "no1_alternative": "Alternative Airplay number ones", "no1_mainstream_rock": "Mainstream Rock number ones", "no1_latin": "Hot Latin Songs number ones",
               "no1_uk": "UK number ones", "no1_uk_dance": "UK Dance number ones", "uk_yearend": "UK and Ireland best sellers"}


def main() -> None:
    t0 = time.time()
    key = lambda df: df["artist_norm"].fillna("") + "|" + df["title_norm"].fillna("")
    # 1. Charts (harvested pages).
    charts = pd.read_parquet(RAW / "charts_wiki.parquet") if (RAW / "charts_wiki.parquet").exists() else pd.DataFrame(columns=["family", "page", "year", "position", "title", "artist", "artist_norm", "title_norm"])
    charts = charts[(charts["artist_norm"] != "") & (charts["title_norm"] != "") & (charts["artist_norm"] != charts["title_norm"]) & ~charts["title"].astype(str).str.fullmatch(r"\d{4}")].copy()
    charts["k"] = key(charts); charts["yearend"] = charts["family"].str.startswith("yearend") | (charts["family"] == "uk_yearend")
    # A year-end rank counts more the higher it sits; a number-one run counts as rank 1 in that chart.
    charts["rank_score"] = np.where(charts["yearend"], 1.0 - np.clip(charts["position"].fillna(100), 1, 100) / 100.0, 1.0)
    g = charts.groupby("k")
    chart_agg = pd.DataFrame({"chart_hits": g.size(), "best_rank": g.apply(lambda x: int(x.loc[x["yearend"], "position"].min()) if x["yearend"].any() and x.loc[x["yearend"], "position"].notna().any() else None, include_groups=False),
                              "chart_families": g["family"].nunique(), "chart_years": g["year"].nunique(), "rank_sum": g["rank_score"].sum(),
                              "charts": g["family"].apply(lambda s: sorted(set(s))), "years": g["year"].apply(lambda s: sorted(set(int(y) for y in s.dropna()))),
                              "artist": g["artist"].first(), "title": g["title"].first()}).reset_index()
    chart_agg["chart_score"] = np.clip(0.55 * np.log1p(chart_agg["rank_sum"]) / np.log1p(8) + 0.25 * np.clip(chart_agg["chart_families"] / 3, 0, 1) + 0.20 * np.clip(chart_agg["chart_years"] / 3, 0, 1), 0, 1)
    # 2. Billboard weekly from the store: peak and weeks.
    songs = pd.read_parquet(ROOT / "data" / "dna" / "songs.parquet", columns=["id", "source", "artist_norm", "title_norm", "chart_peak", "chart_weeks", "hit_tier", "mbid"] if "mbid" in pd.read_parquet(ROOT / "data" / "dna" / "songs.parquet", columns=None).columns else ["id", "source", "artist_norm", "title_norm", "chart_peak", "chart_weeks", "hit_tier"])
    songs["k"] = key(songs)
    bb = songs[songs["source"] == "billboard"].dropna(subset=["chart_peak"]).copy()
    bb["weekly_score"] = np.clip((1 - (bb["chart_peak"].astype(float) - 1) / 100) * 0.7 + np.clip(bb["chart_weeks"].astype(float) / 40, 0, 1) * 0.3, 0, 1)
    weekly = bb.groupby("k")["weekly_score"].max()
    # 3. Listens by MusicBrainz id -> the AcousticBrainz rows -> names.
    listens = None
    if (RAW / "listens.parquet").exists():
        L = pd.read_parquet(RAW / "listens.parquet").dropna(subset=["listens"])
        ab = pd.read_parquet(RAW / "acousticbrainz_songs.parquet", columns=["artist_norm", "title_norm", "mbid"]).dropna(subset=["mbid"])
        ab["k"] = key(ab); L["mbid"] = L["mbid"].map(bytes); ab["mbid"] = ab["mbid"].map(bytes)
        j = ab.merge(L, on="mbid", how="inner")
        listens = j.groupby("k")["listens"].max()
        top = float(np.quantile(listens, 0.999)) if len(listens) else 1.0
        listen_score = np.clip(np.log1p(listens) / np.log1p(top), 0, 1)
    # 4. Buys now.
    buys = None
    if (RAW / "viral_now.parquet").exists():
        V = pd.read_parquet(RAW / "viral_now.parquet"); V["k"] = key(V)
        V["s"] = 1.0 - np.clip(V["rank"].astype(float), 1, 100) / 100.0
        buys = V.groupby("k")["s"].max()
    # 5. Fold.
    keys = set(chart_agg["k"]) | set(weekly.index) | (set(listens.index) if listens is not None else set()) | (set(buys.index) if buys is not None else set())
    fame = pd.DataFrame({"k": sorted(keys)})
    fame = fame.merge(chart_agg, on="k", how="left")
    fame["weekly"] = fame["k"].map(weekly).fillna(0.0)
    fame["chart_score"] = fame[["chart_score", "weekly"]].max(axis=1).fillna(0.0)
    fame["listens"] = fame["k"].map(listens) if listens is not None else np.nan
    fame["listen_score"] = fame["k"].map(listen_score).fillna(0.0) if listens is not None else 0.0
    fame["buys"] = fame["k"].map(buys).fillna(0.0) if buys is not None else 0.0
    fame["fame"] = np.clip(0.45 * fame["chart_score"] + 0.35 * fame["listen_score"] + 0.20 * fame["buys"], 0, 1).round(4)
    fame[["artist_norm", "title_norm"]] = fame["k"].str.split("|", n=1, expand=True)
    fame["charts"] = fame["charts"].apply(lambda v: json.dumps([CHART_NAMES.get(c, c) for c in (list(v) if isinstance(v, (list, np.ndarray)) else [])]))
    fame["years"] = fame["years"].apply(lambda v: json.dumps([int(y) for y in (list(v) if isinstance(v, (list, np.ndarray)) else [])]))
    out = fame[["artist_norm", "title_norm", "artist", "title", "fame", "chart_score", "listen_score", "buys", "listens", "best_rank", "chart_hits", "chart_families", "chart_years", "charts", "years"]].sort_values("fame", ascending=False)
    util.write_parquet(out, ROOT / "data" / "dna" / "fame.parquet")
    # The chart rows for Postgres: family, chart name, year, position, artist, title, the store's family.
    cw = charts[["family", "page", "year", "position", "artist", "title", "artist_norm", "title_norm", "yearend"]].copy()
    cw["chart"] = cw["family"].map(CHART_NAMES); cw["store_family"] = cw["family"].map(FAMILY_OF)
    util.write_parquet(cw.drop(columns=["family"]).rename(columns={"page": "source_page"}), ROOT / "data" / "dna" / "charts.parquet")
    print(f"[fame] {len(out):,} songs with fame; charts {len(cw):,} rows; listens on {int(out['listens'].notna().sum()):,}; top: {out.head(6)[['artist', 'title', 'fame']].values.tolist()} in {time.time() - t0:.0f}s")
    print("[fame] fame p50/p90/p99:", out["fame"].quantile([0.5, 0.9, 0.99]).round(3).tolist())


if __name__ == "__main__":
    main()
