"""Generic groupby helpers used by buckets_rollup.py and patterns_rollup.py:
top-N categorical values per group (via groupby+sort+head, not per-group
Python loops, so it stays fast across tens of thousands of groups) and
formatted exemplars.
"""
from __future__ import annotations

import pandas as pd


def top_n_map(df: pd.DataFrame, group_cols: list[str], value_col: str, n: int) -> dict:
    """-> {group_key_tuple: [[value, count], ...]} for the top n values of
    value_col within each group_cols group, skipping nulls."""
    sub = df[df[value_col].notna()]
    if sub.empty:
        return {}
    counts = sub.groupby(group_cols + [value_col], dropna=False, observed=True).size().reset_index(name="_cnt")
    counts = counts.sort_values(group_cols + ["_cnt"], ascending=[True] * len(group_cols) + [False])
    top = counts.groupby(group_cols, dropna=False, observed=True).head(n)
    out: dict = {}
    for key, g in top.groupby(group_cols, dropna=False, observed=True):
        key = key if isinstance(key, tuple) else (key,)
        out[key] = [[str(v), int(c)] for v, c in zip(g[value_col], g["_cnt"])]
    return out


def exemplar_map(df: pd.DataFrame, group_cols: list[str], n: int) -> dict:
    """-> {group_key_tuple: ["Artist: Title (year)", ...]} ordered by chart_peak
    then popularity, per docs/DNA_SPEC.md section 3."""
    sub = df[df["title"].notna()].copy()
    if sub.empty:
        return {}
    sub["_peak"] = sub["chart_peak"].fillna(10_000)
    sub["_pop"] = sub["popularity"].fillna(-1)
    sub = sub.sort_values(group_cols + ["_peak", "_pop"], ascending=[True] * len(group_cols) + [True, False])
    top = sub.groupby(group_cols, dropna=False, observed=True).head(n)
    out: dict = {}
    for key, g in top.groupby(group_cols, dropna=False, observed=True):
        key = key if isinstance(key, tuple) else (key,)
        names = []
        for _, r in g.iterrows():
            artist = r.get("artist")
            artist = "Unknown" if pd.isna(artist) else artist
            title = r.get("title")
            year = f" ({int(r['year'])})" if pd.notna(r.get("year")) else ""
            names.append(f"{artist}: {title}{year}")
        out[key] = names
    return out


def quantile_map(df: pd.DataFrame, group_cols: list[str], numeric_cols: list[str]) -> dict:
    """-> {group_key_tuple: {col: {"p10":.., "p50":.., "p90":..}, ...}}"""
    g = df.groupby(group_cols, dropna=False, observed=True)[numeric_cols]
    q = g.quantile([0.10, 0.50, 0.90])
    out: dict = {}
    for key, sub in q.groupby(level=list(range(len(group_cols)))):
        key = key if isinstance(key, tuple) else (key,)
        vals = sub.droplevel(list(range(len(group_cols))))
        col_stats = {}
        for col in numeric_cols:
            s = vals[col]
            if s.isna().all():
                continue
            col_stats[col] = {
                "p10": _r(s.iloc[0]) if len(s) > 0 else None,
                "p50": _r(s.iloc[1]) if len(s) > 1 else None,
                "p90": _r(s.iloc[2]) if len(s) > 2 else None,
            }
        out[key] = col_stats
    return out


def _r(v):
    if pd.isna(v):  # pd.NA / NaN - `v != v` is ambiguous for pd.NA, so use pd.isna
        return None
    return round(float(v), 4)
