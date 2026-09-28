"""Backfill the vocal placement rows from the records the studio heard before the worker made vocal maps: the
dna_heard rows, whose stored hearing carries the Whisper lyric lines (a start time each) and the vocal share of
every 8-bar block. No audio is fetched: each line becomes a phrase (it ends at the next line or after about 0.4 s a
word), the blocks become sections by the worker's own rules (worker/sections.py label_groups, with the drums and
bass share as the low end), and the rows come out of worker/vocalrows.py exactly as a live job writes them, marked
measured_by "backfill". Coarser than a vocal map (no word times, no stressed syllable), and said so on every row.

    python tools/dna/vocal_backfill.py --dry-run [--out rows.jsonl]     # reads dna_heard, writes nothing to the DB
    python tools/dna/vocal_backfill.py --write                          # Brady's call, after migration 0020 is applied

Reads NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY from the environment or .env.local."""
from __future__ import annotations
import argparse, json, os, sys
import requests

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(ROOT, "worker"))
import lyrics, sections, vocalrows  # noqa: E402


def env() -> tuple[str, str]:
    vals = dict(os.environ)
    path = os.path.join(ROOT, ".env.local")
    if not os.path.exists(path): path = os.path.expanduser("~/dev/producer-web/.env.local")
    if os.path.exists(path):
        for line in open(path):
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.rstrip("\n").split("=", 1); vals.setdefault(k.strip(), v.strip().strip('"'))
    return (vals.get("SUPABASE_URL") or vals.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/"), vals.get("SUPABASE_SERVICE_ROLE_KEY", "")


def vmap_of(row: dict) -> dict | None:
    """A coarse vocal map from one dna_heard row, or None when it has no tempo or no lines."""
    h = row.get("hearing") or {}; lines = ((h.get("lyrics") or {}).get("lines")) or []
    tempo = row.get("tempo"); blocks = h.get("blocks") or []
    if not tempo or not lines or not blocks: return None
    beat = 60.0 / float(tempo); bar = 4 * beat
    energy = [float(b.get("level") or 0.0) for b in blocks]
    low_raw = [float((b.get("shares") or {}).get("bass", 0.0)) + float((b.get("shares") or {}).get("drums", 0.0)) for b in blocks]
    top = max(low_raw) or 1.0; low = [x / top for x in low_raw]
    labels = sections.label_groups(energy, low)
    secs = []
    for i, (b, lab) in enumerate(zip(blocks, labels)):
        a_bar = int(b.get("bar", i * 8)); start = float(b.get("at", a_bar * bar))
        if secs and secs[-1]["label"] == lab:
            secs[-1]["endBar"] = a_bar + 8; secs[-1]["end"] = round(start + 8 * bar, 3); continue
        secs.append({"label": lab, "startBar": a_bar, "endBar": a_bar + 8, "start": round(start, 3), "end": round(start + 8 * bar, 3), "energy": energy[i], "low": round(low[i], 3)})
    texts = [lyrics.norm(l.get("text", "")) for l in lines]
    phrases = []
    for i, l in enumerate(lines):
        at = float(l["at"]); nxt = float(lines[i + 1]["at"]) if i + 1 < len(lines) else at + 30
        end = min(nxt - 0.2, at + 0.4 * max(1, len(texts[i])) + 0.4)
        rep = 1 + sum(1 for j, t in enumerate(texts) if j != i and len(t) >= 2 and len(texts[i]) >= 2 and lyrics.line_similarity(texts[i], t) >= 0.6)
        sec = next((s for s in secs if s["start"] <= at < s["end"]), None)
        phrases.append({"id": i, "start": at, "end": round(max(at + 0.3, end), 3), "stressOnset": at, "section": sec["label"] if sec else None,
                        "repeats": rep, "hookScore": None, "sourceBar": int(at // bar), "sourceBeat": round((at % bar) / beat, 3), "pickupBeats": None,
                        "keyRelToSource": None, "inKey": None, "energy": sec["energy"] if sec else 0.5})
    top_rep = max(p["repeats"] for p in phrases)
    for p in phrases:
        p["hookScore"] = round(0.7 * ((p["repeats"] - 1) / max(1, top_rep - 1)) + 0.3 * p.pop("energy"), 3)
    hook = max(phrases, key=lambda p: (p["hookScore"], -p["start"]))["id"]
    return {"version": 1, "source": {"bpm": float(tempo), "beatSec": beat}, "sections": secs, "phrases": phrases, "hook": hook}


def rows_for(row: dict) -> tuple[list[dict], dict | None]:
    vm = vmap_of(row)
    if not vm: return [], None
    ident = {"artist": row.get("artist"), "title": row.get("title")}
    phrase_rows = vocalrows.phrase_rows(vm, row["key"], row.get("family"))
    drop = vocalrows.drop_row(vm, row["key"], row.get("family"), None, row.get("title"), ident)
    if drop: drop["measured_by"] = "backfill"
    return phrase_rows, drop


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="read and print; write nothing to the database (the default)")
    ap.add_argument("--write", action="store_true", help="upsert the rows (after migration 0020 is applied; Brady's call)")
    ap.add_argument("--out", help="also write the rows as JSON lines here (for tools/dna/vocal_drops.py --rows)")
    a = ap.parse_args()
    url, key = env()
    if not url or not key: sys.exit("no Supabase URL or service key in the environment or .env.local")
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    r = requests.get(f"{url}/rest/v1/dna_heard?select=key,title,artist,tempo,bars,family,hearing&limit=1000", headers=h, timeout=60)
    r.raise_for_status()
    heard = r.json(); phrases, drops, skipped = [], [], []
    for row in heard:
        pr, dr = rows_for(row)
        if not pr: skipped.append(row.get("title") or row["key"]); continue
        phrases += pr
        if dr: drops.append(dr)
        print(f"{row.get('artist')} - {row.get('title')}: {len(pr)} phrase rows, family {pr[0]['family']}, {pr[0]['tempo_band']}, {pr[0]['archetype']}, "
              f"lead in {dr['lead_in_beats'] if dr else None} beats", flush=True)
    print(f"dna_heard rows: {len(heard)}; with lines: {len(heard) - len(skipped)}; phrase rows: {len(phrases)}; lead-in rows: {len(drops)}; skipped (no lines or no tempo): {skipped}")
    if a.out:
        with open(a.out, "w") as f:
            for x in phrases: f.write(json.dumps({"table": "dna_vocal_phrases", **x}) + "\n")
            for x in drops: f.write(json.dumps({"table": "dna_vocal_drops", **x}) + "\n")
    if a.write and not a.dry_run:
        for table, rows, on in (("dna_vocal_phrases", phrases, "record_key,phrase"), ("dna_vocal_drops", drops, "key")):
            if not rows: continue
            keys = sorted({k for x in rows for k in x}); body = [{k: x.get(k) for k in keys} for x in rows]
            w = requests.post(f"{url}/rest/v1/{table}?on_conflict={on}", headers={**h, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"}, data=json.dumps(body), timeout=60)
            print(table, w.status_code, w.text[:200])
    else:
        print("dry run: nothing was written to the database")


if __name__ == "__main__":
    main()
