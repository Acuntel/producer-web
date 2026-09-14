"""data/dna/hits.json: "why do hits work" tables, docs/DNA_SPEC.md section 3.

Billboard rows carry chart facts but no tempo/chords/structure of their own
(those live on spotify/chordonomicon/mcgill/lakh rows), so every stat here
joins billboard onto the source that measured the thing being asked about, via
hits_chains.py. Numeric cells are omitted (not zero, not guessed) below
hits_chains.MIN_CELL=20 rows. Nothing here is invented; a field stays null
when the underlying join doesn't reach enough rows.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

import hits_chains as hc

OUT = Path(__file__).resolve().parents[2] / "data" / "dna" / "hits.json"


def _json_default(o):
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return float(o)
    if o is pd.NA or (isinstance(o, float) and o != o):
        return None
    raise TypeError(f"Object of type {type(o)} is not JSON serializable")


def decade_str(v):
    return str(int(v)) if pd.notna(v) else None


def audio_by_decade(matched: pd.DataFrame, never_charted: pd.DataFrame) -> dict:
    out = {}
    for decade, g in matched.groupby(matched["decade"].apply(decade_str)):
        if decade is None:
            continue
        n1, n1_n = hc.cell(g[g["hit_tier"] == "number1"]["tempo"])
        out[decade] = {"number1_tempo_p50": n1, "number1_n": n1_n}
    never_p50, never_n = hc.cell(never_charted["tempo"])
    return {
        "by_decade": out,
        "never_charted_tempo_p50_overall": never_p50, "never_charted_n": never_n,
        "note": "never-charted has no decade breakdown: Spotify's dataset carries no release year",
    }


def audio_by_tier(matched: pd.DataFrame) -> dict:
    out = {}
    for tier, g in matched.groupby("hit_tier"):
        n_energy, n = hc.cell(g["energy"])
        v_p50, _ = hc.cell(g["valence"])
        d_p50, _ = hc.cell(g["danceability"])
        dur_p50, _ = hc.cell(g["duration_sec"])
        out[tier] = {"energy_p50": n_energy, "valence_p50": v_p50,
                     "danceability_p50": d_p50, "duration_p50": dur_p50, "n": n}
    return out


def audio_by_tier_and_decade(matched: pd.DataFrame) -> dict:
    out = {}
    for (tier, decade), g in matched.groupby(["hit_tier", matched["decade"].apply(decade_str)]):
        if decade is None:
            continue
        e_p50, n = hc.cell(g["energy"])
        if n < hc.MIN_CELL:
            continue
        out.setdefault(decade, {})[tier] = {
            "energy_p50": e_p50, "danceability_p50": hc.cell(g["danceability"])[0],
            "valence_p50": hc.cell(g["valence"])[0], "n": n,
        }
    return out


def mode_share(matched: pd.DataFrame) -> dict:
    n1 = matched[matched["hit_tier"] == "number1"]["mode"].dropna()
    charted = matched["mode"].dropna()
    return {
        "number1_major_share": round((n1 == "major").mean(), 4) if len(n1) >= hc.MIN_CELL else None,
        "number1_n": len(n1),
        "charted_major_share": round((charted == "major").mean(), 4) if len(charted) >= hc.MIN_CELL else None,
        "charted_n": len(charted),
    }


def harmony_stats(harmony: pd.DataFrame, all_songs: pd.DataFrame) -> dict:
    n1 = harmony[harmony["hit_tier"] == "number1"]
    fcb = n1["first_chorus_bar"].dropna()
    fcb_stats = ({"p10": round(fcb.quantile(.1), 1), "p50": round(fcb.quantile(.5), 1),
                  "p90": round(fcb.quantile(.9), 1), "n": int(len(fcb))}
                 if len(fcb) >= hc.MIN_CELL else {"n": int(len(fcb))})
    structures = n1["structure"].dropna()
    top_structures = [[k, int(v)] for k, v in structures.value_counts().head(10).items()]
    hc_n1 = n1["harmony_class"].dropna()
    hc_all = all_songs["harmony_class"].dropna()
    return {
        "first_chorus_bar_distribution_number1": fcb_stats,
        "top_structures_number1": top_structures,
        "harmony_class_share_number1_vs_everything": {
            "number1": {k: round(v, 4) for k, v in hc_n1.value_counts(normalize=True).items()} if len(hc_n1) >= hc.MIN_CELL else {},
            "number1_n": int(len(hc_n1)),
            "everything": {k: round(v, 4) for k, v in hc_all.value_counts(normalize=True).items()},
        },
        "chord_vocab_p50_number1": round(n1["chord_vocab"].dropna().median(), 2) if n1["chord_vocab"].notna().sum() >= hc.MIN_CELL else None,
    }


def duration_by_decade(matched: pd.DataFrame) -> dict:
    out = {}
    for decade, g in matched[matched["hit_tier"] == "number1"].groupby(matched["decade"].apply(decade_str)):
        if decade is None:
            continue
        p50, n = hc.cell(g["duration_sec"], min_n=5)  # #1s per decade are naturally few
        out[decade] = {"median_duration_sec": p50, "n": n}
    return out


def opening_progressions(harmony: pd.DataFrame) -> dict:
    n1 = harmony[harmony["hit_tier"] == "number1"].copy()
    n1["_opening"] = n1["progression"].dropna().apply(lambda p: " ".join(p.split()[:4]))
    out = {}
    for decade, g in n1.groupby(n1["decade"].apply(decade_str)):
        if decade is None or g["_opening"].dropna().empty:
            continue
        # prefer chordonomicon (bigger n) but fall back to mcgill for older
        # decades it doesn't reach; report whichever source actually answered
        for src in ("chordonomicon", "mcgill"):
            s = g[g["_src"] == src]["_opening"].dropna()
            if len(s) >= 3:
                out[decade] = {"opening": s.value_counts().index[0], "source": src, "n": int(len(s))}
                break
    return out


def progression_reach(billboard_n: int, harmony: pd.DataFrame) -> dict:
    reached = harmony["join_key"].nunique()
    return {"billboard_songs": billboard_n, "reached_progression": int(reached),
            "reach_rate": round(reached / billboard_n, 4) if billboard_n else None}


def rhythm_stats(charted: pd.DataFrame, never_charted: pd.DataFrame) -> dict:
    def top(df, col, n=5):
        s = df[col].dropna()
        return [[k, int(v)] for k, v in s.value_counts().head(n).items()]
    return {
        "charted_n": int(len(charted)), "never_charted_n": int(len(never_charted)),
        "charted_top_structures": top(charted, "structure"),
        "never_charted_top_structures": top(never_charted, "structure"),
        "charted_top_kick_grids": top(charted, "kick_grid"),
        "never_charted_top_kick_grids": top(never_charted, "kick_grid"),
    }


def run(songs: pd.DataFrame) -> dict:
    src = hc.sources(songs)
    audio_matched, audio_never = hc.audio_chain(src["billboard"], src["spotify"])
    harmony = hc.harmony_chain(src["billboard"], src["chordonomicon"], src["mcgill"])
    rhythm_charted, rhythm_never = hc.rhythm_chain(src["billboard"], src["lakh"])

    join_counts = {
        "billboard_x_spotify": int(len(audio_matched)),
        "billboard_x_chordonomicon": int((harmony["_src"] == "chordonomicon").sum()),
        "billboard_x_mcgill": int((harmony["_src"] == "mcgill").sum()),
        "billboard_x_lakh": int(len(rhythm_charted)),
    }

    out = {
        "join_counts": join_counts,
        "tempo_by_decade_number1_vs_never_charted": audio_by_decade(audio_matched, audio_never),
        "mode_share_number1_vs_charted": mode_share(audio_matched),
        "spotify_priors_by_hit_tier": {
            "join_rate": round(len(audio_matched) / len(src["billboard"]), 4),
            "billboard_songs": int(len(src["billboard"])), "matched": int(len(audio_matched)),
            "by_hit_tier": audio_by_tier(audio_matched),
        },
        "spotify_priors_by_hit_tier_and_decade": audio_by_tier_and_decade(audio_matched),
        "median_duration_number1_by_decade": duration_by_decade(audio_matched),
        "progression_reach": progression_reach(len(src["billboard"]), harmony),
        "opening_progression_number1_by_decade": opening_progressions(harmony),
        "structure_kick_grid_charted_vs_never_charted": rhythm_stats(rhythm_charted, rhythm_never),
    }
    out.update(harmony_stats(harmony, songs))

    OUT.write_text(json.dumps(out, indent=1, default=_json_default))
    print(f"[hits] -> {OUT} ({OUT.stat().st_size / 1024:.1f} KB); join counts: {join_counts}")
    return out


if __name__ == "__main__":
    songs = pd.read_parquet(Path(__file__).resolve().parents[2] / "data" / "dna" / "songs.parquet")
    run(songs)
