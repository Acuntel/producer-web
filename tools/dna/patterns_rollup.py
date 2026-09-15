"""data/dna/patterns.parquet: the archetype table. docs/DNA_SPEC.md section 3:
kind (kick | snare | hat | bass | contour | progression | structure), pattern,
family, decade, count, hit_share (share of rows with hit_tier != none), tempo_p50.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd
import util

OUT = Path(__file__).resolve().parents[2] / "data" / "dna" / "patterns.parquet"

KIND_COLUMNS = [
    ("kick", "kick_grid"), ("snare", "snare_grid"), ("hat", "hat_grid"),
    ("bass", "bass_rhythm"), ("contour", "melody_contour"),
    ("progression", "progression"), ("structure", "structure"),
]


def run(songs: pd.DataFrame) -> pd.DataFrame:
    df = songs.copy()
    df["family"] = df["family"].fillna("unknown")
    df["decade"] = df["decade"].astype(object).where(df["decade"].notna(), "unknown")
    df["decade"] = df["decade"].apply(lambda v: str(int(v)) if isinstance(v, (int, float)) else v)
    df["_is_hit"] = (df["hit_tier"] != "none").astype(float)

    frames = []
    for kind, col in KIND_COLUMNS:
        sub = df[df[col].notna()]
        if sub.empty:
            continue
        g = sub.groupby([col, "family", "decade"], dropna=False, observed=True)
        agg = g.agg(count=(col, "size"), hit_share=("_is_hit", "mean"), tempo_p50=("tempo", "median")).reset_index()
        agg = agg.rename(columns={col: "pattern"})
        agg["kind"] = kind
        agg["hit_share"] = agg["hit_share"].round(4)
        agg["tempo_p50"] = agg["tempo_p50"].round(2)
        frames.append(agg[["kind", "pattern", "family", "decade", "count", "hit_share", "tempo_p50"]])

    result = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(
        columns=["kind", "pattern", "family", "decade", "count", "hit_share", "tempo_p50"])
    result = result.sort_values(["kind", "count"], ascending=[True, False])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    util.write_parquet(result, OUT)
    by_kind = result.groupby("kind").size().to_dict()
    print(f"[patterns] {len(result):,} rows across {len(by_kind)} kinds: {by_kind} -> {OUT}")
    return result
