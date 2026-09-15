"""Spotify audio-features dataset -> DNA rows. docs/DNA_SPEC.md section 1:
dedupe by track_id (same track appears under several genres), collect genres
into a list; key is pitch class 0-11 (-1 unknown), mode 1 major / 0 minor.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import download
import families
import feel
import schema
import util

OUT = Path(__file__).resolve().parents[2] / "data" / "dna" / "raw" / "spotify_songs.parquet"


def run() -> pd.DataFrame | None:
    t0 = time.time()
    src = download.ensure("spotify")
    if src is None:
        print("[spotify] SKIPPED: source not downloaded")
        return None

    df = pd.read_csv(src)
    n_raw = len(df)

    genres_by_track = df.groupby("track_id")["track_genre"].apply(
        lambda s: sorted(set(str(g).lower() for g in s.dropna()))
    )
    first = df.drop_duplicates(subset="track_id", keep="first").set_index("track_id")
    n_tracks = len(first)

    rows = []
    for track_id, r in first.iterrows():
        artist_norm = util.norm_artist(r["artists"])
        title_norm = util.norm_title(r["track_name"])
        genres = genres_by_track.get(track_id, [])
        family = families.family_from_genres(genres)
        tempo = util.fold_tempo(r["tempo"]) if pd.notna(r["tempo"]) else None
        key_pc = int(r["key"]) if pd.notna(r["key"]) and int(r["key"]) in range(12) else None
        mode = "major" if r["mode"] == 1 else ("minor" if r["mode"] == 0 else None)
        acousticness = float(r["acousticness"]) if pd.notna(r["acousticness"]) else None
        energy = float(r["energy"]) if pd.notna(r["energy"]) else None
        valence = float(r["valence"]) if pd.notna(r["valence"]) else None

        row = schema.empty_row()
        row.update({
            "id": util.stable_id("spotify", artist_norm, title_norm),
            "source": "spotify", "title": r["track_name"], "artist": r["artists"],
            "artist_norm": artist_norm, "title_norm": title_norm,
            "join_key": f"{artist_norm}|{title_norm}",
            "genres": genres, "family": family, "lane": families.derive_lane(family, tempo),
            "tempo": tempo, "key_pc": key_pc, "mode": mode,
            "time_sig": int(r["time_signature"]) if pd.notna(r["time_signature"]) else None,
            "duration_sec": float(r["duration_ms"]) / 1000.0 if pd.notna(r["duration_ms"]) else None,
            "energy": energy, "danceability": float(r["danceability"]) if pd.notna(r["danceability"]) else None,
            "valence": valence, "loudness": float(r["loudness"]) if pd.notna(r["loudness"]) else None,
            "acousticness": acousticness,
            "speechiness": float(r["speechiness"]) if pd.notna(r["speechiness"]) else None,
            "instrumentalness": float(r["instrumentalness"]) if pd.notna(r["instrumentalness"]) else None,
            "popularity": float(r["popularity"]) if pd.notna(r["popularity"]) else None,
            "hit_tier": "none",
        })
        feels = feel.compute_feel({
            "mode": mode, "borrowed": None, "harmony_class": None, "valence": valence,
            "tempo": tempo, "energy": energy, "syncopation": None,
            "acousticness": acousticness, "family": family,
        })
        row.update(feels)
        rows.append(row)

    out = schema.to_frame(rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    util.write_parquet(out, OUT)
    dt = time.time() - t0
    print(f"[spotify] {n_raw:,} rows -> {n_tracks:,} distinct tracks in {dt:.1f}s -> {OUT}")
    return out


if __name__ == "__main__":
    run()
