"""Cross-source join chains for hits_rollup.py. Billboard rows carry chart
facts (hit_tier, decade) but no audio/harmony data of their own - every
"number1 vs X" stat needs those facts joined onto the source that actually
measured tempo, chords, or structure, via join_key (artist_norm|title_norm).
"""
from __future__ import annotations

import pandas as pd

MIN_CELL = 20


def sources(songs: pd.DataFrame) -> dict[str, pd.DataFrame]:
    return {
        "billboard": songs[songs["source"] == "billboard"],
        "spotify": songs[songs["source"] == "spotify"],
        # only chordonomicon rows that matched a real Spotify title/artist carry a join_key
        "chordonomicon": songs[(songs["source"] == "chordonomicon") & songs["join_key"].notna()],
        "mcgill": songs[songs["source"] == "mcgill"],
        "lakh": songs[songs["source"] == "lakh"],
    }


def audio_chain(billboard: pd.DataFrame, spotify: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(billboard+spotify matched rows, spotify rows billboard never charted)."""
    bb = billboard[["join_key", "hit_tier", "decade"]]
    sp_cols = ["join_key", "tempo", "key_pc", "mode", "duration_sec",
               "energy", "danceability", "valence"]
    matched = bb.merge(spotify[sp_cols], on="join_key", how="inner")
    never_charted = spotify[~spotify["join_key"].isin(set(billboard["join_key"]))]
    return matched, never_charted


def harmony_chain(billboard: pd.DataFrame, chordonomicon: pd.DataFrame, mcgill: pd.DataFrame) -> pd.DataFrame:
    """Billboard chart facts joined to whichever of chordonomicon/mcgill has
    this song's chords, tagged with which source answered (_src)."""
    bb = billboard[["join_key", "hit_tier", "decade"]]
    cols = ["join_key", "progression", "harmony_class", "structure",
            "first_chorus_bar", "chord_vocab"]
    cc = bb.merge(chordonomicon[cols], on="join_key", how="inner")
    cc["_src"] = "chordonomicon"
    mc = bb.merge(mcgill[cols], on="join_key", how="inner")
    mc["_src"] = "mcgill"
    return pd.concat([cc, mc], ignore_index=True)


def rhythm_chain(billboard: pd.DataFrame, lakh: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(lakh rows for charted songs, lakh rows for songs billboard never charted)."""
    bb_keys = set(billboard["join_key"])
    charted = lakh[lakh["join_key"].isin(bb_keys)]
    never_charted = lakh[~lakh["join_key"].isin(bb_keys)]
    return charted, never_charted


def cell(s: pd.Series, min_n: int = MIN_CELL):
    """median, gated on a minimum sample size - a 3-song median isn't a stat."""
    s = s.dropna()
    if len(s) < min_n:
        return None, len(s)
    return round(s.median(), 4), len(s)
