"""The discovery engine, first form: the store asks its own questions.

For every numeric column the DNA record carries, within every (family, decade) slice with
enough rows, compare hit tiers (number1, top10, top40, charted, never) and rank the
differences by effect size (Cohen's d against the never-charted rows of the same slice) with
the sample sizes attached. The strongest, best-supported differences become plain sentences
the Hands can quote. Writes data/dna/discoveries.json and knowledge/skills/discoveries.md.

  <dna-venv>/bin/python tools/dna/discover.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "dna"
NUMERIC = ["tempo", "energy", "danceability", "valence", "loudness", "acousticness", "speechiness", "instrumentalness",
           "duration_sec", "chord_vocab", "borrowed", "syncopation", "swing", "interval_mean", "range_semis", "repetition",
           "first_chorus_bar", "chorus_share", "section_count"]
NAMES = {"tempo": "tempo", "energy": "energy", "danceability": "danceability", "valence": "happiness (valence)", "loudness": "loudness",
         "acousticness": "acoustic share", "speechiness": "spoken share", "instrumentalness": "instrumental share", "duration_sec": "length in seconds",
         "chord_vocab": "distinct chords", "borrowed": "chords outside the key", "syncopation": "drum syncopation", "swing": "swing",
         "interval_mean": "melodic interval size", "range_semis": "melodic range in semitones", "repetition": "melodic repetition",
         "first_chorus_bar": "bar of the first chorus", "chorus_share": "share of bars that are chorus", "section_count": "number of sections"}
MIN_ROWS = 30


def cohen_d(a: pd.Series, b: pd.Series) -> float | None:
    a = pd.to_numeric(a, errors="coerce").dropna(); b = pd.to_numeric(b, errors="coerce").dropna()
    if len(a) < MIN_ROWS or len(b) < MIN_ROWS: return None
    sp = np.sqrt((a.var(ddof=1) * (len(a) - 1) + b.var(ddof=1) * (len(b) - 1)) / (len(a) + len(b) - 2))
    if not sp or np.isnan(sp): return None
    return float((a.mean() - b.mean()) / sp)


def main() -> None:
    s = pd.read_parquet(DATA / "songs.parquet", columns=["source", "artist_norm", "title_norm", "family", "decade", "hit_tier"] + NUMERIC)
    s["join_key"] = s["artist_norm"].fillna("") + "|" + s["title_norm"].fillna("")
    chart = s[s.source == "billboard"][["join_key", "hit_tier"]].drop_duplicates("join_key")
    measured = s[s.source != "billboard"].drop_duplicates("join_key")
    j = measured.merge(chart, on="join_key", how="left", suffixes=("", "_chart"))
    j["tier"] = j["hit_tier_chart"].fillna("never")
    findings = []
    slices = [("all", "all", j)]
    for (fam, dec), g in j.dropna(subset=["family", "decade"]).groupby(["family", "decade"]):
        if len(g) >= 400: slices.append((fam, str(int(dec)), g))
    for fam, g in j.dropna(subset=["family"]).groupby("family"):
        if len(g) >= 400: slices.append((fam, "all", g))
    for fam, dec, g in slices:
        never = g[g.tier == "never"]
        for tier in ["number1", "top10", "top40", "charted"]:
            hit = g[g.tier == tier]
            for col in NUMERIC:
                d = cohen_d(hit[col], never[col])
                if d is None or abs(d) < 0.35: continue
                findings.append({"family": fam, "decade": dec, "tier": tier, "measure": col, "d": round(d, 2), "hit_p50": round(float(pd.to_numeric(hit[col], errors="coerce").median()), 3), "never_p50": round(float(pd.to_numeric(never[col], errors="coerce").median()), 3), "n_hit": int(hit[col].notna().sum()), "n_never": int(never[col].notna().sum())})
    findings.sort(key=lambda f: (-abs(f["d"]) * np.log10(f["n_hit"] + 1)))
    top = findings[:60]
    (DATA / "discoveries.json").write_text(json.dumps({"count": len(findings), "top": top}, indent=1))
    lines = ["# SKILL: what the store found on its own (effect sizes, hits against never-charted, same family and decade)", "",
             f"{len(findings)} differences with an effect size of at least 0.35 and thirty or more rows on each side; the strongest and best supported first. d is Cohen's d: 0.35 small, 0.5 medium, 0.8 large. Quote the measure, the direction and the size; never invent a cause.", ""]
    for f in top[:25]:
        where = "across everything" if f["family"] == "all" else f"{f['family']}{'' if f['decade'] == 'all' else ' in the ' + f['decade'] + 's'}"
        direction = "higher" if f["d"] > 0 else "lower"
        lines.append(f"- {where}: {f['tier']} records have {direction} {NAMES.get(f['measure'], f['measure'])} than never-charted ones (p50 {f['hit_p50']} vs {f['never_p50']}, d={f['d']}, n={f['n_hit']} vs {f['n_never']}).")
    (ROOT / "knowledge" / "skills" / "discoveries.md").write_text("\n".join(lines) + "\n")
    print(f"{len(findings)} findings; top 12:")
    for f in top[:12]: print(" ", f)


if __name__ == "__main__":
    main()
