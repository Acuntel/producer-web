"""Run the whole DNA pipeline end to end and print the final report
(docs/DNA_SPEC.md section 6): rows per source, billboard/spotify join rate,
bins written, galton.json size, load status, and five example lookups.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import billboard
import chordonomicon
import groove
import lakh
import library
import load_pg
import mcgill
import rollup
import spotify

DATA = Path(__file__).resolve().parents[2] / "data" / "dna"


def artist_lookup(artists: pd.DataFrame, name: str) -> None:
    row = artists[artists["artist_norm"] == name]
    if row.empty:
        print(f"  '{name}': no rows (artist not in any source, or below song_count noise)")
        return
    r = row.iloc[0]
    print(f"  '{name}': {r['song_count']} songs, {r['chart_songs']} charted, "
          f"{r['number_ones']} #1s, tempo_p50={r['tempo_p50']}, top_harmony={r['top_harmony_class']}, "
          f"exemplars={r['exemplars'][:3]}")


def bucket_lookup(galton: dict) -> None:
    """galton.json stores exemplars/progressions/grids once in shared tables and
    each bin is a positional array (galton['bin_fields'] gives the order), not
    an object - the same hit songs recur across many overlapping bins, and
    repeating 9 field names per bin cost more than the data itself. Resolve
    indices and positions back to a readable dict for the report."""
    key = "5:122-132|four_floor|minor|2020|electronic"
    row = galton["bins"].get(key)
    if row:
        entry = dict(zip(galton["bin_fields"], row))
        songs_t, prog_t, grid_t = galton["songs"], galton["progressions"], galton["grids"]
        progs = [[prog_t[i], c] for i, c in entry["top_progressions"]]
        exemplars = [songs_t[i] for i in entry["exemplars"][:3]]
        kick = grid_t[entry["top_kick_grid"]] if entry["top_kick_grid"] is not None else None
        print(f"  {key}: count={entry['count']}, tempo_p50={entry['tempo_p50']}, "
              f"mode_share={entry['mode_share']}, top_progressions={progs}, "
              f"top_kick={kick}, exemplars={exemplars}")
    else:
        print(f"  {key}: no bin at count>=20 (see buckets.parquet for the raw, unfiltered count)")


def top_openings_1960s(songs: pd.DataFrame, n: int = 5) -> None:
    n1 = songs[(songs["hit_tier"] == "number1") & (songs["decade"] == 1960)]
    openings = n1["progression"].dropna().apply(lambda p: " ".join(p.split()[:4]))
    if openings.empty:
        print("  no #1s with a known progression in the 1960s")
        return
    for prog, count in openings.value_counts().head(n).items():
        print(f"  {prog}  ({count})")


def run():
    t0 = time.time()
    stage_results = {}
    for mod, name in [(billboard, "billboard"), (spotify, "spotify"),
                       (chordonomicon, "chordonomicon"), (lakh, "lakh"),
                       (groove, "groove"), (mcgill, "mcgill"), (library, "library")]:
        print(f"\n=== {name} ===")
        stage_results[name] = mod.run()

    print("\n=== rollup ===")
    result = rollup.run()

    print("\n=== load_pg ===")
    dsn = load_pg.resolve_dsn(None)
    load_pg.run(dsn, dry_run=False)

    galton = json.loads((Path(__file__).resolve().parents[2] / "data" / "galton.json").read_text())

    print("\n" + "=" * 60)
    print("FINAL REPORT")
    print("=" * 60)
    print("\nRows per source:")
    for name, df in stage_results.items():
        print(f"  {name}: {len(df):,} rows" if df is not None else f"  {name}: SKIPPED")

    hits = result["hits"]
    jr = hits["spotify_priors_by_hit_tier"]
    print(f"\nBillboard/Spotify join rate: {jr['join_rate']} ({jr['matched']:,}/{jr['billboard_songs']:,})")
    print(f"\nBuckets written: {len(result['buckets']):,} (all levels)")
    print(f"galton.json: {len(galton['bins']):,} bins (count>=20), {result['galton_bytes'] / 1024:.1f} KB")
    print(f"Load status: {'loaded to Postgres' if dsn else 'SKIPPED (no data/dna/PG_DSN)'}")

    print("\nExample lookups:")
    artist_lookup(result["artists"], "elvis presley")
    artist_lookup(result["artists"], "john summit")
    artist_lookup(result["artists"], "kettama")
    bucket_lookup(galton)
    print("  Top opening progressions of #1s in the 1960s:")
    top_openings_1960s(result["songs"])

    print(f"\nTotal pipeline time: {time.time() - t0:.1f}s")


if __name__ == "__main__":
    run()
