"""Flow: the patterns of form, joining and feel, measured from what the store holds.

  section grammar   from every structure string (Chordonomicon, Lakh, McGill, library, heard): what follows what,
                    section counts, where the first chorus lands, two-chorus/two-drop share; per family when rows allow
  turnarounds       from chorus_progression: what chord opens and closes a chorus, by mode
  energy arcs       from the 500 library records (per-bar energy + sections): build slope, break depth, drop return,
                    silence before the drop, the energy jump at section boundaries (smoothness)
  dj transitions    from the canon: how long a record plays, the pitch bend, and (where the store knows both records)
                    the tempo delta and the key relationship between consecutive records

Writes data/dna/flow.json. <dna-venv>/bin/python tools/dna/flow.py
"""
from __future__ import annotations

import glob, json, time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "dna" / "flow.json"
CODES = {"I": "intro", "V": "verse", "C": "chorus", "B": "bridge", "P": "pre-chorus", "S": "solo", "O": "outro", "D": "drop", "K": "break", "U": "build", "X": "other"}
CAMELOT_MAJOR = {0: "8B", 7: "9B", 2: "10B", 9: "11B", 4: "12B", 11: "1B", 6: "2B", 1: "3B", 8: "4B", 3: "5B", 10: "6B", 5: "7B"}   # pitch class -> wheel position (major)


def camelot(pc, mode):
    if pc is None or pc != pc or mode not in ("major", "minor"): return None
    pc = int(pc) % 12
    if mode == "major": return CAMELOT_MAJOR[pc]
    rel = (pc + 3) % 12   # relative major of a minor key
    return CAMELOT_MAJOR[rel].replace("B", "A")


def wheel_steps(a: str, b: str) -> int | None:
    if not a or not b: return None
    na, nb = int(a[:-1]), int(b[:-1])
    d = min((na - nb) % 12, (nb - na) % 12)
    return d


def pct(x, d=1): return round(float(x) * 100, d)


def grammar(s: pd.DataFrame) -> dict:
    out = {}
    groups = [("all", s)] + [(str(f), g) for f, g in s.dropna(subset=["family"]).groupby("family") if len(g) >= 300]
    for name, g in groups:
        trans: dict[str, Counter] = defaultdict(Counter); counts = Counter(); opens = Counter(); n = 0
        for st in g["structure"].dropna():
            seq = st.split()
            if len(seq) < 2: continue
            n += 1; opens[seq[0]] += 1; counts[len(seq)] += 1
            for a, b in zip(seq, seq[1:]):
                if a != b: trans[a][b] += 1
        nxt = {a: [[b, round(c / sum(v.values()), 3)] for b, c in v.most_common(3)] for a, v in trans.items() if sum(v.values()) >= 50}
        fcb = pd.to_numeric(g["first_chorus_bar"], errors="coerce").dropna()
        sc = pd.to_numeric(g["section_count"], errors="coerce").dropna()
        two = g["structure"].dropna().map(lambda x: x.split().count("C") >= 2 or x.split().count("D") >= 2).mean() if n else None
        out[name] = {"songs": n, "opens": [[c, round(v / max(n, 1), 3)] for c, v in opens.most_common(3)], "next": nxt,
                     "sections_p50": int(sc.median()) if len(sc) else None, "first_chorus_bar": {"p25": int(fcb.quantile(0.25)), "p50": int(fcb.median()), "p75": int(fcb.quantile(0.75))} if len(fcb) > 50 else None,
                     "two_peaks_share": round(float(two), 3) if two is not None else None}
    return out


def turnarounds(s: pd.DataFrame) -> dict:
    out = {}
    for mode, g in s.dropna(subset=["chorus_progression"]).groupby("mode"):
        if mode not in ("major", "minor") or len(g) < 500: continue
        first = Counter(); last = Counter(); n = 0
        for prog in g["chorus_progression"]:
            seq = prog.split()
            if not seq: continue
            n += 1; first[seq[0]] += 1; last[seq[-1]] += 1
        out[mode] = {"choruses": n, "opens_on": [[c, round(v / n, 3)] for c, v in first.most_common(4)], "closes_on": [[c, round(v / n, 3)] for c, v in last.most_common(4)]}
    return out


def energy_arcs() -> dict:
    slopes, breaks, returns, gaps, jumps, drop_bars, first_drops = [], [], [], [], [], [], []
    n = 0
    for f in glob.glob(str(ROOT / "data" / "library" / "*.json")):
        try: d = json.load(open(f))["facts"]
        except Exception: continue
        st = d.get("structure") or {}; e = st.get("energy") or []; secs = st.get("sections") or []; total = st.get("barsTotal") or len(e)
        if len(e) < 16 or not secs: continue
        n += 1; e = np.array(e, dtype=float); e = e / (e.max() + 1e-9)
        # sections carry a start bar (or startBar) and bars; energy is per bar over the record
        bounds = []
        for sec in secs:
            start = sec.get("startBar", sec.get("start")); bars = sec.get("bars")
            if start is None: continue
            bounds.append((int(start), int(bars) if bars else None, str(sec.get("name", "")).lower()))
        bounds.sort()
        # boundary jump: the energy of the 2 bars after a boundary against the 2 bars before
        for start, _, _ in bounds[1:]:
            if 2 <= start < len(e) - 2: jumps.append(float(abs(e[start:start + 2].mean() - e[start - 2:start].mean())))
        # peaks and valleys over 8-bar blocks
        blocks = [float(e[b:b + 8].mean()) for b in range(0, len(e) - 7, 8)]
        if len(blocks) >= 4:
            peak = max(blocks); ip = int(np.argmax(blocks))
            first_drops.append(ip * 8)
            # build slope: the rise over the two blocks before the peak, per block
            if ip >= 2: slopes.append((blocks[ip] - blocks[ip - 2]) / 2)
            # break depth: the deepest block after the first peak, against the peak
            after = blocks[ip + 1:]
            if after: breaks.append(peak - min(after))
            # drop return: the second-highest block after the first peak, against the peak
            if len(after) >= 2: returns.append(max(after) / peak)
            # the gap: the bar right before the peak block under a fifth of the peak
            if ip >= 1 and e[ip * 8 - 1] < 0.2 * peak: gaps.append(1)
            else: gaps.append(0)
    q = lambda xs: {"p25": round(float(np.quantile(xs, 0.25)), 3), "p50": round(float(np.median(xs)), 3), "p75": round(float(np.quantile(xs, 0.75)), 3)} if len(xs) >= 20 else None
    return {"records": n, "build_slope_per_8_bars": q(slopes), "break_depth": q(breaks), "second_peak_over_first": q(returns), "gap_before_drop_share": round(float(np.mean(gaps)), 3) if gaps else None,
            "boundary_jump": q(jumps), "first_peak_bar": q(first_drops)}


def dj_transitions() -> dict:
    dsn = ROOT / "data" / "dna" / "PG_DSN"
    if not dsn.exists(): return {}
    import psycopg
    with psycopg.connect(dsn.read_text().strip(), connect_timeout=15) as c, c.cursor() as cur:
        cur.execute("""select m.id, m.source_url, c.position_sec, c.artist_norm, c.title_norm, c.pitch_pct from public.dna_canon c
                       join public.dna_canon_mixes m on m.id = c.mix_id order by m.id, c.position_sec""")
        rows = cur.fetchall()
    # Dedupe mixes the finder resolved to the same file.
    by_mix: dict = defaultdict(list); seen_urls = {}
    for mid, url, pos, a, t, pitch in rows:
        key = seen_urls.setdefault(url or str(mid), mid)
        if key != mid: continue
        by_mix[mid].append((float(pos or 0), a, t, float(pitch) if pitch is not None else None))
    ab = pd.read_parquet(ROOT / "data" / "dna" / "raw" / "acousticbrainz_songs.parquet", columns=["artist_norm", "title_norm", "tempo", "key_pc", "mode"]).drop_duplicates(["artist_norm", "title_norm"]).set_index(["artist_norm", "title_norm"])
    plays, pitches, tempo_deltas, key_steps, known_pairs = [], [], [], Counter(), 0
    for mid, lst in by_mix.items():
        lst.sort()
        for (p0, a0, t0, pi0), (p1, a1, t1, pi1) in zip(lst, lst[1:]):
            if p1 - p0 > 30: plays.append(p1 - p0)
            if pi0 is not None: pitches.append(abs(pi0))
            try: r0 = ab.loc[(a0, t0)]; r1 = ab.loc[(a1, t1)]
            except KeyError: continue
            if isinstance(r0, pd.DataFrame): r0 = r0.iloc[0]
            if isinstance(r1, pd.DataFrame): r1 = r1.iloc[0]
            if pd.notna(r0.tempo) and pd.notna(r1.tempo):
                d = abs(float(r1.tempo) - float(r0.tempo)); d = min(d, abs(d - 0.5 * float(r0.tempo)) if d > 30 else d); tempo_deltas.append(d)
            c0, c1 = camelot(r0.key_pc, r0["mode"]), camelot(r1.key_pc, r1["mode"])
            st = wheel_steps(c0, c1)
            if st is not None:
                known_pairs += 1
                key_steps["same key" if c0 == c1 else "relative (same number)" if c0[:-1] == c1[:-1] else f"{st} step{'s' if st != 1 else ''} round the wheel"] += 1
    q = lambda xs: {"p25": round(float(np.quantile(xs, 0.25)), 1), "p50": round(float(np.median(xs)), 1), "p75": round(float(np.quantile(xs, 0.75)), 1)} if len(xs) >= 20 else None
    return {"mixes": len(by_mix), "transitions": sum(max(0, len(v) - 1) for v in by_mix.values()), "play_seconds": q(plays), "pitch_bend_pct": q(pitches),
            "tempo_delta_bpm": q(tempo_deltas), "key_pairs_known": known_pairs, "key_relationship": [[k, round(v / max(known_pairs, 1), 3)] for k, v in key_steps.most_common(6)]}


def main() -> None:
    t0 = time.time()
    s = pd.read_parquet(ROOT / "data" / "dna" / "songs.parquet", columns=["source", "family", "mode", "structure", "section_count", "first_chorus_bar", "chorus_progression"])
    out = {"grammar": grammar(s), "turnarounds": turnarounds(s), "energy": energy_arcs(), "dj": dj_transitions(), "builtAt": pd.Timestamp.utcnow().isoformat()}
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"[flow] wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB) in {time.time() - t0:.0f}s")
    g = out["grammar"]["all"]; print(f"  grammar: {g['songs']:,} structures; opens {g['opens'][:2]}; after V -> {g['next'].get('V')}; after C -> {g['next'].get('C')}; first chorus bar {g['first_chorus_bar']}; two peaks {g['two_peaks_share']}")
    print(f"  turnarounds: {out['turnarounds']}")
    print(f"  energy: {out['energy']}")
    print(f"  dj: {out['dj']}")


if __name__ == "__main__":
    main()
