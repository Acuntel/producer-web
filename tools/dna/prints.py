"""The fingerprint: every audio-measured recording as 32 numbers, where distance means "sounds like".

From the AcousticBrainz parquet: the eighteen classifiers' probabilities (complements dropped), log
tempo, onset rate, rhythm danceability, tuning deviation, the tempo histogram peak ratio, key as a
point on the circle, and mode. Standardised, projected with PCA to 32 dimensions, stored as int8.
From songs.parquet (after the rollup): the calibrated energy, the feel reads, family and voice, so a
song's address on the board can be printed next to its neighbours.

Writes data/prints/: manifest.json, keys.u64 (sorted sha1-8 of "artist_norm|title_norm", little endian),
vec.i8 (rows x 32 in key order), akeys.u64 + arows.u32 (artist key -> rows), names.txt.gz + offs.u32
(artist TAB title), meta.bin (12 bytes a row), and proof.json (duplicate rate, canon neighbour test).

  <dna-venv>/bin/python tools/dna/prints.py
"""
from __future__ import annotations

import gzip, hashlib, json, os, time
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
AB = ROOT / "data" / "dna" / "raw" / "acousticbrainz_songs.parquet"
SONGS = ROOT / "data" / "dna" / "songs.parquet"
OUT = ROOT / "data" / "prints"
DIMS = 32
FAMILIES = ["", "pop", "rock", "hiphop", "rnb", "country", "electronic", "latin", "jazz", "classical", "folk", "metal", "world", "other",
            "house", "techno", "trance", "garage", "dnb", "dubstep", "hardstyle", "disco"]


def key64(s: str) -> int:
    return int.from_bytes(hashlib.sha1(s.encode("utf-8")).digest()[:8], "little")


def feature_matrix(df: pd.DataFrame) -> tuple[np.ndarray, list[str]]:
    pcols = [c for c in df.columns if c.startswith("p_") and "_not_" not in c
             and not c.endswith(("_gender_male", "_timbre_dark", "_tonal_atonal_atonal", "_voice_instrumental_instrumental"))]
    X = df[pcols].to_numpy(dtype="float32")
    tempo = df["tempo"].to_numpy(dtype="float64"); tempo = np.where(np.isnan(tempo), 120.0, tempo)
    onset = df["onset_rate"].to_numpy(dtype="float64") if "onset_rate" in df else np.full(len(df), 3.0)
    rdance = df["rhythm_danceability"].to_numpy(dtype="float64") if "rhythm_danceability" in df else np.full(len(df), 1.0)
    tdev = df["tuning_dev"].to_numpy(dtype="float64") if "tuning_dev" in df else np.zeros(len(df))
    p1 = df["bpm_peak1"].to_numpy(dtype="float64") if "bpm_peak1" in df else tempo
    p2 = df["bpm_peak2"].to_numpy(dtype="float64") if "bpm_peak2" in df else tempo
    ratio = np.where((p1 > 0) & (p2 > 0), p2 / np.where(p1 > 0, p1, 1), 1.0)
    pc = df["key_pc"].to_numpy(dtype="float64"); pc = np.where(np.isnan(pc), 0.0, pc)
    mode = df["mode"].map({"major": 1.0, "minor": 0.0}).fillna(0.5).to_numpy(dtype="float64")
    extras = np.c_[np.log(tempo), np.log1p(np.nan_to_num(onset, nan=3.0)), np.nan_to_num(rdance, nan=1.0), np.clip(np.nan_to_num(tdev), 0, 1),
                   np.clip(np.nan_to_num(ratio, nan=1.0), 0.4, 2.5), np.sin(2 * np.pi * pc / 12), np.cos(2 * np.pi * pc / 12), mode].astype("float32")
    X = np.nan_to_num(np.c_[X, extras], nan=0.0)
    return X, pcols + ["log_tempo", "log_onset", "rhythm_danceability", "tuning_dev", "peak_ratio", "key_sin", "key_cos", "mode"]


def main() -> None:
    t0 = time.time()
    ab = pd.read_parquet(AB)
    print(f"[prints] {len(ab):,} recordings, {sum(c.startswith('p_') for c in ab.columns)} probabilities ({time.time() - t0:.0f}s)", flush=True)
    songs = pd.read_parquet(SONGS, columns=["id", "energy", "valence_read", "arousal_read", "family", "voice"]) if SONGS.exists() else None
    if songs is not None:
        songs = songs.drop_duplicates("id").set_index("id")
        ab = ab.join(songs, on="id", rsuffix="_rolled")
        for c in ("energy", "voice"):
            if f"{c}_rolled" in ab: ab[c] = ab[f"{c}_rolled"].fillna(ab[c])
        if "family_rolled" in ab: ab["family"] = ab["family_rolled"]
        for c in ("valence_read", "arousal_read"):
            if f"{c}_rolled" in ab: ab[c] = ab[f"{c}_rolled"].fillna(ab[c])
    X, names = feature_matrix(ab)
    print(f"[prints] feature matrix {X.shape} ({time.time() - t0:.0f}s)", flush=True)
    rng = np.random.default_rng(7)
    sample = X[rng.choice(len(X), size=min(300_000, len(X)), replace=False)]
    mu = sample.mean(axis=0); sd = sample.std(axis=0); sd[sd < 1e-6] = 1.0
    Z = np.clip((sample - mu) / sd, -4, 4)
    _, S, Vt = np.linalg.svd(Z, full_matrices=False)
    comps = Vt[:DIMS].T.astype("float32")   # features x DIMS
    explained = float((S[:DIMS] ** 2).sum() / (S ** 2).sum())
    proj = np.empty((len(X), DIMS), dtype="float32")
    for a in range(0, len(X), 200_000):
        proj[a:a + 200_000] = np.clip((X[a:a + 200_000] - mu) / sd, -4, 4) @ comps
    scale = float(127.0 / np.quantile(np.abs(proj[rng.choice(len(proj), 200_000, replace=False)]), 0.999))
    vec = np.clip(np.rint(proj * scale), -127, 127).astype("int8")
    print(f"[prints] PCA {DIMS} dims explain {explained:.1%}; int8 scale {scale:.3f} ({time.time() - t0:.0f}s)", flush=True)
    # Keys and order.
    keys = np.fromiter((key64(f"{a}|{t}") for a, t in zip(ab["artist_norm"].fillna(""), ab["title_norm"].fillna(""))), dtype="uint64", count=len(ab))
    order = np.argsort(keys, kind="stable")
    keys, vec = keys[order], vec[order]
    ab = ab.iloc[order].reset_index(drop=True)
    akeys = np.fromiter((key64(a) for a in ab["artist_norm"].fillna("")), dtype="uint64", count=len(ab))
    aorder = np.argsort(akeys, kind="stable")
    # Names and meta.
    blob = bytearray(); offs = np.zeros(len(ab) + 1, dtype="uint32")
    for i, (a, t) in enumerate(zip(ab["artist"].fillna(""), ab["title"].fillna(""))):
        blob += f"{a}\t{t}".encode("utf-8"); offs[i + 1] = len(blob)
    def u8(col, default=0.0):
        v = ab[col].to_numpy(dtype="float64") if col in ab else np.full(len(ab), np.nan)
        return np.clip(np.rint(np.nan_to_num(v, nan=default) * 255), 0, 255).astype("uint8")
    tempo = ab["tempo"].to_numpy(dtype="float64"); year = ab["year"].to_numpy(dtype="float64")
    meta = np.zeros((len(ab), 12), dtype="uint8")
    meta[:, 0:2] = np.clip(np.rint(np.nan_to_num(tempo) * 10), 0, 65535).astype("<u2").view("uint8").reshape(-1, 2)
    meta[:, 2] = np.where(np.isnan(ab["key_pc"].to_numpy(dtype="float64")), 255, np.nan_to_num(ab["key_pc"].to_numpy(dtype="float64"))).astype("uint8")
    meta[:, 3] = ab["mode"].map({"major": 1, "minor": 2}).fillna(0).to_numpy(dtype="uint8")
    meta[:, 4:6] = np.clip(np.nan_to_num(year), 0, 65535).astype("<u2").view("uint8").reshape(-1, 2)
    meta[:, 6] = u8("energy", 0.5); meta[:, 7] = u8("valence_read", 0.5); meta[:, 8] = u8("arousal_read", 0.5)
    voice = ab["voice"].to_numpy(dtype="float64") if "voice" in ab else np.full(len(ab), np.nan)
    meta[:, 9] = np.where(np.isnan(voice), 0, np.where(voice >= 0.5, 1, 2)).astype("uint8")
    fam_idx = {f: i for i, f in enumerate(FAMILIES)}
    meta[:, 10] = ab["family"].map(lambda f: fam_idx.get(f, 0) if isinstance(f, str) else 0).to_numpy(dtype="uint8")
    OUT.mkdir(parents=True, exist_ok=True)
    keys.astype("<u8").tofile(OUT / "keys.u64"); vec.tofile(OUT / "vec.i8")
    akeys[aorder].astype("<u8").tofile(OUT / "akeys.u64"); aorder.astype("<u4").tofile(OUT / "arows.u32")
    (OUT / "names.txt.gz").write_bytes(gzip.compress(bytes(blob), 6)); offs.astype("<u4").tofile(OUT / "offs.u32"); meta.tofile(OUT / "meta.bin")
    # Proof 1: how unique is a print.
    uniq = len(np.unique(vec, axis=0)); dup_rate = 1 - uniq / len(vec)
    # Proof 2: canon neighbours. For DJ-played records with a print, do the ten nearest by sound contain a record
    # from the same mix more often than ten random records do?
    proof = {"n": int(len(vec)), "dims": DIMS, "explained": round(explained, 4), "duplicate_rate": round(float(dup_rate), 5), "same_mix_at_10": None, "random_at_10": None, "canon_tested": 0}
    dsn_p = ROOT / "data" / "dna" / "PG_DSN"
    if dsn_p.exists():
        try:
            import psycopg
            with psycopg.connect(dsn_p.read_text().strip(), connect_timeout=15) as c, c.cursor() as cur:
                cur.execute("select artist_norm, title_norm, mix_name from public.dna_canon where artist_norm <> '' and title_norm <> ''")
                canon = cur.fetchall()
            ck = {}
            for a, t, m in canon: ck.setdefault(key64(f"{a}|{t}"), set()).add(m)
            pos = np.searchsorted(keys, np.fromiter(ck.keys(), dtype="uint64"))
            hit_rows = [(int(p), ck[k]) for p, k in zip(pos, ck.keys()) if p < len(keys) and keys[p] == k]
            rng2 = np.random.default_rng(3); rows_by_key = {}
            for p, mixes in hit_rows: rows_by_key[p] = mixes
            canon_rows = np.array(sorted(rows_by_key)); tested = 0; same = 0; rand_same = 0
            mixes_of_row = {p: rows_by_key[p] for p in canon_rows}
            V = vec.astype("float32")
            for p in canon_rows[:400]:
                d = ((V - V[p]) ** 2).sum(axis=1); d[p] = np.inf
                nn = np.argpartition(d, 10)[:10]
                tested += 1
                if any(mixes_of_row.get(int(q), set()) & mixes_of_row[p] for q in nn): same += 1
                rr = rng2.choice(len(V), 10, replace=False)
                if any(mixes_of_row.get(int(q), set()) & mixes_of_row[p] for q in rr): rand_same += 1
            proof.update({"canon_with_print": len(hit_rows), "canon_tested": tested, "same_mix_at_10": round(same / max(tested, 1), 3), "random_at_10": round(rand_same / max(tested, 1), 3)})
        except Exception as ex:
            proof["canon_error"] = str(ex)[:200]
    manifest = {"n": int(len(vec)), "dims": DIMS, "scale": scale, "explained": round(explained, 4), "features": names, "families": FAMILIES,
                "builtAt": pd.Timestamp.utcnow().isoformat(), "files": ["keys.u64", "vec.i8", "akeys.u64", "arows.u32", "names.txt.gz", "offs.u32", "meta.bin"]}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1)); (OUT / "proof.json").write_text(json.dumps(proof, indent=1))
    size = sum((OUT / f).stat().st_size for f in manifest["files"]) / 1048576
    print(f"[prints] wrote {OUT} ({size:.0f} MB); duplicate rate {dup_rate:.3%}; canon: same mix in top 10 {proof['same_mix_at_10']} vs random {proof['random_at_10']} on {proof['canon_tested']} records; {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
