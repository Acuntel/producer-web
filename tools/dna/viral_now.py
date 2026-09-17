"""The viral now, per genre: Apple's public top-songs feeds (US and GB), one hundred a genre, dated.

Writes data/dna/raw/viral_now.parquet (fetched, country, genre, rank, artist, title, folded names). Rows accumulate
across runs so a record's weeks on the feed can be counted.   <dna-venv>/bin/python tools/dna/viral_now.py
"""
from __future__ import annotations

import datetime, sys, time
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import util  # noqa: E402
from util import norm_artist, norm_title  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "dna" / "raw" / "viral_now.parquet"
GENRES = {17: "dance", 7: "electronic", 18: "hiphop", 14: "pop", 21: "rock", 20: "alternative", 15: "rnb", 6: "country", 12: "latin", 10: "singer-songwriter", 11: "jazz", 24: "reggae", 5: "classical", 51: "kpop", 100: "all"}
COUNTRIES = ("us", "gb", "de", "br", "za", "ng", "au")
UA = {"User-Agent": "TheProducerResearch/1.0 (bradyschwartz25@gmail.com)"}


def main() -> None:
    t0 = time.time(); rows = []; today = datetime.date.today().isoformat()
    for cc in COUNTRIES:
        for gid, genre in GENRES.items():
            url = f"https://itunes.apple.com/{cc}/rss/topsongs/limit=100/{'' if gid == 100 else f'genre={gid}/'}json"
            try:
                j = requests.get(url, headers=UA, timeout=30).json(); entries = j.get("feed", {}).get("entry", []) or []
            except Exception as e:
                print(f"[viral] {cc} {genre}: {str(e)[:80]}", flush=True); continue
            for i, e in enumerate(entries, 1):
                rows.append({"fetched": today, "country": cc, "genre": genre, "rank": i, "artist": e.get("im:artist", {}).get("label"), "title": e.get("im:name", {}).get("label"),
                             "apple_genre": (e.get("category") or {}).get("attributes", {}).get("label"), "release": (e.get("im:releaseDate") or {}).get("label", "")[:10]})
            time.sleep(0.2)
    df = pd.DataFrame(rows).dropna(subset=["artist", "title"])
    df["artist_norm"] = df["artist"].map(norm_artist); df["title_norm"] = df["title"].map(norm_title)
    if OUT.exists():
        prev = pd.read_parquet(OUT); df = pd.concat([prev[prev["fetched"] != today], df], ignore_index=True)
    util.write_parquet(df, OUT)
    print(f"[viral] {len(rows):,} rows today across {df['country'].nunique()} countries and {df['genre'].nunique()} genres -> {OUT} ({len(df):,} rows total) in {time.time() - t0:.0f}s")
    print("[viral] sample:", df[df.fetched == today].groupby("genre").head(1)[["country", "genre", "artist", "title"]].head(6).values.tolist())


if __name__ == "__main__":
    main()
