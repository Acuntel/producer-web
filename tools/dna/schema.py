"""The DNA record schema (docs/DNA_SPEC.md section 2): column order, dtypes,
and a row-dict factory so every per-source script produces the exact same
shape before concatenation into data/dna/songs.parquet.
"""
from __future__ import annotations

import pandas as pd

# name -> pandas dtype string. list<string> columns use "object" (python lists).
COLUMNS: list[tuple[str, str]] = [
    ("id", "string"), ("source", "string"), ("title", "string"), ("artist", "string"),
    ("performer_raw", "string"),  # billboard only: the literal chart credit before
    # the "with/and/& the Jordanaires"-style fold into a head artist (billboard.py)
    ("artist_norm", "string"), ("title_norm", "string"), ("join_key", "string"),
    ("year", "Int16"), ("decade", "Int16"), ("genres", "object"), ("family", "string"),
    ("lane", "string"), ("tempo", "Float32"), ("key_pc", "Int8"), ("mode", "string"),
    ("time_sig", "Int8"), ("duration_sec", "Float32"),
    ("energy", "Float32"), ("danceability", "Float32"), ("valence", "Float32"),
    ("loudness", "Float32"), ("acousticness", "Float32"), ("speechiness", "Float32"),
    ("instrumentalness", "Float32"), ("popularity", "Float32"),
    ("chart_peak", "Int16"), ("chart_weeks", "Int16"),
    ("chart_first", "object"), ("chart_last", "object"), ("weeks_at_1", "Int16"),
    ("hit_tier", "string"),
    ("structure", "string"), ("section_count", "Int16"), ("first_chorus_bar", "Int16"),
    ("chorus_share", "Float32"),
    ("progression", "string"), ("chorus_progression", "string"), ("harmony_class", "string"),
    ("chord_vocab", "Int16"), ("borrowed", "Int16"),
    ("kick_grid", "string"), ("snare_grid", "string"), ("hat_grid", "string"),
    ("bass_rhythm", "string"), ("syncopation", "Float32"), ("swing", "Float32"),
    ("melody_contour", "string"), ("interval_mean", "Float32"), ("range_semis", "Int16"),
    ("repetition", "Float32"),
    ("valence_read", "Float32"), ("arousal_read", "Float32"),
    ("tension_read", "Float32"), ("warmth_read", "Float32"),
]

COLUMN_NAMES = [c for c, _ in COLUMNS]

# numeric columns eligible for p10/p50/p90 rollup stats (section 3)
NUMERIC_COLS = [
    "year", "tempo", "duration_sec", "energy", "danceability", "valence",
    "loudness", "acousticness", "speechiness", "instrumentalness", "popularity",
    "chart_peak", "chart_weeks", "weeks_at_1", "section_count", "first_chorus_bar",
    "chorus_share", "chord_vocab", "borrowed", "syncopation", "swing",
    "interval_mean", "range_semis", "repetition",
    "valence_read", "arousal_read", "tension_read", "warmth_read",
]


def empty_row() -> dict:
    return {name: None for name in COLUMN_NAMES}


_INT_RANGES = {"Int8": (-128, 127), "Int16": (-32768, 32767)}


def to_frame(rows: list[dict]) -> pd.DataFrame:
    """Build a DataFrame with exactly COLUMNS, in order, cast to the declared
    dtypes (nullable so missing fields stay null, never invented). A value
    that doesn't fit its declared int width (corrupt source metadata, e.g. a
    malformed MIDI time-signature numerator) is nulled rather than clamped or
    silently wrapped - clamping would print a plausible-looking but false
    number, which is worse than admitting we don't trust the field."""
    df = pd.DataFrame(rows)
    for name in COLUMN_NAMES:
        if name not in df.columns:
            df[name] = None
    df = df[COLUMN_NAMES]
    for name, dtype in COLUMNS:
        if dtype == "object":
            continue
        if dtype in _INT_RANGES:
            lo, hi = _INT_RANGES[dtype]
            numeric = pd.to_numeric(df[name], errors="coerce")
            out_of_range = numeric.notna() & ((numeric < lo) | (numeric > hi))
            n_bad = int(out_of_range.sum())
            if n_bad:
                print(f"[schema] {name}: {n_bad} value(s) out of {dtype} range, nulled")
            df[name] = numeric.where(~out_of_range)
        try:
            df[name] = df[name].astype(dtype)
        except (TypeError, ValueError) as e:
            print(f"[schema] {name}: cast to {dtype} failed ({e}); nulling unparseable values")
            df[name] = pd.to_numeric(df[name], errors="coerce").astype(dtype)
    return df
