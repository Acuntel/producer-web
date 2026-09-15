"""Shared helpers for the DNA pipeline: normalization, ids, tempo folding, clamp/normalize."""
from __future__ import annotations

import hashlib
import re
import unicodedata

FEAT_RE = re.compile(r"\s+(feat\.?|featuring)\b.*$", re.IGNORECASE)
AMP_AND_RE = re.compile(r"\s*&\s*|\s+\band\b\s+", re.IGNORECASE)
PAREN_RE = re.compile(r"\s*\([^)]*\)\s*")
BRACKET_RE = re.compile(r"\s*\[[^\]]*\]\s*")
REMASTER_RE = re.compile(r"\s*-\s*(remaster(ed)?( \d{4})?|live( at .*)?|mono|stereo|single( version)?|radio edit)\s*$", re.IGNORECASE)
SPACE_RE = re.compile(r"\s+")


def strip_punct(s: str) -> str:
    """Keep letters/digits from ANY script and spaces, drop punctuation/symbols.
    A plain ASCII-only regex ([^a-z0-9 ]) would wipe out every non-Latin title
    (Chinese, Korean, Cyrillic, ...) to an empty string, colliding thousands of
    genuinely different songs onto the same normalized id - str.isalnum() is
    Unicode-aware and keeps them."""
    return "".join(c if (c.isalnum() or c == " ") else " " for c in s)


def ascii_fold(s: str) -> str:
    if not s:
        return ""
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def norm_artist(s: str | None) -> str:
    if not s:
        return ""
    s = ascii_fold(str(s)).lower()
    s = FEAT_RE.sub("", s)
    s = AMP_AND_RE.sub(" ", s)
    s = strip_punct(s)
    s = SPACE_RE.sub(" ", s).strip()
    return s


def norm_title(s: str | None) -> str:
    if not s:
        return ""
    s = ascii_fold(str(s)).lower()
    # strip remaster/live tails before removing parens, then again after (order matters
    # for "Song - Remaster" vs "Song (Live)")
    s = REMASTER_RE.sub("", s)
    s = PAREN_RE.sub(" ", s)
    s = BRACKET_RE.sub(" ", s)
    s = REMASTER_RE.sub("", s)
    s = strip_punct(s)
    s = SPACE_RE.sub(" ", s).strip()
    return s


def stable_id(source: str, artist_norm: str, title_norm: str) -> str:
    key = f"{source}|{artist_norm}|{title_norm}"
    return hashlib.sha1(key.encode("utf-8")).hexdigest()


def fold_tempo(bpm: float | None) -> float | None:
    """Fold a BPM reading into the 60-180 range by halving or doubling."""
    if bpm is None or bpm != bpm or bpm <= 0:  # nan check
        return None
    t = float(bpm)
    while t > 180:
        t /= 2
    while t < 60:
        t *= 2
    return round(t, 2)


def clamp01(x: float) -> float:
    if x < 0:
        return 0.0
    if x > 1:
        return 1.0
    return x


def normalize(x: float | None, lo: float, hi: float) -> float | None:
    """Linear-normalize x into 0..1 against [lo, hi], clamped. None passes through."""
    if x is None:
        return None
    if x != x:  # nan
        return None
    v = (x - lo) / (hi - lo)
    if v < 0:
        return 0.0
    if v > 1:
        return 1.0
    return v


def hit_tier(peak_pos: int | None) -> str:
    if peak_pos is None:
        return "none"
    if peak_pos == 1:
        return "number1"
    if peak_pos <= 10:
        return "top10"
    if peak_pos <= 40:
        return "top40"
    return "charted"


def decade_of(year: int | None) -> int | None:
    if year is None:
        return None
    return (int(year) // 10) * 10


# --- The condensed parquet form (masterprompt section 13) ---------------------------------------------------
# Every writer goes through write_parquet: float64 -> float32, probability-like columns rounded to three decimals
# (so the dictionary encoder sees ~1000 distinct values), other floats to four, MusicBrainz recording ids as
# 16-byte binaries, zstd level 9. Readers see the same numbers to the precision anything downstream uses.
PROB_LIKE = re.compile(r"^(p_|mood_|.*_read$|voice$|timbre_bright$|danceability$|rhythm_danceability$|energy$|valence$|acousticness$|"
                       r"electronic_prob$|mode_share$|speechiness$|instrumentalness$|liveness$|chorus_share$|repetition$|swing$|syncopation$)")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def uuid_bytes(s):
    """A MusicBrainz id as 16 bytes; anything else (None, malformed) stays None."""
    if isinstance(s, (bytes, bytearray)): return bytes(s) if len(s) == 16 else None
    if not isinstance(s, str) or not UUID_RE.match(s): return None
    return bytes.fromhex(s.replace("-", ""))


def condense_frame(df):
    import numpy as np, pandas as pd
    df = df.copy()
    for c in df.columns:
        s = df[c]
        if pd.api.types.is_float_dtype(s.dtype):
            digits = 3 if PROB_LIKE.match(c) else 4
            df[c] = s.astype("float64").round(digits).astype("float32")
        elif c == "mbid" and s.dtype == object:
            df[c] = s.map(uuid_bytes)
    return df


def write_parquet(df, path, **kw):
    """The one parquet writer for the store: condensed dtypes, zstd 9, atomic replace."""
    import os, pyarrow as pa, pyarrow.parquet as pq
    from pathlib import Path
    path = Path(path); tmp = path.with_suffix(path.suffix + ".tmp")
    out = condense_frame(df)
    table = pa.Table.from_pandas(out, preserve_index=False)
    if "mbid" in table.column_names and pa.types.is_binary(table.schema.field("mbid").type):
        i = table.schema.get_field_index("mbid")
        table = table.set_column(i, "mbid", table.column("mbid").cast(pa.binary(16)))
    pq.write_table(table, tmp, compression="zstd", compression_level=9, use_dictionary=True, row_group_size=262_144)
    os.replace(tmp, path)
    return path
