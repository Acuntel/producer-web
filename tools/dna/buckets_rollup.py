"""data/dna/buckets.parquet (every marginal-prefix bin) and data/galton.json
(the count>=20, brain-readable subset). docs/DNA_SPEC.md section 3.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
import util

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

    e = df["energy"].astype("float64")
    df["energy_band"] = pd.cut(e, bins=[-np.inf, 0.4, 0.6, 0.8, np.inf], labels=["low", "mid", "high", "peak"], right=False).astype(object).where(e.notna(), "unknown")
    v, a = df["valence_read"].astype("float64"), df["arousal_read"].astype("float64")
    df["feel"] = np.select([v.isna() | a.isna(), (v >= 0.5) & (a >= 0.5), v >= 0.5, a >= 0.5], ["unknown", "lift", "sun", "rush"], default="gut")
    vo = df["voice"].astype("float64") if "voice" in df.columns else pd.Series(np.nan, index=df.index)
    df["voice"] = np.select([vo.isna(), vo >= 0.5], ["unknown", "vocal"], default="instrumental")
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
    # galton.json is a size-budgeted compact export (target <400 KB, section 3);
    # buckets.parquet keeps full 4-decimal precision, this just rounds tighter
    # for the version the brain reads at runtime.
    # NaN is not JSON: a bin with no mode information gets null, never NaN.
    ms = row["mode_share"]; mode_share = round(ms, 2) if ms is not None and ms == ms else None
    if tempo_p50 is not None and tempo_p50 != tempo_p50: tempo_p50 = None
    return {
        "count": row["count"], "tempo_p50": round(tempo_p50, 1) if tempo_p50 is not None else None,
        "mode_share": mode_share,
        "top_progressions": prog, "top_kick_grid": kick[0][0] if kick else None,
        "top_bass_rhythm": bass[0][0] if bass else None,
        "top_contour": contour[0][0] if contour else None,
        "energy_contour": None,  # no per-row energy time-series column exists in songs.parquet
        "exemplars": exemplars[:6],
    }


class Interner:
    """The same hit songs/progressions/grids recur across many overlapping
    marginal bins - store each string once and reference it by index so
    galton.json stays near the section-3 400 KB target instead of repeating
    the same "Artist: Title" strings thousands of times."""

    def __init__(self):
        self.table: list[str] = []
        self.index: dict[str, int] = {}

    def put(self, v: str | None) -> int | None:
        if v is None:
            return None
        if v not in self.index:
            self.index[v] = len(self.table)
            self.table.append(v)
        return self.index[v]


# positional order of a compact bin entry - see the "bin_fields" key written
# into galton.json itself, so a reader needs no separate schema doc.
BIN_FIELDS = ["count", "tempo_p50", "mode_share", "top_progressions", "top_kick_grid",
              "top_bass_rhythm", "top_contour", "energy_contour", "exemplars"]


_YEAR_SUFFIX_RE = re.compile(r"\s*\(\d{4}\)$")


def compact_entry(entry: dict, songs_i: Interner, prog_i: Interner, grid_i: Interner, max_exemplars: int = 12) -> list:
    """A JSON array, not object: with ~2000 bins, repeating 9 field-name strings
    per bin cost more than the actual data (measured: 562 KB of a 662 KB file
    was key-name repetition). bin_fields above documents the order once.
    Exemplar year suffixes are dropped only here (buckets.parquet keeps the
    full "Artist: Title (year)" form) - it was the next-largest lever to stay
    near the section-3 400 KB target."""
    exemplars = [_YEAR_SUFFIX_RE.sub("", e) for e in entry["exemplars"][:max_exemplars]]
    return [
        entry["count"], entry["tempo_p50"], entry["mode_share"],
        [[prog_i.put(p), c] for p, c in entry["top_progressions"]],
        grid_i.put(entry["top_kick_grid"]), grid_i.put(entry["top_bass_rhythm"]),
        grid_i.put(entry["top_contour"]), entry["energy_contour"],
        [songs_i.put(e) for e in exemplars],
    ]


def build_galton(all_rows: list[dict]) -> dict:
    import datetime
    songs_i, prog_i, grid_i = Interner(), Interner(), Interner()
    galton_bins = {}
    for row in all_rows:
        level = int(row["level"])
        # Levels 1-5 ship at 20 songs, the universal levels 6-7 at 50; deeper bins only when one of the sparse pins
        # (meter, structure, harmony, hit tier) is actually known, else they only repeat the level-7 bin.
        if row["count"] < (MIN_GALTON_COUNT if level <= 5 else 50):
            continue
        if level > 7 and all(str(row[c]) in ("unknown", "none") for c in bins.PIN_ORDER[7:level]):
            continue
        group_cols = bins.PIN_ORDER[:row["level"]]
        key = f"{row['level']}:" + "|".join(str(row[c]) for c in group_cols)
        # Deep bins are many; six exemplars each keep the shipped file near two megabytes.
        galton_bins[key] = compact_entry(build_galton_entry(row), songs_i, prog_i, grid_i, 12 if level <= 5 else 6)
    return {"builtAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "bin_fields": BIN_FIELDS, "songs": songs_i.table, "progressions": prog_i.table,
            "grids": grid_i.table, "bins": galton_bins}


def write_galton(galton: dict) -> int:
    GALTON_OUT.write_text(json.dumps(galton, separators=(",", ":"), allow_nan=False))
    galton_bytes = GALTON_OUT.stat().st_size
    print(f"[buckets] galton.json: {len(galton['bins']):,} bins (count>={MIN_GALTON_COUNT}), "
          f"{len(galton['songs']):,} distinct exemplars, {len(galton['progressions']):,} distinct progressions "
          f"-> {GALTON_OUT} ({galton_bytes / 1024:.1f} KB)")
    return galton_bytes


def run(songs: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    df = add_pin_columns(songs)
    all_rows: list[dict] = []
    for level in range(1, len(bins.PIN_ORDER) + 1):
        all_rows.extend(build_level(df, level))

    buckets_df = pd.DataFrame(all_rows)
    BUCKETS_OUT.parent.mkdir(parents=True, exist_ok=True)
    util.write_parquet(buckets_df, BUCKETS_OUT)
    print(f"[buckets] {len(buckets_df):,} total bins -> {BUCKETS_OUT}")

    galton_bytes = write_galton(build_galton(all_rows))
    return buckets_df, galton_bytes
