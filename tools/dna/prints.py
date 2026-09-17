"""The fingerprint: every audio-measured recording as 32 numbers, where distance means "sounds like".

From the AcousticBrainz parquet: the eighteen classifiers' probabilities (complements dropped), log
tempo, onset rate, rhythm danceability, tuning deviation, the tempo histogram peak ratio, key as a
point on the circle, and mode. Standardised, projected with PCA to 32 dimensions, stored as int8.
From songs.parquet (after the rollup): the calibrated energy, the feel reads, family and voice, so a
song's address on the board can be printed next to its neighbours.

Layout v2 (masterprompt section 13), rows sorted by (artist key, title key), brotli on disk:
  manifest.json   n, dims, scale, families, codec
  akeys.u64       per row: sha1-8 of artist_norm, little endian (sorted; a binary search finds an artist's rows)
  tkeys.u32       per row: low 32 bits of sha1-8 of title_norm (a scan inside the artist's rows finds a record)
  vec.i8.br       rows x 32 int8
  names.txt.br    artist TAB title per row, UTF-8
  lens.u16.br     byte length of each name (offsets are their prefix sums)
  meta.bin.br     10 bytes a row: tempo x10 u16, year u16, energy u8, valence u8, arousal u8,
                  key (4 bits, 15 unknown) | mode (2 bits) << 4 | voice (2 bits) << 6, family index u8, fame u8
  proof.json      duplicate rate, family agreement, DJ-played neighbours

  <dna-venv>/bin/python tools/dna/prints.py
"""
from __future__ import annotations

import hashlib, json, time
from pathlib import Path

import brotli
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
    col = lambda c, d: np.nan_to_num(df[c].to_numpy(dtype="float64"), nan=d) if c in df else np.full(len(df), d)
    onset, rdance, tdev = col("onset_rate", 3.0), col("rhythm_danceability", 1.0), col("tuning_dev", 0.0)
    p1, p2 = col("bpm_peak1", 0.0), col("bpm_peak2", 0.0)
    ratio = np.where((p1 > 0) & (p2 > 0), p2 / np.where(p1 > 0, p1, 1), 1.0)
    pc = np.nan_to_num(df["key_pc"].to_numpy(dtype="float64"), nan=0.0)
    mode = df["mode"].map({"major": 1.0, "minor": 0.0}).fillna(0.5).to_numpy(dtype="float64")
    extras = np.c_[np.log(tempo), np.log1p(onset), rdance, np.clip(tdev, 0, 1), np.clip(ratio, 0.4, 2.5),
                   np.sin(2 * np.pi * pc / 12), np.cos(2 * np.pi * pc / 12), mode].astype("float32")
    X = np.nan_to_num(np.c_[X, extras], nan=0.0)
    return X, pcols + ["log_tempo", "log_onset", "rhythm_danceability", "tuning_dev", "peak_ratio", "key_sin", "key_cos", "mode"]


def find(akeys: np.ndarray, tkeys: np.ndarray, a: int, t: int) -> int | None:
    lo, hi = np.searchsorted(akeys, a, "left"), np.searchsorted(akeys, a, "right")
    hit = np.flatnonzero(tkeys[lo:hi] == t)
    return int(lo + hit[0]) if len(hit) else None


def main() -> None:
    t0 = time.time()
    ab = pd.read_parquet(AB)
    print(f"[prints] {len(ab):,} recordings, {sum(c.startswith('p_') for c in ab.columns)} probabilities ({time.time() - t0:.0f}s)", flush=True)
    fame_p = ROOT / "data" / "dna" / "fame.parquet"
    if fame_p.exists():
        f = pd.read_parquet(fame_p, columns=["artist_norm", "title_norm", "fame"]).drop_duplicates(["artist_norm", "title_norm"])
        ab = ab.merge(f, on=["artist_norm", "title_norm"], how="left")
    if "fame" not in ab.columns: ab["fame"] = 0.0
    if SONGS.exists():
        songs = pd.read_parquet(SONGS, columns=["id", "energy", "valence_read", "arousal_read", "family", "voice"]).drop_duplicates("id").set_index("id")
        ab = ab.join(songs, on="id", rsuffix="_rolled")
        for c in ("energy", "voice", "valence_read", "arousal_read"):
            if f"{c}_rolled" in ab: ab[c] = ab[f"{c}_rolled"].fillna(ab[c])
        if "family_rolled" in ab: ab["family"] = ab["family_rolled"]
    X, names = feature_matrix(ab)
    print(f"[prints] feature matrix {X.shape} ({time.time() - t0:.0f}s)", flush=True)
    rng = np.random.default_rng(7)
    sample = X[rng.choice(len(X), size=min(300_000, len(X)), replace=False)]
    mu = sample.mean(axis=0); sd = sample.std(axis=0); sd[sd < 1e-6] = 1.0
    _, S, Vt = np.linalg.svd(np.clip((sample - mu) / sd, -4, 4), full_matrices=False)
    comps = Vt[:DIMS].T.astype("float32"); explained = float((S[:DIMS] ** 2).sum() / (S ** 2).sum())
    proj = np.empty((len(X), DIMS), dtype="float32")
    for a in range(0, len(X), 200_000): proj[a:a + 200_000] = np.clip((X[a:a + 200_000] - mu) / sd, -4, 4) @ comps
    scale = float(127.0 / np.quantile(np.abs(proj[rng.choice(len(proj), 200_000, replace=False)]), 0.999))
    vec = np.clip(np.rint(proj * scale), -127, 127).astype("int8")
    print(f"[prints] PCA {DIMS} dims explain {explained:.1%}; int8 scale {scale:.3f} ({time.time() - t0:.0f}s)", flush=True)
    # One order: artist key, then title key.
    an = ab["artist_norm"].fillna(""); tn = ab["title_norm"].fillna("")
    akeys = np.fromiter((key64(a) for a in an), dtype="uint64", count=len(ab))
    tkeys = np.fromiter((key64(t) & 0xFFFFFFFF for t in tn), dtype="uint32", count=len(ab))
    order = np.lexsort((tkeys, akeys))
    akeys, tkeys, vec = akeys[order], tkeys[order], vec[order]; ab = ab.iloc[order].reset_index(drop=True)
    # Names and meta.
    parts = [f"{a}\t{t}".encode("utf-8") for a, t in zip(ab["artist"].fillna(""), ab["title"].fillna(""))]
    lens = np.fromiter((min(len(p), 65535) for p in parts), dtype="uint16", count=len(parts)); blob = b"".join(p[:65535] for p in parts)
    def u8(col, default):
        v = ab[col].to_numpy(dtype="float64") if col in ab else np.full(len(ab), np.nan)
        return np.clip(np.rint(np.nan_to_num(v, nan=default) * 255), 0, 255).astype("uint8")
    tempo = np.nan_to_num(ab["tempo"].to_numpy(dtype="float64")); year = np.nan_to_num(ab["year"].to_numpy(dtype="float64"))
    key = ab["key_pc"].to_numpy(dtype="float64"); key = np.where(np.isnan(key), 15, key).astype("uint8") & 15
    mode = ab["mode"].map({"major": 1, "minor": 2}).fillna(0).to_numpy(dtype="uint8")
    voice = ab["voice"].to_numpy(dtype="float64") if "voice" in ab else np.full(len(ab), np.nan)
    voice = np.where(np.isnan(voice), 0, np.where(voice >= 0.5, 1, 2)).astype("uint8")
    fam_idx = {f: i for i, f in enumerate(FAMILIES)}
    meta = np.zeros((len(ab), 10), dtype="uint8")
    meta[:, 0:2] = np.clip(np.rint(tempo * 10), 0, 65535).astype("<u2").view("uint8").reshape(-1, 2)
    meta[:, 2:4] = np.clip(year, 0, 65535).astype("<u2").view("uint8").reshape(-1, 2)
    meta[:, 4] = u8("energy", 0.5); meta[:, 5] = u8("valence_read", 0.5); meta[:, 6] = u8("arousal_read", 0.5)
    meta[:, 7] = key | (mode << 4) | (voice << 6)
    meta[:, 8] = ab["family"].map(lambda f: fam_idx.get(f, 0) if isinstance(f, str) else 0).to_numpy(dtype="uint8")
    meta[:, 9] = u8("fame", 0.0)   # section 18: fame 0-255
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*"):
        if old.name not in ("manifest.json", "proof.json"): old.unlink()
    br = lambda b: brotli.compress(bytes(b), quality=9, lgwin=24)
    akeys.astype("<u8").tofile(OUT / "akeys.u64"); tkeys.astype("<u4").tofile(OUT / "tkeys.u32")
    (OUT / "vec.i8.br").write_bytes(br(vec.tobytes())); (OUT / "names.txt.br").write_bytes(br(blob))
    (OUT / "lens.u16.br").write_bytes(br(lens.astype("<u2").tobytes())); (OUT / "meta.bin.br").write_bytes(br(meta.tobytes()))
    files = ["akeys.u64", "tkeys.u32", "vec.i8.br", "names.txt.br", "lens.u16.br", "meta.bin.br"]
    # Proof 1: how unique is a print. Proof 2: does distance mean sound (family agreement, DJ-played neighbours).
    dup_rate = 1 - len(np.unique(vec, axis=0)) / len(vec)
    proof = {"n": int(len(vec)), "dims": DIMS, "explained": round(explained, 4), "duplicate_rate": round(float(dup_rate), 5)}
    V = vec.astype("float32"); rng2 = np.random.default_rng(3); fam = meta[:, 8]
    def knn(p: int, k: int = 10) -> np.ndarray:
        d = ((V - V[p]) ** 2).sum(axis=1); d[akeys == akeys[p]] = np.inf
        return np.argpartition(d, k)[:k]
    labelled = np.flatnonzero(fam > 0)
    if len(labelled) > 5000:
        qs = rng2.choice(labelled, 2000, replace=False); same = tot = 0; base = 0.0; share = np.bincount(fam, minlength=len(FAMILIES)) / len(fam)
        for p in qs:
            lab = fam[knn(int(p))]; known = lab > 0
            if not known.any(): continue
            same += int((lab[known] == fam[p]).sum()); tot += int(known.sum()); base += float(share[fam[p]]) * int(known.sum())
        proof.update({"family_same_at_10": round(same / max(tot, 1), 3), "family_base_rate": round(base / max(tot, 1), 3), "family_queries": int(len(qs))})
    dsn_p = ROOT / "data" / "dna" / "PG_DSN"
    if dsn_p.exists():
        try:
            import psycopg
            with psycopg.connect(dsn_p.read_text().strip(), connect_timeout=15) as c, c.cursor() as cur:
                cur.execute("select distinct artist_norm, title_norm from public.dna_canon where artist_norm <> '' and title_norm <> ''"); canon = cur.fetchall()
            hit = [r for r in (find(akeys, tkeys, key64(a), key64(t) & 0xFFFFFFFF) for a, t in canon) if r is not None]
            played = np.zeros(len(vec), dtype=bool); played[hit] = True; near = tot = 0
            for p in hit[:400]: nn = knn(p); near += int(played[nn].sum()); tot += len(nn)
            proof.update({"canon_with_print": len(hit), "played_neighbours_at_10": round(near / max(tot, 1), 4), "played_base_rate": round(float(played.mean()), 6)})
        except Exception as ex:
            proof["canon_error"] = str(ex)[:200]
    manifest = {"v": 3, "n": int(len(vec)), "dims": DIMS, "scale": scale, "codec": "br", "explained": round(explained, 4), "features": names, "families": FAMILIES,
                "builtAt": pd.Timestamp.utcnow().isoformat(), "files": files}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1)); (OUT / "proof.json").write_text(json.dumps(proof, indent=1))
    size = sum((OUT / f).stat().st_size for f in files) / 1048576
    print(f"[prints] wrote {OUT} ({size:.0f} MB on disk); duplicate rate {dup_rate:.3%}; family agreement at 10: {proof.get('family_same_at_10')} vs base {proof.get('family_base_rate')}; "
          f"DJ-played neighbours: {proof.get('played_neighbours_at_10')} vs base {proof.get('played_base_rate')} on {proof.get('canon_with_print')} records; {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
