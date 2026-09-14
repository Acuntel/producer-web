"""MusicBrainz artist genres (CC0): the artist JSON dump carries every artist's gid, name and the
community's genre and tag votes. Folded into our families they give a family to the AcousticBrainz
recordings (joined on the artist gid the recording tags carry) and, by name, to any other row with
no family of its own.

Input:  data/dna/raw/mb/artist.tar.xz   (json-dumps/<date>/artist.tar.xz; member mbdump/artist, one JSON per line)
Output: data/dna/raw/mb_artist_genres.parquet  (artist_mbid, name, artist_norm, family, genres, votes)

  <dna-venv>/bin/python tools/dna/mb_genres.py
"""
from __future__ import annotations

import json, os, subprocess, sys, tarfile, time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from util import norm_artist  # noqa: E402
from families import family_from_genres  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(os.environ.get("MB_ARTIST_DUMP", ROOT / "data" / "dna" / "raw" / "mb" / "artist.tar.xz"))
OUT = ROOT / "data" / "dna" / "raw" / "mb_artist_genres.parquet"


def main() -> None:
    t0 = time.time(); rows: list[dict] = []; seen = 0; with_genre = 0
    proc = subprocess.Popen(["xz", "-dc", "-T0", str(SRC)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    with tarfile.open(fileobj=proc.stdout, mode="r|") as tar:
        for m in tar:
            if not m.isfile() or not m.name.endswith("artist"): continue
            f = tar.extractfile(m)
            for line in f:
                seen += 1
                try: a = json.loads(line)
                except Exception: continue
                gid, name = a.get("id"), a.get("name")
                if not gid or not name: continue
                genres = sorted((a.get("genres") or []), key=lambda g: -int(g.get("count") or 0))
                tags = sorted((a.get("tags") or []), key=lambda t: -int(t.get("count") or 0))
                names = [g.get("name", "") for g in genres] or [t.get("name", "") for t in tags[:8]]
                if not names: continue
                fam = family_from_genres(names)
                if fam: with_genre += 1
                rows.append({"artist_mbid": gid, "name": name, "artist_norm": norm_artist(name), "family": fam,
                             "genres": names[:6], "votes": int((genres or tags)[0].get("count") or 0)})
                if seen % 250_000 == 0: print(f"[mb] {seen:,} artists read, {len(rows):,} with genres or tags, {with_genre:,} with a family", flush=True)
    proc.wait()
    df = pd.DataFrame(rows)
    df.to_parquet(OUT, index=False)
    print(f"[mb] {seen:,} artists -> {len(df):,} with genres or tags, {with_genre:,} with a family -> {OUT} in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
