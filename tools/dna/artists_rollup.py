"""data/dna/artists.parquet: one row per artist_norm. docs/DNA_SPEC.md section 3.

Fully vectorized: no per-artist Python loop. Scalar stats use pandas'
groupby reductions (quantile/median/mean/min/max are Cython, not per-group
Python calls); "most common X" stats reuse bucket_stats.top_n_map's
groupby+sort+head trick, which is the same idea at n=1.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import util

import bucket_stats

OUT = Path(__file__).resolve().parents[2] / "data" / "dna" / "artists.parquet"
GROUP = ["artist_norm"]


def top1(m: dict, key: tuple) -> str | None:
    vals = m.get(key)
    return vals[0][0] if vals else None


def run(songs: pd.DataFrame) -> pd.DataFrame:
    df = songs[songs["artist_norm"].notna() & (songs["artist_norm"] != "")].copy()
    df["_is_major"] = df["mode"].map({"major": 1.0, "minor": 0.0})
    df["_is_number1"] = (df["hit_tier"] == "number1").astype(int)

    g = df.groupby("artist_norm", observed=True)
    base = pd.DataFrame({
        "song_count": g.size(),
        "chart_songs": g["chart_peak"].count(),
        "number_ones": g["_is_number1"].sum(),
        "first_year": g["year"].min(),
        "last_year": g["year"].max(),
        "tempo_p10": g["tempo"].quantile(0.10),
        "tempo_p50": g["tempo"].quantile(0.50),
        "tempo_p90": g["tempo"].quantile(0.90),
        "mode_major_share": g["_is_major"].mean(),
        "energy_p50": g["energy"].median(),
        "valence_p50": g["valence"].median(),
        "danceability_p50": g["danceability"].median(),
    }).reset_index()

    decades = g["decade"].apply(lambda s: sorted(int(d) for d in s.dropna().unique()))
    families = g["family"].apply(lambda s: sorted(str(f) for f in s.dropna().unique()))
    base["decades"] = base["artist_norm"].map(decades)
    base["families"] = base["artist_norm"].map(families)

    display_name = bucket_stats.top_n_map(df, GROUP, "artist", 1)
    top_keys = bucket_stats.top_n_map(df, GROUP, "key_pc", 3)
    top_progressions = bucket_stats.top_n_map(df, GROUP, "progression", 5)
    top_harmony = bucket_stats.top_n_map(df, GROUP, "harmony_class", 1)
    structure_m = bucket_stats.top_n_map(df, GROUP, "structure", 1)
    kick_m = bucket_stats.top_n_map(df, GROUP, "kick_grid", 1)
    bass_m = bucket_stats.top_n_map(df, GROUP, "bass_rhythm", 1)
    contour_m = bucket_stats.top_n_map(df, GROUP, "melody_contour", 1)
    exemplars = bucket_stats.exemplar_map(df, GROUP, 12)

    def key(artist_norm: str) -> tuple:
        return (artist_norm,)

    base["display_name"] = base["artist_norm"].apply(lambda a: top1(display_name, key(a)))
    # nested [[value, count], ...] pairs: json-encode so pyarrow doesn't have to
    # infer a type across irregular nested python objects (it chokes on that).
    base["top_keys"] = base["artist_norm"].apply(lambda a: json.dumps(top_keys.get(key(a), [])))
    base["top_progressions"] = base["artist_norm"].apply(lambda a: json.dumps(top_progressions.get(key(a), [])))
    base["top_harmony_class"] = base["artist_norm"].apply(lambda a: top1(top_harmony, key(a)))
    base["structure_mode"] = base["artist_norm"].apply(lambda a: top1(structure_m, key(a)))
    base["kick_grid_mode"] = base["artist_norm"].apply(lambda a: top1(kick_m, key(a)))
    base["bass_rhythm_mode"] = base["artist_norm"].apply(lambda a: top1(bass_m, key(a)))
    base["melody_contour_mode"] = base["artist_norm"].apply(lambda a: top1(contour_m, key(a)))
    base["exemplars"] = base["artist_norm"].apply(lambda a: exemplars.get(key(a), []))

    for col in ("tempo_p10", "tempo_p50", "tempo_p90", "mode_major_share",
                "energy_p50", "valence_p50", "danceability_p50"):
        base[col] = base[col].round(4)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    util.write_parquet(base, OUT)
    print(f"[artists] {len(base):,} artists from {len(df):,} attributable rows -> {OUT}")
    return base
