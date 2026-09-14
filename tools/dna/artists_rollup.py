"""data/dna/artists.parquet: one row per artist_norm. docs/DNA_SPEC.md section 3.
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parents[2] / "data" / "dna" / "artists.parquet"


def mode_or_none(s: pd.Series):
    s = s.dropna()
    if s.empty:
        return None
    return s.value_counts().idxmax()


def top_n(s: pd.Series, n: int) -> list[list]:
    s = s.dropna()
    if s.empty:
        return []
    counts = s.value_counts().head(n)
    return [[str(k), int(v)] for k, v in counts.items()]


def exemplars(g: pd.DataFrame, n: int = 12) -> list[str]:
    g2 = g.copy()
    g2["_peak"] = g2["chart_peak"].fillna(10_000)
    g2["_pop"] = g2["popularity"].fillna(-1)
    g2 = g2.sort_values(["_peak", "_pop"], ascending=[True, False])
    out = []
    for _, r in g2.head(n).iterrows():
        title = r.get("title")
        if not title or title in out:
            continue
        out.append(f"{title} ({int(r['year'])})" if pd.notna(r.get("year")) else str(title))
    return out[:n]


def build_one(artist_norm: str, g: pd.DataFrame) -> dict:
    chart = g["chart_peak"].notna()
    mode_known = g["mode"].dropna()
    return {
        "artist_norm": artist_norm,
        "display_name": mode_or_none(g["artist"]),
        "song_count": len(g),
        "chart_songs": int(chart.sum()),
        "number_ones": int((g["hit_tier"] == "number1").sum()),
        "first_year": int(g["year"].min()) if g["year"].notna().any() else None,
        "last_year": int(g["year"].max()) if g["year"].notna().any() else None,
        "decades": sorted(int(d) for d in g["decade"].dropna().unique()),
        "families": sorted(str(f) for f in g["family"].dropna().unique()),
        "tempo_p10": round(g["tempo"].quantile(0.10), 2) if g["tempo"].notna().any() else None,
        "tempo_p50": round(g["tempo"].quantile(0.50), 2) if g["tempo"].notna().any() else None,
        "tempo_p90": round(g["tempo"].quantile(0.90), 2) if g["tempo"].notna().any() else None,
        "mode_major_share": round((mode_known == "major").mean(), 4) if len(mode_known) else None,
        "top_keys": top_n(g["key_pc"], 3),
        "top_progressions": top_n(g["progression"], 5),
        "top_harmony_class": mode_or_none(g["harmony_class"]),
        "energy_p50": round(g["energy"].median(), 4) if g["energy"].notna().any() else None,
        "valence_p50": round(g["valence"].median(), 4) if g["valence"].notna().any() else None,
        "danceability_p50": round(g["danceability"].median(), 4) if g["danceability"].notna().any() else None,
        "structure_mode": mode_or_none(g["structure"]),
        "kick_grid_mode": mode_or_none(g["kick_grid"]),
        "bass_rhythm_mode": mode_or_none(g["bass_rhythm"]),
        "melody_contour_mode": mode_or_none(g["melody_contour"]),
        "exemplars": exemplars(g),
    }


def run(songs: pd.DataFrame) -> pd.DataFrame:
    have_artist = songs[songs["artist_norm"].notna() & (songs["artist_norm"] != "")]
    rows = [build_one(artist_norm, g) for artist_norm, g in have_artist.groupby("artist_norm")]
    df = pd.DataFrame(rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT, index=False)
    print(f"[artists] {len(df):,} artists from {len(have_artist):,} attributable rows -> {OUT}")
    return df
