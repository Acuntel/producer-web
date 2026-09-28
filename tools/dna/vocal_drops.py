"""data/dna/vocal_drops.json: where a voice goes, rolled up from the placement rows the worker writes for every record
it hears (dna_vocal_phrases and dna_vocal_drops, migration 0020). The planner reads it as its prior
(docs/MASTERPROMPT_PRODUCER.md sections 5.5 and 6); planned in docs/MASTERPROMPT_V11.md 19.3 and never built until now.

Groups are keyed "family|tempo_band|archetype" with the fallbacks "family|*|*" and "*|*|*"; a reader takes the most
specific group with at least MIN_RECORDS records. Per group: the lead-in from the last line to the drop (beats),
where the hook's stressed syllable sits against the next peak, the pickup, the phrase length, which sections carry
the hook, the share of records whose voice carries through the drop, and how much of each section the voice fills.
The same record heard twice under two keys (identical rows) counts once.

    python tools/dna/vocal_drops.py --rows rows.jsonl [--out data/dna/vocal_drops.json]
    python tools/dna/vocal_drops.py --supabase [--out ...]      # reads the two tables (read only)"""
from __future__ import annotations
import argparse, json, os, statistics, sys, time
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MIN_RECORDS = 8


def q(values: list[float]) -> dict | None:
    v = sorted(x for x in values if x is not None)
    if not v: return None
    at = lambda p: v[min(len(v) - 1, max(0, round((len(v) - 1) * p)))]
    return {"p25": round(at(0.25), 3), "p50": round(statistics.median(v), 3), "p75": round(at(0.75), 3), "n": len(v)}


def shares(labels: list[str | None]) -> dict:
    c = defaultdict(int)
    for x in labels:
        if x: c[x] += 1
    n = sum(c.values())
    return {k: round(v / n, 3) for k, v in sorted(c.items(), key=lambda kv: -kv[1])} if n else {}


def dedupe(phrases: list[dict], drops: list[dict]) -> tuple[list[dict], list[dict], int]:
    """Keep one record per identical set of rows (the same hearing stored under two recognition keys)."""
    by_key: dict[str, list[dict]] = defaultdict(list)
    for r in phrases: by_key[r["record_key"]].append(r)
    seen, keep = {}, set()
    for key, rows in sorted(by_key.items()):
        sig = (rows[0].get("tempo"), tuple(sorted(round(r.get("start_sec") or 0, 2) for r in rows)))
        if sig in seen: continue
        seen[sig] = key; keep.add(key)
    dup = len(by_key) - len(keep)
    return [r for r in phrases if r["record_key"] in keep], [d for d in drops if d["key"] in keep or d["key"] not in by_key], dup


def group(phrases: list[dict], drops: list[dict]) -> dict:
    records = {r["record_key"] for r in phrases}
    hooks = [r for r in phrases if r.get("is_hook")]
    by_section: dict[str, list[float]] = defaultdict(list)
    for r in phrases:
        if r.get("section") and r.get("vocal_share") is not None: by_section[r["section"]].append(r["vocal_share"])
    return {
        "records": len(records), "phrases": len(phrases),
        "leadInBeats": q([d.get("lead_in_beats") for d in drops]),
        "carriesThroughShare": round(sum(1 for d in drops if d.get("carries_through")) / len(drops), 3) if drops else None,
        "hookAnchorToPeakBeats": q([r.get("anchor_to_peak_beats") for r in hooks]),
        "hookBarInSection": q([r.get("bar_in_section") for r in hooks]),
        "hookSections": shares([r.get("section") for r in hooks]),
        "hookPeaks": shares([r.get("peak_label") for r in hooks]),
        "pickupBeats": q([r.get("pickup_beats") for r in phrases]),
        "phraseBeats": q([r.get("dur_beats") for r in phrases]),
        "lineLeadInBeats": q([r.get("lead_in_beats") for r in phrases if r.get("lead_in_beats") is not None and 0 <= r["lead_in_beats"] <= 16]),
        "vocalShareBySection": {k: round(statistics.median(v), 3) for k, v in sorted(by_section.items())},
        "measuredBy": shares([d.get("measured_by") for d in drops]),
    }


def rollup(phrases: list[dict], drops: list[dict], source: str) -> dict:
    phrases, drops, dup = dedupe(phrases, drops)
    pins = {r["record_key"]: (r.get("family") or "unknown", r.get("tempo_band") or "unknown", r.get("archetype") or "unknown") for r in phrases}
    for d in drops: pins.setdefault(d["key"], (d.get("family") or "unknown", d.get("tempo_band") or "unknown", d.get("archetype") or "unknown"))
    buckets: dict[str, tuple[list, list]] = defaultdict(lambda: ([], []))
    for r in phrases:
        f, t, a = pins[r["record_key"]]
        for k in (f"{f}|{t}|{a}", f"{f}|*|*", "*|*|*"): buckets[k][0].append(r)
    for d in drops:
        f, t, a = pins[d["key"]]
        for k in (f"{f}|{t}|{a}", f"{f}|*|*", "*|*|*"): buckets[k][1].append(d)
    groups = {k: group(p, d) for k, (p, d) in sorted(buckets.items())}
    return {"version": 1, "builtAt": time.strftime("%Y-%m-%d"), "source": source, "minRecords": MIN_RECORDS,
            "records": len({r["record_key"] for r in phrases}), "duplicatesDropped": dup, "groups": groups}


def read_rows(path: str) -> tuple[list[dict], list[dict]]:
    phrases, drops = [], []
    for line in open(path):
        if not line.strip(): continue
        r = json.loads(line); t = r.pop("table", "dna_vocal_phrases")
        (drops if t == "dna_vocal_drops" else phrases).append(r)
    return phrases, drops


def read_supabase() -> tuple[list[dict], list[dict]]:
    sys.path.insert(0, os.path.dirname(__file__))
    import requests
    from vocal_backfill import env
    url, key = env(); h = {"apikey": key, "Authorization": f"Bearer {key}"}
    out = []
    for table in ("dna_vocal_phrases", "dna_vocal_drops"):
        r = requests.get(f"{url}/rest/v1/{table}?select=*&limit=100000", headers=h, timeout=60)
        out.append(r.json() if r.ok else [])
    return out[0], [d for d in out[1] if d.get("measured_by")]   # browser rows before 0020 are lane-keyed: left out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows"); ap.add_argument("--supabase", action="store_true")
    ap.add_argument("--out", default=os.path.join(ROOT, "data", "dna", "vocal_drops.json"))
    ap.add_argument("--source", default=None, help="what the rows are, written into the file")
    a = ap.parse_args()
    if a.rows: phrases, drops = read_rows(a.rows); src = a.source or f"rows file {os.path.basename(a.rows)}"
    elif a.supabase: phrases, drops = read_supabase(); src = a.source or "dna_vocal_phrases + dna_vocal_drops"
    else: sys.exit("--rows FILE or --supabase")
    out = rollup(phrases, drops, src)
    with open(a.out, "w") as f: json.dump(out, f, indent=1)
    top = out["groups"].get("*|*|*", {})
    print(f"{out['records']} records ({out['duplicatesDropped']} duplicates dropped), {len(out['groups'])} groups -> {a.out}")
    print(f"all: lead in {top.get('leadInBeats')}, hook sections {top.get('hookSections')}, hook anchor to peak {top.get('hookAnchorToPeakBeats')}")


if __name__ == "__main__":
    main()
