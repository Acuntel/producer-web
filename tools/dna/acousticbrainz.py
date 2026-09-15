"""AcousticBrainz: millions of recordings analyzed from audio (Essentia, CC0), no download of
any record. The highlevel JSON dumps carry the name (artist, title, date, MusicBrainz ids)
and audio-derived classifiers: danceability, moods (happy, sad, aggressive, relaxed, party,
acoustic, electronic), genre models, timbre, voice. The lowlevel feature dumps (rhythm,
tonal) carry bpm and key per recording, joined by recording id when present.

Input:  data/dna/raw/ab/*.tar.zst   (highlevel parts; rhythm and tonal feature tars optional)
Output: data/dna/raw/acousticbrainz_songs.parquet in the DNA record shape.

  <dna-venv>/bin/python tools/dna/acousticbrainz.py [--limit N]

Staged so the work overlaps the downloads (each stage caches under data/dna/raw/ab/):
  AB_STAGE=features   parse the rhythm and tonal CSVs once -> features.parquet (no name filter)
  AB_STAGE=highlevel AB_PART=<n>   parse one highlevel part -> highlevel-<n>.parquet
  (no stage)          parse any part without a cache, join the caches, write the DNA parquet
"""
from __future__ import annotations

import csv, io, json, os, subprocess, sys, tarfile, time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import util  # noqa: E402
from util import norm_artist, norm_title, stable_id, fold_tempo, uuid_bytes  # noqa: E402
from families import family_from_genres, derive_lane  # noqa: E402
from feel import compute_feel  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = Path(os.environ.get("AB_RAW", ROOT / "data" / "dna" / "raw" / "ab"))
OUT = Path(os.environ.get("AB_OUT", ROOT / "data" / "dna" / "raw" / "acousticbrainz_songs.parquet"))
KEYS = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
# The eighteen highlevel classifiers; every probability rides into the fingerprint (the labels are weak, the numbers are not).
CLASSIFIERS = ["danceability", "gender", "genre_dortmund", "genre_electronic", "genre_rosamerica", "genre_tzanetakis", "ismir04_rhythm",
               "mood_acoustic", "mood_aggressive", "mood_electronic", "mood_happy", "mood_party", "mood_relaxed", "mood_sad", "moods_mirex",
               "timbre", "tonal_atonal", "voice_instrumental"]
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
    mbid = uuid_bytes(first(tags.get("musicbrainz_recordingid")))
    # Family from the two general genre models (with their confidence); the electronic sub-genre model only
    # says something when those call it dance or electronic.
    ROSA = {"cla": "classical", "dan": "electronic", "hip": "hiphop", "jaz": "jazz", "pop": "pop", "rhy": "rnb", "roc": "rock", "spe": "other"}
    DORT = {"alternative": "rock", "blues": "jazz", "electronic": "electronic", "folkcountry": "folk", "funksoulrnb": "rnb", "jazz": "jazz", "pop": "pop", "raphiphop": "hiphop", "rock": "rock"}
    ELEC = {"hou": "house", "tec": "techno", "tra": "trance", "dnb": "dnb", "amb": "electronic"}
    ro = hl.get("genre_rosamerica") or {}; do = hl.get("genre_dortmund") or {}; ge = hl.get("genre_electronic") or {}
    rf = ROSA.get(ro.get("value", "")); df_ = DORT.get(do.get("value", ""))
    rp = float(ro.get("probability") or 0); dp = float(do.get("probability") or 0)
    melec = float(((hl.get("mood_electronic") or {}).get("all") or {}).get("electronic") or 0)
    # Both general models over-call dance and electronic. Electronic needs both to agree, or one of them plus the
    # audio's own electronic mood above 0.7; otherwise the non-electronic call wins, the more confident one first.
    if rf == "electronic" and df_ == "electronic": family = "electronic"
    elif rf == "electronic" and df_: family = "electronic" if melec >= 0.7 else df_
    elif df_ == "electronic" and rf: family = "electronic" if melec >= 0.7 else rf
    else: family = rf if rp >= dp else (df_ or rf)
    if family == "electronic" and float(ge.get("probability") or 0) >= 0.5: family = ELEC.get(ge.get("value", ""), "electronic")
    genres = [family] if family else []
    electronic_prob = float(ge.get("probability") or 0)
    probs = {}
    for clf in CLASSIFIERS:
        for label, v in ((hl.get(clf) or {}).get("all") or {}).items():
            try: probs[f"p_{clf}_{label}"] = float(v)
            except (TypeError, ValueError): pass
    return {
        **probs, "artist_mbid": first(tags.get("musicbrainz_artistid")),
        "mbid": mbid, "title": title, "artist": artist, "year": year,
        "duration_sec": ((d.get("metadata") or {}).get("audio_properties") or {}).get("length"),
        # The general genre models of this corpus are weak (rock reads as electronic); the guess is kept for reference,
        # the family stays empty and the artist rollup takes it from the other sources.
        "genres": [], "family": None, "genre_guess": family, "genre_electronic": ge.get("value"), "electronic_prob": electronic_prob,
        "danceability": prob(hl, "danceability", "danceable"),
        "mood_happy": prob(hl, "mood_happy", "happy"), "mood_sad": prob(hl, "mood_sad", "sad"),
        "mood_aggressive": prob(hl, "mood_aggressive", "aggressive"), "mood_relaxed": prob(hl, "mood_relaxed", "relaxed"),
        "mood_party": prob(hl, "mood_party", "party"), "mood_acoustic": prob(hl, "mood_acoustic", "acoustic"),
        "mood_electronic": prob(hl, "mood_electronic", "electronic"),
        "timbre_bright": prob(hl, "timbre", "bright"), "voice": prob(hl, "voice_instrumental", "voice"),
    }


class _NoSeek(io.RawIOBase):
    """A streamed tar member as a plain raw stream: pandas asks for seekable() and the tar's stream object has none."""
    def __init__(self, f): self.f = f
    def readable(self): return True
    def seekable(self): return False
    def readinto(self, b):
        data = self.f.read(len(b)); n = len(data); b[:n] = data; return n


def parse_features(path: Path, want: dict[str, str], keep_ids: set[str] | None = None) -> pd.DataFrame:
    """A lowlevel feature dump: one huge CSV inside the tar (mbid, submission_offset, ...). Streamed in
    chunks, first submission per recording, filtered to keep_ids when given."""
    proc = subprocess.Popen(["zstd", "-dc", str(path)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    frames = []; seen = 0
    with tarfile.open(fileobj=proc.stdout, mode="r|") as tar:
        for m in tar:
            if not m.isfile() or not m.name.endswith(".csv"): continue
            raw_f = tar.extractfile(m)
            if raw_f is None: continue
            f = io.BufferedReader(_NoSeek(raw_f), buffer_size=1 << 22)
            header = f.readline().decode("utf-8", "ignore").strip().split(",")
            cols = [c for c in header if c in want or c in ("mbid", "submission_offset")]
            for chunk in pd.read_csv(f, names=header, usecols=cols, chunksize=1_000_000, low_memory=False):
                seen += len(chunk)
                if "submission_offset" in chunk.columns: chunk = chunk[chunk["submission_offset"] == 0]
                chunk = chunk.assign(mbid=chunk["mbid"].map(uuid_bytes))
                if keep_ids is not None: chunk = chunk[chunk["mbid"].isin(keep_ids)]
                if len(chunk): frames.append(chunk.rename(columns=want)[["mbid"] + [v for k, v in want.items() if k in cols]])
                if seen % 5_000_000 < 1_000_000: print(f"[acousticbrainz] {path.name}: {seen:,} rows read, {sum(len(x) for x in frames):,} kept", flush=True)
            break
    proc.wait()
    if not frames: return pd.DataFrame(columns=["mbid"])
    return pd.concat(frames, ignore_index=True).drop_duplicates("mbid")


RHYTHM_WANT = {"bpm": "tempo", "danceability": "rhythm_danceability", "onset_rate": "onset_rate",
               "bpm_histogram_first_peak_bpm_mean": "bpm_peak1", "bpm_histogram_second_peak_bpm_mean": "bpm_peak2"}
TONAL_WANT = {"key_key": "key_name", "key_scale": "mode", "tuning_frequency": "tuning_hz", "tuning_equal_tempered_deviation": "tuning_dev"}
FEATURE_EXTRAS = ["rhythm_danceability", "onset_rate", "bpm_peak1", "bpm_peak2", "tuning_hz", "tuning_dev"]


def stage_features() -> Path:
    """Both feature CSVs, every recording's first submission, joined on mbid and cached."""
    out = RAW / "features.parquet"
    t0 = time.time()
    rhythm = next(iter(RAW.glob("*rhythm.tar.zst")), None); tonal = next(iter(RAW.glob("*tonal.tar.zst")), None)
    rf = parse_features(rhythm, RHYTHM_WANT) if rhythm else pd.DataFrame(columns=["mbid"])
    print(f"[acousticbrainz] rhythm: {len(rf):,} recordings in {time.time() - t0:.0f}s", flush=True)
    tf = parse_features(tonal, TONAL_WANT) if tonal else pd.DataFrame(columns=["mbid"])
    print(f"[acousticbrainz] tonal: {len(tf):,} recordings in {time.time() - t0:.0f}s", flush=True)
    df = rf.merge(tf, on="mbid", how="outer") if len(tf) else rf
    util.write_parquet(df, out)
    print(f"[acousticbrainz] wrote {out} ({len(df):,} recordings) in {time.time() - t0:.0f}s", flush=True)
    return out


def parse_part(p: Path, limit: int | None = None) -> pd.DataFrame:
    """Rows are flushed into frames every 100k so a million-record part never sits in memory as dicts."""
    t0 = time.time(); rows: list[dict] = []; frames: list[pd.DataFrame] = []; seen = 0; named = 0
    for name, raw in stream_tar(p):
        if not name.endswith(".json"): continue
        seen += 1
        r = parse_highlevel(raw)
        if r: rows.append(r); named += 1
        if len(rows) >= 100_000: frames.append(pd.DataFrame(rows)); rows = []
        if seen % 200_000 == 0: print(f"[acousticbrainz] {p.name}: {seen:,} files, {named:,} named", flush=True)
        if limit and named >= limit: break
    if rows: frames.append(pd.DataFrame(rows))
    df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    print(f"[acousticbrainz] {p.name}: {seen:,} files -> {len(df):,} named recordings in {time.time() - t0:.0f}s", flush=True)
    return df


def part_cache(p: Path) -> Path:
    n = p.stem.replace(".tar", "").rsplit("-", 1)[-1]
    return RAW / f"highlevel-{n}.parquet"


def stage_highlevel(part: str) -> Path:
    p = next(iter(RAW.glob(f"acousticbrainz-highlevel-json-*-{part}.tar.zst")), None)
    if not p: sys.exit(f"no highlevel part {part} in {RAW}")
    df = parse_part(p)
    out = part_cache(p); util.write_parquet(df, out)
    print(f"[acousticbrainz] wrote {out}", flush=True)
    return out


def main() -> None:
    stage = os.environ.get("AB_STAGE")
    if stage == "features": stage_features(); return
    if stage == "highlevel": stage_highlevel(os.environ["AB_PART"]); return
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    parts = sorted(RAW.glob("acousticbrainz-highlevel-json-*.tar.zst"))
    if not parts: sys.exit(f"no highlevel parts in {RAW}")
    t0 = time.time(); frames = []
    for p in parts:
        c = part_cache(p)
        if c.exists() and not limit: frames.append(pd.read_parquet(c)); print(f"[acousticbrainz] {p.name}: cached {len(frames[-1]):,} rows", flush=True)
        else: frames.append(parse_part(p, limit))
        if limit and sum(len(f) for f in frames) >= limit: break
    df = pd.concat(frames, ignore_index=True)
    print(f"[acousticbrainz] highlevel: {len(df):,} named recordings in {time.time() - t0:.0f}s", flush=True)
    # Tempo and key from the feature dumps: the cache when the features stage ran, else streamed now.
    if os.environ.get("AB_SKIP_FEATURES") != "1":
        cache = RAW / "features.parquet"
        if cache.exists(): feats = pd.read_parquet(cache)
        else:
            ids = set(df["mbid"].dropna())
            rhythm = next(iter(RAW.glob("*rhythm.tar.zst")), None); tonal = next(iter(RAW.glob("*tonal.tar.zst")), None)
            feats = parse_features(rhythm, RHYTHM_WANT, ids) if rhythm and rhythm.stat().st_size > 1_000_000 else pd.DataFrame(columns=["mbid"])
            if tonal and tonal.stat().st_size > 1_000_000:
                tf = parse_features(tonal, TONAL_WANT, ids); feats = feats.merge(tf, on="mbid", how="outer") if len(tf) else feats
        cols = [c for c in ("tempo", "key_name", "mode", *FEATURE_EXTRAS) if c in feats.columns]
        if cols: df = df.merge(feats[["mbid"] + cols].drop_duplicates("mbid"), on="mbid", how="left")
    if "tempo" not in df.columns: df["tempo"] = None
    if "key_name" not in df.columns: df["key_name"] = None
    if "mode" not in df.columns: df["mode"] = None
    df["source"] = "acousticbrainz"
    df["artist_norm"] = df["artist"].map(norm_artist); df["title_norm"] = df["title"].map(norm_title)
    df["id"] = [stable_id("acousticbrainz", a, t) for a, t in zip(df["artist_norm"], df["title_norm"])]
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("float64")
    df["decade"] = (df["year"] // 10 * 10).astype("float64")
    df["family"] = None
    df["tempo"] = pd.to_numeric(df["tempo"], errors="coerce").map(lambda x: fold_tempo(float(x)) if pd.notna(x) else None)
    df["key_pc"] = df["key_name"].map(lambda k: KEYS.get(str(k), None) if k is not None else None)
    df["mode"] = df["mode"].map(lambda m: m if m in ("major", "minor") else None)
    df["lane"] = [derive_lane(f, t) for f, t in zip(df["family"], df["tempo"])]
    df["valence"] = df["mood_happy"]; df["energy"] = df[["mood_aggressive", "mood_party"]].mean(axis=1); df["acousticness"] = df["mood_acoustic"]
    reads = pd.DataFrame([compute_feel(r) for r in df[["mode", "tempo", "energy", "valence", "acousticness", "family"]].assign(syncopation=None, borrowed=None, harmony_class=None).to_dict("records")])
    for k in ("valence_read", "arousal_read", "tension_read", "warmth_read"):
        if k in reads.columns: df[k] = reads[k].values
    keep = ["id", "source", "title", "artist", "artist_norm", "title_norm", "year", "decade", "genres", "family", "lane", "tempo", "key_pc", "mode", "duration_sec",
            "energy", "danceability", "valence", "acousticness", "genre_guess", "mood_happy", "mood_sad", "mood_aggressive", "mood_relaxed", "mood_party", "mood_electronic", "timbre_bright", "voice", "mbid",
            "valence_read", "arousal_read", "tension_read", "warmth_read"]
    keep += [c for c in FEATURE_EXTRAS if c in df.columns] + ["artist_mbid"] + [c for c in df.columns if c.startswith("p_")]
    df = df[[c for c in keep if c in df.columns]].drop_duplicates("id")
    for c in df.columns:
        if c.startswith("p_"): df[c] = df[c].astype("float32")
    util.write_parquet(df, OUT)
    print(f"[acousticbrainz] wrote {OUT} ({len(df):,} rows; tempo for {df['tempo'].notna().sum():,}, key for {df['key_pc'].notna().sum():,}) in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
