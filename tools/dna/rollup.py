"""Combine every per-source fragment into data/dna/songs.parquet, then build
the four rollups (docs/DNA_SPEC.md section 3): artists.parquet, buckets.parquet
+ data/galton.json, patterns.parquet, hits.json. Each rollup lives in its own
module (artists_rollup.py, buckets_rollup.py, patterns_rollup.py,
hits_rollup.py) - this file just combines and orchestrates them.
"""
from __future__ import annotations

import re
import sys
import json, time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import schema
import util

RAW = Path(__file__).resolve().parents[2] / "data" / "dna" / "raw"
DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "dna"
SONGS_OUT = Path(__file__).resolve().parents[2] / "data" / "dna" / "songs.parquet"

FRAGMENTS = ["billboard_songs.parquet", "spotify_songs.parquet",
             "chordonomicon_songs.parquet", "lakh_songs.parquet",
             "mcgill_songs.parquet", "library_songs.parquet",
             "acousticbrainz_songs.parquet"]   # optional; present after tools/dna/acousticbrainz.py has run

# "Elvis Presley With The Jordanaires", "... And The Jordanaires", "Bill
# Haley And His Comets": Billboard (and some other sources) credit featured
# or backing acts inline. Applied to artist_norm (after util.norm_artist's
# own "&"/" and " -> " " collapsing), so in practice only the "with" form
# still contains its separator word here - "and"/"&" variants would need to
# be matched against the raw artist string instead, before that collapsing.
FOLD_RE = r"^(.+?)\s+(with|and|&)\s+(the\s+|his\s+|her\s+)?(.+)$"
FOLD_MIN_HEAD_SONGS = 20


def apply_artist_fold(df: pd.DataFrame) -> pd.DataFrame:
    """Global, cross-source fold: an artist_norm matching FOLD_RE whose head
    (group 1) is itself an artist_norm with >= FOLD_MIN_HEAD_SONGS songs gets
    rewritten to that head, so an artist's charting isn't split across
    differently-credited rows. performer_raw preserves the pre-fold artist
    string on the rows this changes."""
    counts = df["artist_norm"].value_counts()
    heads = set(counts[counts >= FOLD_MIN_HEAD_SONGS].index)
    extracted = df["artist_norm"].str.extract(FOLD_RE, flags=re.IGNORECASE)[0].str.strip()
    fold_mask = extracted.notna() & extracted.isin(heads) & (extracted != df["artist_norm"])
    n_folded = int(fold_mask.sum())
    if n_folded:
        df = df.copy()
        df.loc[fold_mask, "performer_raw"] = df.loc[fold_mask, "artist"]
        df.loc[fold_mask, "artist_norm"] = extracted[fold_mask]
        df.loc[fold_mask, "join_key"] = extracted[fold_mask] + "|" + df.loc[fold_mask, "title_norm"]
        df.loc[fold_mask, "id"] = [
            util.stable_id(s, a, t) for s, a, t in
            zip(df.loc[fold_mask, "source"], extracted[fold_mask], df.loc[fold_mask, "title_norm"])
        ]
    print(f"[rollup] artist fold: {n_folded:,} rows folded into a head artist (>= {FOLD_MIN_HEAD_SONGS} songs)")
    return df


def disambiguate_ids(df: pd.DataFrame) -> pd.DataFrame:
    """id = sha1(source|artist_norm|title_norm) collides for real, distinct
    rows within one source: Lakh has several independently-arranged MIDI files
    of the same hit (e.g. three different "Def Leppard - Hysteria" takes), and
    Spotify's catalog has duplicate title/artist entries across releases. These
    are genuinely different rows worth keeping (different tempo, grids, audio
    features), so append -2, -3, ... to the id rather than dropping any of
    them - only load_pg.py's primary key needs the id to be unique."""
    dup_mask = df["id"].duplicated(keep=False)
    if not dup_mask.any():
        return df
    n_before = dup_mask.sum()
    counters: dict[str, int] = {}
    ids = df["id"].tolist()
    for i in df.index[dup_mask]:
        base = ids[i]
        counters[base] = counters.get(base, 0) + 1
        if counters[base] > 1:
            ids[i] = f"{base}-{counters[base]}"
    df = df.copy()
    df["id"] = ids
    print(f"[rollup] {n_before:,} rows shared an id with another row (real duplicate "
          f"content, e.g. multiple Lakh arrangements of the same song) - suffixed to stay unique")
    return df


def plain_dtypes(df: pd.DataFrame) -> pd.DataFrame:
    """Columns that carry pandas' NA sentinel (nullable Int64/Float64/boolean, NA-flavored or arrow strings) become
    plain numpy columns: floats with NaN, objects with None. The rollups compare and cast without NA checks."""
    for c in df.columns:
        dt = df[c].dtype
        if getattr(dt, "na_value", None) is not pd.NA: continue
        if pd.api.types.is_bool_dtype(dt): df[c] = df[c].astype(object).where(df[c].notna(), None)
        elif pd.api.types.is_numeric_dtype(dt): df[c] = df[c].astype("float64")
        else: df[c] = df[c].astype(object).where(df[c].notna(), None)
    return df


def fill_voice(df: pd.DataFrame) -> pd.DataFrame:
    """Spotify's instrumentalness is the inverse of the voice probability AcousticBrainz reports."""
    if "voice" not in df.columns: df["voice"] = np.nan
    v = pd.to_numeric(df["voice"], errors="coerce"); inst = pd.to_numeric(df["instrumentalness"], errors="coerce")
    df["voice"] = v.where(v.notna(), 1.0 - inst)
    return df


# The AcousticBrainz reads that predict the Spotify measures best: the seven moods, its danceability, voice, timbre
# (from the fragment itself, since the schema keeps only the folded columns), plus log tempo.
CAL_FEATURES = ["mood_happy", "mood_sad", "mood_aggressive", "mood_relaxed", "mood_party", "mood_electronic", "acousticness", "danceability", "voice", "timbre_bright"]


def calibrate_acousticbrainz(df: pd.DataFrame) -> pd.DataFrame:
    """AcousticBrainz's energy (aggressive and party moods), valence (happy mood) and danceability are classifier
    probabilities; Spotify's are audio measures. On the recordings both sources carry, a linear map from the
    AcousticBrainz reads and log tempo to each Spotify measure is fitted and applied to every AcousticBrainz row,
    so cross-source medians sit on one scale. Fit quality is written to data/dna/calibration.json."""
    ab = df["source"] == "acousticbrainz"
    if not ab.any(): return df
    key = df["artist_norm"].fillna("") + "|" + df["title_norm"].fillna("")
    sp = df[df["source"] == "spotify"].assign(_k=key[df["source"] == "spotify"]).drop_duplicates("_k").set_index("_k")
    native = pd.read_parquet(RAW / "acousticbrainz_songs.parquet", columns=["id"] + CAL_FEATURES).drop_duplicates("id").set_index("id")
    a = df.loc[ab, ["id", "tempo"]].join(native, on="id").assign(_k=key[ab]).drop_duplicates("_k").set_index("_k")
    both = a.join(sp[["energy", "valence", "danceability"]].rename(columns=lambda c: f"{c}_sp"), how="inner")
    report = {"overlap": int(len(both)), "fits": {}}
    if len(both) < 2000:
        report["note"] = "too little overlap to calibrate"; (DATA_DIR / "calibration.json").write_text(json.dumps(report, indent=1)); return df
    def design(frame):
        X = np.c_[[pd.to_numeric(frame[c], errors="coerce").fillna(0.5).to_numpy(dtype="float64") for c in CAL_FEATURES]].T
        t = pd.to_numeric(frame["tempo"], errors="coerce").fillna(120).clip(40, 300).to_numpy(dtype="float64")
        return np.c_[X, np.log(t), np.ones(len(frame))]
    Xb = design(both); fitted = {}
    for tgt in ("energy", "valence", "danceability"):
        y = pd.to_numeric(both[f"{tgt}_sp"], errors="coerce").to_numpy(dtype="float64"); m = ~np.isnan(y)
        beta, *_ = np.linalg.lstsq(Xb[m], y[m], rcond=None); pred = Xb[m] @ beta
        r2 = 1 - ((y[m] - pred) ** 2).sum() / max(((y[m] - y[m].mean()) ** 2).sum(), 1e-9)
        fitted[tgt] = beta; report["fits"][tgt] = {"r2": round(float(r2), 3), "n": int(m.sum()), "beta": [round(float(b), 4) for b in beta]}
    Xa = design(df.loc[ab, ["id", "tempo"]].join(native, on="id"))
    for tgt, beta in fitted.items():
        df.loc[ab, tgt] = np.clip(Xa @ beta, 0.0, 1.0)
    (DATA_DIR / "calibration.json").write_text(json.dumps(report, indent=1))
    print(f"[rollup] calibrated {int(ab.sum()):,} AcousticBrainz rows on {len(both):,} shared recordings: " + ", ".join(f"{k} R2 {v['r2']}" for k, v in report["fits"].items()))
    return df


def fill_family(df: pd.DataFrame) -> pd.DataFrame:
    """Family for rows that have none: MusicBrainz artist genres by artist gid, then by an unambiguous artist name,
    then the family the store already knows for that artist from any other source."""
    before = df["family"].notna().mean()
    mb_path = RAW / "mb_artist_genres.parquet"
    if mb_path.exists():
        mb = pd.read_parquet(mb_path, columns=["artist_mbid", "artist_norm", "family"]).dropna(subset=["family"])
        by_gid = mb.drop_duplicates("artist_mbid").set_index("artist_mbid")["family"]
        if "artist_mbid" in df.columns:
            need = df["family"].isna() & df["artist_mbid"].notna()
            df.loc[need, "family"] = df.loc[need, "artist_mbid"].map(by_gid)
        n_names = mb.groupby("artist_norm")["family"].nunique()
        by_name = mb[mb["artist_norm"].isin(n_names[n_names == 1].index)].drop_duplicates("artist_norm").set_index("artist_norm")["family"]
        need = df["family"].isna() & df["artist_norm"].notna()
        df.loc[need, "family"] = df.loc[need, "artist_norm"].map(by_name)
        mid = df["family"].notna().mean()
        print(f"[rollup] family from MusicBrainz artist genres: {before:.1%} -> {mid:.1%}")
    known = df.dropna(subset=["family"]).groupby("artist_norm")["family"].agg(lambda x: x.value_counts().index[0])
    need = df["family"].isna() & df["artist_norm"].notna()
    df.loc[need, "family"] = df.loc[need, "artist_norm"].map(known)
    print(f"[rollup] family after artist propagation: {df['family'].notna().mean():.1%} of {len(df):,} rows")
    return df


def attach_fame(df: pd.DataFrame) -> pd.DataFrame:
    """The fame score (tools/dna/fame.py) by folded names; songs the charts never carried get 0."""
    if "fame" not in df.columns: df["fame"] = np.nan
    fp = DATA_DIR / "fame.parquet"
    if not fp.exists(): df["fame"] = df["fame"].fillna(0.0); return df
    f = pd.read_parquet(fp, columns=["artist_norm", "title_norm", "fame"]).drop_duplicates(["artist_norm", "title_norm"])
    key = df["artist_norm"].fillna("") + "|" + df["title_norm"].fillna("")
    m = pd.Series(f["fame"].values, index=(f["artist_norm"].fillna("") + "|" + f["title_norm"].fillna("")).values)
    df["fame"] = key.map(m).fillna(0.0).astype("float32")
    print(f"[rollup] fame attached: {(df['fame'] > 0).sum():,} songs above zero, {(df['fame'] >= 0.5).sum():,} at 0.5 or more")
    return df


def combine() -> pd.DataFrame:
    frames = []
    for name in FRAGMENTS:
        p = RAW / name
        if not p.exists():
            print(f"[rollup] missing fragment, skipping: {name}")
            continue
        df = pd.read_parquet(p)
        frames.append(df)
        print(f"[rollup] {name}: {len(df):,} rows")
    if not frames:
        raise SystemExit("[rollup] no fragments found - run the per-source scripts first")
    combined = pd.concat(frames, ignore_index=True)
    combined = combined[schema.COLUMN_NAMES]
    combined = plain_dtypes(combined)
    combined = fill_voice(combined)
    combined = calibrate_acousticbrainz(combined)
    combined = fill_family(combined)
    combined = attach_fame(combined)
    combined = apply_artist_fold(combined)
    combined = disambiguate_ids(combined)
    SONGS_OUT.parent.mkdir(parents=True, exist_ok=True)
    util.write_parquet(combined, SONGS_OUT)
    print(f"[rollup] songs.parquet: {len(combined):,} total rows -> {SONGS_OUT}")
    return combined


def run() -> dict:
    t0 = time.time()
    songs = combine()

    import artists_rollup
    import buckets_rollup
    import hits_rollup
    import patterns_rollup

    artists = artists_rollup.run(songs)
    buckets, galton_bytes = buckets_rollup.run(songs)
    patterns = patterns_rollup.run(songs)
    hits = hits_rollup.run(songs)

    dt = time.time() - t0
    print(f"[rollup] done in {dt:.1f}s")
    return {
        "songs": songs, "artists": artists, "buckets": buckets,
        "galton_bytes": galton_bytes, "patterns": patterns, "hits": hits,
    }


if __name__ == "__main__":
    run()
