"""data/dna/hits.json: "why do hits work" tables, docs/DNA_SPEC.md section 3.
Number-ones vs everything-else comparisons, all computed from songs.parquet,
nothing invented - a field is omitted only when the underlying data is absent
for that decade/group.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parents[2] / "data" / "dna" / "hits.json"


def decade_str(v):
    return str(int(v)) if pd.notna(v) else None


def tempo_by_decade(df: pd.DataFrame) -> dict:
    out = {}
    for decade, g in df.groupby(df["decade"].apply(decade_str)):
        if decade is None:
            continue
        n1 = g[g["hit_tier"] == "number1"]["tempo"].dropna()
        none_ = g[g["hit_tier"] == "none"]["tempo"].dropna()
        out[decade] = {
            "number1_tempo_p50": round(n1.median(), 2) if len(n1) else None,
            "never_charted_tempo_p50": round(none_.median(), 2) if len(none_) else None,
        }
    return out


def mode_share(df: pd.DataFrame) -> dict:
    n1 = df[df["hit_tier"] == "number1"]["mode"].dropna()
    charted = df[df["hit_tier"] != "none"]["mode"].dropna()
    return {
        "number1_major_share": round((n1 == "major").mean(), 4) if len(n1) else None,
        "charted_major_share": round((charted == "major").mean(), 4) if len(charted) else None,
    }


def first_chorus_bar_distribution(df: pd.DataFrame) -> dict:
    s = df[df["hit_tier"] == "number1"]["first_chorus_bar"].dropna()
    if not len(s):
        return {}
    return {"p10": round(s.quantile(0.10), 1), "p50": round(s.quantile(0.50), 1), "p90": round(s.quantile(0.90), 1), "n": int(len(s))}


def top_structures(df: pd.DataFrame, n: int = 10) -> list:
    s = df[df["hit_tier"] == "number1"]["structure"].dropna()
    return [[k, int(v)] for k, v in s.value_counts().head(n).items()]


def harmony_class_share(df: pd.DataFrame) -> dict:
    n1 = df[df["hit_tier"] == "number1"]["harmony_class"].dropna()
    all_ = df["harmony_class"].dropna()
    return {
        "number1": {k: round(v, 4) for k, v in (n1.value_counts(normalize=True)).items()},
        "everything": {k: round(v, 4) for k, v in (all_.value_counts(normalize=True)).items()},
    }


def duration_by_decade(df: pd.DataFrame) -> dict:
    out = {}
    for decade, g in df.groupby(df["decade"].apply(decade_str)):
        if decade is None:
            continue
        s = g[g["hit_tier"] == "number1"]["duration_sec"].dropna()
        out[decade] = round(s.median(), 1) if len(s) else None
    return out


def opening_progression_by_decade(df: pd.DataFrame) -> dict:
    n1 = df[df["hit_tier"] == "number1"].copy()
    n1["_opening"] = n1["progression"].dropna().apply(lambda p: " ".join(p.split()[:4]))
    out = {}
    for decade, g in n1.groupby(n1["decade"].apply(decade_str)):
        if decade is None:
            continue
        s = g["_opening"].dropna()
        out[decade] = s.value_counts().index[0] if len(s) else None
    return out


def spotify_priors_by_hit_tier(songs: pd.DataFrame) -> dict:
    billboard = songs[songs["source"] == "billboard"]
    spotify = songs[songs["source"] == "spotify"]
    merged = billboard[["join_key", "hit_tier"]].merge(
        spotify[["join_key", "energy", "danceability", "valence"]], on="join_key", how="inner")
    join_rate = round(len(merged) / len(billboard), 4) if len(billboard) else None
    out = {}
    for tier, g in merged.groupby("hit_tier"):
        out[tier] = {
            "energy_p50": round(g["energy"].median(), 4) if g["energy"].notna().any() else None,
            "danceability_p50": round(g["danceability"].median(), 4) if g["danceability"].notna().any() else None,
            "valence_p50": round(g["valence"].median(), 4) if g["valence"].notna().any() else None,
            "n": int(len(g)),
        }
    return {"join_rate": join_rate, "billboard_songs": int(len(billboard)),
            "matched": int(len(merged)), "by_hit_tier": out}


def run(songs: pd.DataFrame) -> dict:
    out = {
        "tempo_by_decade_number1_vs_never_charted": tempo_by_decade(songs),
        "mode_share_number1_vs_charted": mode_share(songs),
        "first_chorus_bar_distribution_number1": first_chorus_bar_distribution(songs),
        "top_structures_number1": top_structures(songs),
        "harmony_class_share_number1_vs_everything": harmony_class_share(songs),
        "median_duration_number1_by_decade": duration_by_decade(songs),
        "opening_progression_number1_by_decade": opening_progression_by_decade(songs),
        "spotify_priors_by_hit_tier": spotify_priors_by_hit_tier(songs),
    }
    OUT.write_text(json.dumps(out, indent=1))
    print(f"[hits] -> {OUT} ({OUT.stat().st_size / 1024:.1f} KB); "
          f"spotify join rate {out['spotify_priors_by_hit_tier']['join_rate']}")
    return out
