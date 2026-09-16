"""Chord transition tables learned from the store, per family: what chord tends to follow what, in roman numerals.

From songs.parquet (progression strings in scale degrees, 680k from Chordonomicon plus McGill and the heard records),
per family and for everything together: first-chord frequencies, the top transitions with their probabilities, and the
most common four-chord cycles. Writes data/dna/markov.json (compact) for the Hands' math skill.

  <dna-venv>/bin/python tools/dna/markov.py
"""
from __future__ import annotations

import json, time
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "dna" / "markov.json"


def main() -> None:
    t0 = time.time()
    s = pd.read_parquet(ROOT / "data" / "dna" / "songs.parquet", columns=["family", "progression", "mode"])
    s = s.dropna(subset=["progression"]); s = s[s["progression"].str.len() > 2]
    print(f"[markov] {len(s):,} progressions ({time.time() - t0:.0f}s)", flush=True)
    tables: dict[str, dict] = {}
    groups = [("all", s)] + [(str(f), g) for f, g in s.groupby("family") if len(g) >= 300]
    for name, g in groups:
        first: Counter = Counter(); trans: dict[str, Counter] = defaultdict(Counter); cycles: Counter = Counter(); n = 0
        for prog in g["progression"]:
            seq = prog.split()
            if len(seq) < 2: continue
            n += 1; first[seq[0]] += 1
            for a, b in zip(seq, seq[1:]):
                if a != b: trans[a][b] += 1
            for i in range(0, len(seq) - 3):
                cyc = seq[i:i + 4]
                if len(set(cyc)) >= 3: cycles[" ".join(cyc)] += 1
        top_chords = [c for c, _ in (first + Counter({a: sum(v.values()) for a, v in trans.items()})).most_common(12)]
        table = {}
        for a in top_chords:
            tot = sum(trans[a].values())
            if tot < 20: continue
            table[a] = [[b, round(c / tot, 3)] for b, c in trans[a].most_common(4)]
        tables[name] = {"songs": n, "first": [[c, round(v / max(n, 1), 3)] for c, v in first.most_common(5)], "next": table,
                        "cycles": [[cyc, c] for cyc, c in cycles.most_common(8)]}
    OUT.write_text(json.dumps(tables, separators=(",", ":")))
    print(f"[markov] {len(tables)} tables -> {OUT} ({OUT.stat().st_size / 1024:.0f} KB) in {time.time() - t0:.0f}s")
    for name in ("all", "house", "pop", "hiphop"):
        if name in tables: print(f"  {name}: first {tables[name]['first'][:3]}; after I -> {tables[name]['next'].get('I', tables[name]['next'].get('i'))}; cycles {tables[name]['cycles'][:2]}")


if __name__ == "__main__":
    main()
