"""data/dna/buckets.parquet (every marginal-prefix bin) and data/galton.json
(the count>=20, brain-readable subset). docs/DNA_SPEC.md section 3.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

import bins
import bucket_stats
import schema

BUCKETS_OUT = Path(__file__).resolve().parents[2] / "data" / "dna" / "buckets.parquet"
GALTON_OUT = Path(__file__).resolve().parents[2] / "data" / "galton.json"
MIN_GALTON_COUNT = 20


def add_pin_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    edges = [-np.inf, 90, 110, 122, 132, 145, 160, np.inf]
    labels = ["<90", "90-110", "110-122", "122-132", "132-145", "145-160", ">160"]
    df["tempo_band"] = pd.cut(df["tempo"].astype("float64"), bins=edges, labels=labels, right=False)
    df["tempo_band"] = df["tempo_band"].astype(object).where(df["tempo"].notna(), "unknown")

    k0, k4, k8, k12 = (df["kick_grid"].str[i] for i in (0, 4, 8, 12))
    s4, s8, s12 = (df["snare_grid"].str[i] for i in (4, 8, 12))
    has_grid = df["kick_grid"].notna() & df["snare_grid"].notna() & (df["kick_grid"].str.len() == 16)
    kick_all4 = (k0 == "X") & (k4 == "X") & (k8 == "X") & (k12 == "X")
    snare_2_4 = (s4 == "X") & (s12 == "X")
    snare_3_only = (s8 == "X") & (s4 != "X") & (s12 != "X")
    df["meter_feel"] = np.select(
        [~has_grid.fillna(False), kick_all4.fillna(False), snare_2_4.fillna(False), snare_3_only.fillna(False)],
        ["unknown", "four_floor", "backbeat", "halftime"], default="broken")

    uniq = df["structure"].dropna().unique()
    smap = {s: bins.structure_archetype(s) for s in uniq}
    df["structure_archetype"] = df["structure"].map(smap).fillna("unknown")

    df["mode"] = df["mode"].fillna("unknown")
    df["decade"] = df["decade"].astype(object).where(df["decade"].notna(), "unknown")
    df["decade"] = df["decade"].apply(lambda v: str(int(v)) if isinstance(v, (int, float)) else v)
    df["family"] = df["family"].fillna("unknown")
    df["harmony_class"] = df["harmony_class"].fillna("unknown")
    df["hit_tier"] = df["hit_tier"].fillna("none")
    df["_is_major"] = df["mode"].map({"major": 1.0, "minor": 0.0})
    return df


def build_level(df: pd.DataFrame, level: int) -> list[dict]:
    group_cols = bins.PIN_ORDER[:level]
    counts = df.groupby(group_cols, dropna=False, observed=True).size().reset_index(name="count")
    quant = bucket_stats.quantile_map(df, group_cols, schema.NUMERIC_COLS)
    mode_share = df.groupby(group_cols, dropna=False, observed=True)["_is_major"].mean()
    tops = {name: bucket_stats.top_n_map(df, group_cols, col, n) for name, col, n in [
        ("top_progressions", "progression", 5), ("top_kick_grids", "kick_grid", 3),
        ("top_snare_grids", "snare_grid", 3), ("top_hat_grids", "hat_grid", 3),
        ("top_bass_rhythms", "bass_rhythm", 3), ("top_contours", "melody_contour", 3)]}
    exemplars = bucket_stats.exemplar_map(df, group_cols, 12)

    rows = []
    for _, r in counts.iterrows():
        key = tuple(r[c] for c in group_cols)
        key_t = key if isinstance(key, tuple) else (key,)
        row = {"level": level, "count": int(r["count"])}
        for pin_name, val in zip(group_cols, key_t):
            row[pin_name] = val
        row["mode_share"] = round(float(mode_share.get(key_t)), 4) if pd.notna(mode_share.get(key_t)) else None
        row["stats"] = json.dumps(quant.get(key_t, {}))
        for name in tops:
            row[name] = json.dumps(tops[name].get(key_t, []))
        row["exemplars"] = json.dumps(exemplars.get(key_t, []))
        rows.append(row)
    print(f"[buckets] level {level} ({'+'.join(group_cols)}): {len(rows):,} bins")
    return rows


def build_galton_entry(row: dict) -> dict:
    stats = json.loads(row["stats"])
    tempo_p50 = (stats.get("tempo") or {}).get("p50")
    prog = json.loads(row["top_progressions"])
    kick = json.loads(row["top_kick_grids"])
    bass = json.loads(row["top_bass_rhythms"])
    contour = json.loads(row["top_contours"])
    exemplars = json.loads(row["exemplars"])
    return {
        "count": row["count"], "tempo_p50": tempo_p50, "mode_share": row["mode_share"],
        "top_progressions": prog, "top_kick_grid": kick[0][0] if kick else None,
        "top_bass_rhythm": bass[0][0] if bass else None,
        "top_contour": contour[0][0] if contour else None,
        "energy_contour": None,  # no per-row energy time-series column exists in songs.parquet
        "exemplars": exemplars[:6],
    }


def run(songs: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    df = add_pin_columns(songs)
    all_rows: list[dict] = []
    for level in range(1, len(bins.PIN_ORDER) + 1):
        all_rows.extend(build_level(df, level))

    buckets_df = pd.DataFrame(all_rows)
    BUCKETS_OUT.parent.mkdir(parents=True, exist_ok=True)
    buckets_df.to_parquet(BUCKETS_OUT, index=False)

    galton = {}
    for row in all_rows:
        if row["count"] < MIN_GALTON_COUNT:
            continue
        group_cols = bins.PIN_ORDER[:row["level"]]
        key = f"{row['level']}:" + "|".join(str(row[c]) for c in group_cols)
        galton[key] = build_galton_entry(row)

    GALTON_OUT.write_text(json.dumps(galton, separators=(",", ":")))
    galton_bytes = GALTON_OUT.stat().st_size
    print(f"[buckets] {len(buckets_df):,} total bins -> {BUCKETS_OUT}")
    print(f"[buckets] galton.json: {len(galton):,} bins (count>={MIN_GALTON_COUNT}) "
          f"-> {GALTON_OUT} ({galton_bytes / 1024:.1f} KB)")
    return buckets_df, galton_bytes
