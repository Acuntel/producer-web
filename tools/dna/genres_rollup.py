"""MusicBrainz's fine genres (thousands: amapiano, gqom, footwork, zeuhl, singeli) as a first-class table.

From data/dna/raw/mb_artist_genres.parquet (artist -> genre names, best first) joined to the artist rollup
(song counts, tempo, family) and to the songs' families: one row per genre with the artists and songs it
holds in the store, the tempo median across its artists, the family it folds into, and exemplar artists.
Writes data/dna/genres.parquet; load_pg loads it as dna_genres.

  <dna-venv>/bin/python tools/dna/genres_rollup.py
"""
from __future__ import annotations

import json, sys, time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import util  # noqa: E402
from families import family_from_genres  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "dna" / "raw"
OUT = ROOT / "data" / "dna" / "genres.parquet"
MIN_ARTISTS = 3


def main() -> None:
    t0 = time.time()
    mb = pd.read_parquet(RAW / "mb_artist_genres.parquet", columns=["artist_norm", "genres", "votes"])
    artists = pd.read_parquet(ROOT / "data" / "dna" / "artists.parquet", columns=["artist_norm", "display_name", "song_count", "chart_songs", "tempo_p50", "energy_p50", "families"])
    rows = mb.explode("genres").dropna(subset=["genres"]).rename(columns={"genres": "genre"})
    rows["genre"] = rows["genre"].astype(str).str.strip().str.lower()
    rows = rows[rows["genre"].str.len().between(2, 40)]
    rows["rank"] = rows.groupby("artist_norm").cumcount()          # 0 = the artist's first (best voted) genre
    j = rows.merge(artists, on="artist_norm", how="inner")
    print(f"[genres] {len(j):,} artist-genre rows across {j['genre'].nunique():,} genres for {j['artist_norm'].nunique():,} artists in the store ({time.time() - t0:.0f}s)", flush=True)
    g = j.groupby("genre")
    out = pd.DataFrame({
        "artists": g["artist_norm"].nunique(), "primary_artists": g.apply(lambda x: int((x["rank"] == 0).sum()), include_groups=False),
        "songs": g["song_count"].sum(), "chart_songs": g["chart_songs"].sum(),
        "tempo_p50": g["tempo_p50"].median(), "energy_p50": g["energy_p50"].median(),
    }).reset_index()
    out = out[out["artists"] >= MIN_ARTISTS].copy()
    out["family"] = out["genre"].map(lambda x: family_from_genres([x]))
    # Exemplars: the genre's biggest artists by songs in the store, chart names first.
    ex = j.sort_values(["chart_songs", "song_count"], ascending=False).groupby("genre")["display_name"].apply(lambda s: [str(x) for x in s.dropna().unique()[:6]])
    out["exemplars"] = out["genre"].map(ex)
    out["exemplars"] = out["exemplars"].apply(lambda v: json.dumps(list(v) if isinstance(v, (list, np.ndarray)) else []))
    out = out.sort_values(["artists", "songs"], ascending=False).reset_index(drop=True)
    util.write_parquet(out, OUT)
    print(f"[genres] {len(out):,} genres with {MIN_ARTISTS}+ artists -> {OUT} ({time.time() - t0:.0f}s); top: {out.head(8)[['genre', 'artists', 'songs']].values.tolist()}")
    print("[genres] a few from the long tail:", out[out['artists'].between(3, 12)].sample(10, random_state=1)['genre'].tolist())


if __name__ == "__main__":
    main()
