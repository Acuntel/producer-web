"""Chordonomicon (680k chord-annotated songs) -> DNA rows. CC BY-NC 4.0: only
aggregates ship (per-row rollup stats, never the raw per-song chord text).

No title/artist text exists in this source, only artist_id ("artist_1") and a
spotify_song_id/spotify_artist_id that can be joined against the raw Spotify
CSV's track_id to recover a real title/artist for a subset of rows. Rows with
no Spotify match keep title/artist/artist_norm/title_norm/join_key null (never
invented) but still get a stable id, hashed from (source, artist_id, row id)
instead of (source, artist_norm, title_norm) so ids stay unique and
deterministic even without real text.

This source has no bar/time data, only a flat chord-token sequence. Chord
tokens in this dataset are one annotated segment each (commonly ~1 bar in
these flattened chord-sheet corpora); we use token position as a documented
bar-proxy for first_chorus_bar and chorus_share rather than leaving both null
for 680k rows, and flag that assumption here and in the final report.
"""
from __future__ import annotations

import re
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import download
import feel
import harmony
import schema
import util

RAW = Path(__file__).resolve().parents[2] / "data" / "dna" / "raw"
OUT = RAW / "chordonomicon_songs.parquet"
CHUNK = 50_000
SECTION_RE = re.compile(r"<([^>]+)>")
QUOTED_RE = re.compile(r"'([^']*)'")
CHORUS_CODES = {"C", "D"}


def load_spotify_lookup() -> dict[str, tuple[str, str]]:
    """track_id -> (track_name, artists), built straight from the raw Spotify
    CSV so this source does not depend on spotify.py having run first."""
    src = download.ensure("spotify")
    if src is None:
        return {}
    df = pd.read_csv(src, usecols=["track_id", "track_name", "artists"])
    df = df.drop_duplicates(subset="track_id")
    return {r.track_id: (r.track_name, r.artists) for r in df.itertuples(index=False)}


def parse_genres(genres_field: str | None, main_genre: str | None, rock_genre: str | None) -> list[str]:
    tags: list[str] = []
    if isinstance(genres_field, str):
        tags.extend(g.lower() for g in QUOTED_RE.findall(genres_field))
    for g in (main_genre, rock_genre):
        if isinstance(g, str) and g.strip():
            tags.append(g.strip().lower())
    return sorted(set(tags))


def parse_chords_field(chords: str) -> list[tuple[str, list[dict]]]:
    """'<verse_1> C F <chorus_1> G Am ...' -> [(section_code, [chord,...]), ...]
    Tokens before the first marker are bucketed under 'X' (unlabeled)."""
    sections: list[tuple[str, list[dict]]] = []
    current_code, current_chords = "X", []
    for tok in chords.split():
        m = SECTION_RE.fullmatch(tok)
        if m:
            if current_chords:
                sections.append((current_code, current_chords))
            current_code, current_chords = harmony.section_code(m.group(1)), []
            continue
        c = harmony.parse_chord(tok)
        if c:
            current_chords.append(c)
    if current_chords:
        sections.append((current_code, current_chords))
    return sections


def build_row(r, spotify_lookup: dict) -> dict | None:
    sections = parse_chords_field(r.chords) if isinstance(r.chords, str) else []
    all_chords = [c for _code, cs in sections for c in cs]
    if not all_chords:
        return None

    title, artist = None, None
    if isinstance(r.spotify_song_id, str) and r.spotify_song_id in spotify_lookup:
        title, artist = spotify_lookup[r.spotify_song_id]
    artist_norm = util.norm_artist(artist) if artist else None
    title_norm = util.norm_title(title) if title else None
    hash_artist = artist_norm or (r.artist_id or "unknown")
    hash_title = title_norm or f"row{r.id}"
    row_id = util.stable_id("chordonomicon", hash_artist, hash_title)

    year = None
    if isinstance(r.release_date, str) and len(r.release_date) >= 4 and r.release_date[:4].isdigit():
        year = int(r.release_date[:4])
    decade = util.decade_of(year) if year else (int(r.decade) if pd.notna(r.decade) else None)

    key_pc, mode = harmony.detect_key(all_chords)
    roman = [harmony.to_roman(c["root_pc"], c["quality"], key_pc) for c in all_chords]
    progression = harmony.collapse_runs(roman)
    h_class = harmony.harmony_class(progression)
    vocab, borrowed = harmony.chord_vocab_and_borrowed(all_chords, key_pc, mode)

    structure = " ".join(code for code, _ in sections)
    token_total = sum(len(cs) for _c, cs in sections)
    first_chorus_bar, chorus_share, chorus_prog = None, None, None
    running = 0
    chorus_tokens = 0
    first_found = False
    for code, cs in sections:
        if code in CHORUS_CODES:
            chorus_tokens += len(cs)
            if not first_found:
                first_chorus_bar = running
                chorus_prog_roman = [harmony.to_roman(c["root_pc"], c["quality"], key_pc) for c in cs]
                chorus_prog = harmony.collapse_runs(chorus_prog_roman)
                first_found = True
        running += len(cs)
    if token_total:
        chorus_share = round(chorus_tokens / token_total, 4)

    genres = parse_genres(r.genres, r.main_genre, r.rock_genre)
    row = schema.empty_row()
    row.update({
        "id": row_id, "source": "chordonomicon", "title": title, "artist": artist,
        "artist_norm": artist_norm, "title_norm": title_norm,
        "join_key": f"{artist_norm}|{title_norm}" if artist_norm and title_norm else None,
        "year": year, "decade": decade, "genres": genres or None,
        "key_pc": key_pc, "mode": mode, "hit_tier": "none",
        "structure": structure or None, "section_count": len(sections) or None,
        "first_chorus_bar": first_chorus_bar, "chorus_share": chorus_share,
        "progression": progression or None, "chorus_progression": chorus_prog,
        "harmony_class": h_class, "chord_vocab": vocab or None, "borrowed": borrowed,
    })
    feels = feel.compute_feel({
        "mode": mode, "borrowed": borrowed, "harmony_class": h_class,
        "valence": None, "tempo": None, "energy": None, "syncopation": None,
        "acousticness": None, "family": None,
    })
    row.update(feels)
    return row


def run() -> pd.DataFrame | None:
    t0 = time.time()
    src = download.ensure("chordonomicon")
    if src is None:
        print("[chordonomicon] SKIPPED: source not downloaded")
        return None

    spotify_lookup = load_spotify_lookup()
    print(f"[chordonomicon] spotify lookup: {len(spotify_lookup):,} track ids")

    rows, n_raw, no_chords, matched = [], 0, 0, 0
    for chunk in pd.read_csv(src, chunksize=CHUNK):
        n_raw += len(chunk)
        for r in chunk.itertuples(index=False):
            row = build_row(r, spotify_lookup)
            if row is None:
                no_chords += 1
                continue
            if row["title"] is not None:
                matched += 1
            rows.append(row)
        print(f"[chordonomicon] processed {n_raw:,} rows, {len(rows):,} kept", flush=True)

    out = schema.to_frame(rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    util.write_parquet(out, OUT)
    dt = time.time() - t0
    join_rate = matched / len(rows) if rows else 0
    print(f"[chordonomicon] {n_raw:,} rows ({no_chords:,} dropped: no parseable chords) "
          f"-> {len(out):,} songs, {matched:,} matched to Spotify ({join_rate:.1%}) "
          f"in {dt:.1f}s -> {OUT}")
    return out


if __name__ == "__main__":
    run()
