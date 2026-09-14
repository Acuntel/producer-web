"""More questions for the store, the inquisitive kind: keys of number ones, syncopation and
swing against hit tier (from the MIDI grids), chord vocabulary against tier, tempo against
valence by decade, hook contour against tier, and how the first-chorus bar moved by decade.
Reads data/dna/songs.parquet (+ hits.json) and merges the answers into data/dna/hits.json
under "extra". Run after rollup.py, then `node tools/compile-hits.mjs`.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "dna"
KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
MIN_N = 20


def p50(s: pd.Series) -> float | None:
    s = pd.to_numeric(s, errors="coerce").dropna()
    return round(float(s.median()), 3) if len(s) >= MIN_N else None


def main() -> None:
    cols = ["source", "artist_norm", "title_norm", "decade", "family", "tempo", "key_pc", "mode", "hit_tier", "valence",
            "energy", "danceability", "syncopation", "swing", "chord_vocab", "melody_contour", "first_chorus_bar", "kick_grid"]
    s = pd.read_parquet(DATA / "songs.parquet", columns=cols)
    s["join_key"] = s["artist_norm"].fillna("") + "|" + s["title_norm"].fillna("")
    bb = s[s.source == "billboard"][["join_key", "hit_tier", "decade"]].drop_duplicates("join_key")
    sp = s[s.source == "spotify"].drop_duplicates("join_key")
    lk = s[s.source == "lakh"].drop_duplicates("join_key")
    ch = s[s.source == "chordonomicon"].drop_duplicates("join_key")
    extra: dict = {}

    # Keys of number ones (from the Spotify join): pitch class share, major and minor.
    j = bb.merge(sp[["join_key", "key_pc", "mode", "valence", "tempo"]], on="join_key")
    n1 = j[j.hit_tier == "number1"]
    if len(n1) >= MIN_N:
        keys = n1.dropna(subset=["key_pc"]).groupby(["key_pc", "mode"]).size().sort_values(ascending=False)
        extra["keys_of_number_ones"] = {"n": int(len(n1)), "top": [f"{KEYS[int(k)]} {m}: {round(v / len(n1) * 100)}%" for (k, m), v in keys.head(8).items()]}
    # Tempo against valence, by decade (Spotify rows carry both): does faster mean happier?
    tv = {}
    for d, g in sp.dropna(subset=["tempo", "valence", "decade"]).groupby("decade"):
        if len(g) < 200: continue
        r = float(np.corrcoef(pd.to_numeric(g.tempo), pd.to_numeric(g.valence))[0, 1])
        tv[str(int(d))] = {"n": int(len(g)), "tempo_valence_r": round(r, 3), "tempo_p50": p50(g.tempo), "valence_p50": p50(g.valence)}
    if tv: extra["tempo_vs_valence_by_decade"] = tv
    # Syncopation, swing and chord vocabulary against hit tier (Lakh grids joined to the chart).
    jl = bb.merge(lk[["join_key", "syncopation", "swing", "kick_grid", "melody_contour"]], on="join_key")
    never = lk[~lk.join_key.isin(bb.join_key)]
    tiers = {}
    for t, g in list(jl.groupby("hit_tier")) + [("never_charted", never)]:
        if len(g) < MIN_N: continue
        contours = g.melody_contour.dropna().value_counts(normalize=True).head(3)
        tiers[t] = {"n": int(len(g)), "syncopation_p50": p50(g.syncopation), "swing_p50": p50(g.swing),
                    "four_on_the_floor_share": round(float(g.kick_grid.dropna().str.match(r"^X...X...X...X...$").mean()), 3) if g.kick_grid.notna().any() else None,
                    "top_contours": {k: round(float(v), 2) for k, v in contours.items()}}
    if tiers: extra["groove_by_hit_tier"] = tiers
    jc = bb.merge(ch[["join_key", "chord_vocab", "first_chorus_bar"]], on="join_key")
    cv = {}
    for t, g in jc.groupby("hit_tier"):
        if len(g) >= MIN_N: cv[t] = {"n": int(len(g)), "chord_vocab_p50": p50(g.chord_vocab)}
    if cv: extra["chord_vocab_by_hit_tier"] = cv
    fc = {}
    for d, g in jc.dropna(subset=["first_chorus_bar", "decade"]).groupby("decade"):
        if len(g) >= MIN_N: fc[str(int(d))] = {"n": int(len(g)), "first_chorus_bar_p50": p50(g.first_chorus_bar)}
    if fc: extra["first_chorus_bar_by_decade"] = fc
    # Family of number ones by decade: what genre took the top spot.
    fam = {}
    jf = bb.merge(sp[["join_key", "family"]], on="join_key")
    for d, g in jf[jf.hit_tier == "number1"].dropna(subset=["family", "decade"]).groupby("decade"):
        if len(g) >= MIN_N: fam[str(int(d))] = {"n": int(len(g)), "top": {k: round(float(v), 2) for k, v in g.family.value_counts(normalize=True).head(3).items()}}
    if fam: extra["family_of_number_ones_by_decade"] = fam

    hits_path = DATA / "hits.json"
    hits = json.loads(hits_path.read_text()) if hits_path.exists() else {}
    hits["extra"] = extra
    hits_path.write_text(json.dumps(hits, indent=1))
    print(json.dumps(extra, indent=1)[:3000])


if __name__ == "__main__":
    main()
