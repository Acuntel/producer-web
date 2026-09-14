"""AcousticBrainz: millions of recordings analyzed from audio (Essentia, CC0), no download of
any record. The highlevel JSON dumps carry the name (artist, title, date, MusicBrainz ids)
and audio-derived classifiers: danceability, moods (happy, sad, aggressive, relaxed, party,
acoustic, electronic), genre models, timbre, voice. The lowlevel feature dumps (rhythm,
tonal) carry bpm and key per recording, joined by recording id when present.

Input:  data/dna/raw/ab/*.tar.zst   (highlevel parts; rhythm and tonal feature tars optional)
Output: data/dna/raw/acousticbrainz_songs.parquet in the DNA record shape.

  <dna-venv>/bin/python tools/dna/acousticbrainz.py [--limit N]
"""
from __future__ import annotations

import csv, io, json, subprocess, sys, tarfile, time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from util import norm_artist, norm_title, make_id  # noqa: E402
from families import family_from_genres, derive_lane  # noqa: E402
from feel import feel_reads  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "dna" / "raw" / "ab"
OUT = ROOT / "data" / "dna" / "raw" / "acousticbrainz_songs.parquet"
KEYS = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
GENRE_TAGS = {"dnb": "drum and bass", "hou": "house", "tec": "techno", "tra": "trance", "amb": "ambient"}


def stream_tar(path: Path):
    """Yield (name, bytes) for every regular file in a .tar.zst without touching the disk."""
    proc = subprocess.Popen(["zstd", "-dc", str(path)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    with tarfile.open(fileobj=proc.stdout, mode="r|") as tar:
        for m in tar:
            if not m.isfile(): continue
            f = tar.extractfile(m)
            if f: yield m.name, f.read()
    proc.wait()


def first(v):
    return v[0] if isinstance(v, list) and v else (v if isinstance(v, str) else None)


def prob(hl: dict, key: str, label: str) -> float | None:
    x = hl.get(key) or {}
    a = x.get("all") or {}
    return float(a[label]) if label in a else None


def parse_highlevel(raw: bytes) -> dict | None:
    try: d = json.loads(raw)
    except Exception: return None
    tags = (d.get("metadata") or {}).get("tags") or {}
    hl = d.get("highlevel") or {}
    artist, title = first(tags.get("artist")), first(tags.get("title"))
    if not artist or not title: return None
    date = first(tags.get("date")) or first(tags.get("originaldate")) or ""
    year = int(date[:4]) if date[:4].isdigit() else None
    mbid = first(tags.get("musicbrainz_recordingid"))
    genres = [g for g in [(hl.get("genre_rosamerica") or {}).get("value"), (hl.get("genre_dortmund") or {}).get("value"), GENRE_TAGS.get((hl.get("genre_electronic") or {}).get("value", ""), None)] if g]
    ge = hl.get("genre_electronic") or {}
    electronic_prob = max((ge.get("all") or {"x": 0}).values()) if ge.get("all") else None
    return {
        "mbid": mbid, "title": title, "artist": artist, "year": year,
        "duration_sec": ((d.get("metadata") or {}).get("audio_properties") or {}).get("length"),
        "genres": genres, "genre_electronic": ge.get("value"), "electronic_prob": electronic_prob,
        "danceability": prob(hl, "danceability", "danceable"),
        "mood_happy": prob(hl, "mood_happy", "happy"), "mood_sad": prob(hl, "mood_sad", "sad"),
        "mood_aggressive": prob(hl, "mood_aggressive", "aggressive"), "mood_relaxed": prob(hl, "mood_relaxed", "relaxed"),
        "mood_party": prob(hl, "mood_party", "party"), "mood_acoustic": prob(hl, "mood_acoustic", "acoustic"),
        "mood_electronic": prob(hl, "mood_electronic", "electronic"),
        "timbre_bright": prob(hl, "timbre", "bright"), "voice": prob(hl, "voice_instrumental", "voice"),
    }


def parse_features(path: Path, want: dict[str, str]) -> pd.DataFrame:
    """A lowlevel feature dump: CSV files inside the tar. Keep the columns named in `want` (source -> output)."""
    frames = []
    for name, raw in stream_tar(path):
        if not name.endswith(".csv"): continue
        head = raw[:4096].decode("utf-8", "ignore").splitlines()[0]
        cols = [c.strip() for c in head.split(",")]
        keep = [c for c in cols if c in want or c in ("mbid", "recording_mbid", "gid", "submission_offset", "offset")]
        if not any(c in want for c in keep): continue
        df = pd.read_csv(io.BytesIO(raw), usecols=keep, low_memory=False)
        idcol = next((c for c in ("recording_mbid", "mbid", "gid") if c in df.columns), None)
        if not idcol: continue
        df = df.rename(columns={idcol: "mbid", **{k: v for k, v in want.items() if k in df.columns}})
        frames.append(df[["mbid"] + [v for v in want.values() if v in df.columns]])
        print(f"[acousticbrainz] {path.name}: {name} {len(df):,} rows", flush=True)
    if not frames: return pd.DataFrame(columns=["mbid"])
    out = pd.concat(frames, ignore_index=True)
    return out.drop_duplicates("mbid")


def main() -> None:
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    parts = sorted(RAW.glob("acousticbrainz-highlevel-json-*.tar.zst"))
    if not parts: sys.exit(f"no highlevel parts in {RAW}")
    t0 = time.time(); rows: list[dict] = []; seen = 0
    for p in parts:
        for name, raw in stream_tar(p):
            if not name.endswith(".json"): continue
            seen += 1
            r = parse_highlevel(raw)
            if r: rows.append(r)
            if seen % 100_000 == 0: print(f"[acousticbrainz] {p.name}: {seen:,} files, {len(rows):,} named", flush=True)
            if limit and len(rows) >= limit: break
        if limit and len(rows) >= limit: break
    df = pd.DataFrame(rows)
    print(f"[acousticbrainz] highlevel: {seen:,} files -> {len(df):,} named recordings in {time.time() - t0:.0f}s", flush=True)
    # Tempo and key from the feature dumps when present.
    rhythm = next(iter(RAW.glob("*rhythm.tar.zst")), None); tonal = next(iter(RAW.glob("*tonal.tar.zst")), None)
    if rhythm and rhythm.stat().st_size > 1_000_000:
        rf = parse_features(rhythm, {"bpm": "tempo", "rhythm.bpm": "tempo", "danceability": "rhythm_danceability"})
        if "tempo" in rf.columns: df = df.merge(rf[["mbid", "tempo"]], on="mbid", how="left")
    if tonal and tonal.stat().st_size > 1_000_000:
        tf = parse_features(tonal, {"key_key": "key_name", "tonal.key_key": "key_name", "key_scale": "mode", "tonal.key_scale": "mode"})
        if "key_name" in tf.columns: df = df.merge(tf[["mbid"] + [c for c in ("key_name", "mode") if c in tf.columns]], on="mbid", how="left")
    if "tempo" not in df.columns: df["tempo"] = None
    if "key_name" not in df.columns: df["key_name"] = None
    if "mode" not in df.columns: df["mode"] = None
    df["source"] = "acousticbrainz"
    df["artist_norm"] = df["artist"].map(norm_artist); df["title_norm"] = df["title"].map(norm_title)
    df["id"] = [make_id("acousticbrainz", a, t) for a, t in zip(df["artist_norm"], df["title_norm"])]
    df["decade"] = (df["year"] // 10 * 10).astype("Int64")
    df["family"] = df["genres"].map(family_from_genres)
    df.loc[df["electronic_prob"].fillna(0) > 0.6, "family"] = df.loc[df["electronic_prob"].fillna(0) > 0.6, "genre_electronic"].map(lambda g: {"hou": "house", "tec": "techno", "tra": "trance", "dnb": "dnb", "amb": "electronic"}.get(g, "electronic"))
    df["tempo"] = pd.to_numeric(df["tempo"], errors="coerce")
    df["key_pc"] = df["key_name"].map(lambda k: KEYS.get(str(k), None) if k is not None else None)
    df["mode"] = df["mode"].map(lambda m: m if m in ("major", "minor") else None)
    df["lane"] = [derive_lane(f, t) for f, t in zip(df["family"], df["tempo"])]
    df["valence"] = df["mood_happy"]; df["energy"] = df[["mood_aggressive", "mood_party"]].mean(axis=1); df["acousticness"] = df["mood_acoustic"]
    reads = feel_reads(df)
    for k, v in reads.items(): df[k] = v
    keep = ["id", "source", "title", "artist", "artist_norm", "title_norm", "year", "decade", "genres", "family", "lane", "tempo", "key_pc", "mode", "duration_sec",
            "energy", "danceability", "valence", "acousticness", "mood_happy", "mood_sad", "mood_aggressive", "mood_relaxed", "mood_party", "mood_electronic", "timbre_bright", "voice", "mbid",
            "valence_read", "arousal_read", "tension_read", "warmth_read"]
    df = df[[c for c in keep if c in df.columns]].drop_duplicates("id")
    df.to_parquet(OUT, index=False)
    print(f"[acousticbrainz] wrote {OUT} ({len(df):,} rows; tempo for {df['tempo'].notna().sum():,}, key for {df['key_pc'].notna().sum():,}) in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
