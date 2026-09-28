"""The resolver battery: 20 famous records by name, searched and ranked, never downloaded.

For each name it prints the top pick and why (uploader, duration against the catalog, version markers), and
what the worker would do with it: take it as the likely original, or say one honest line after Shazam names
a cover, remix or live copy. The catalog duration comes from the DNA store's Spotify table when it is on
disk (data/dna/raw/spotify.csv, read only). Search only: no audio is fetched, so no record is copied.

    python tools/voice/battery.py            # all 20
    python tools/voice/battery.py 5 --json   # the first 5, as JSON
"""
from __future__ import annotations
import csv, json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(ROOT, "worker"))
import finder, resolver  # noqa: E402

NAMES = [
    ("Neil Diamond", "Sweet Caroline"), ("Queen", "Bohemian Rhapsody"), ("Michael Jackson", "Billie Jean"),
    ("Adele", "Rolling in the Deep"), ("Daft Punk", "One More Time"), ("Avicii", "Levels"), ("Calvin Harris", "Summer"),
    ("Rihanna", "Umbrella"), ("Beyonce", "Crazy in Love"), ("Whitney Houston", "I Wanna Dance with Somebody"),
    ("ABBA", "Dancing Queen"), ("Journey", "Don't Stop Believin'"), ("The Weeknd", "Blinding Lights"), ("Dua Lipa", "Levitating"),
    ("Ed Sheeran", "Shape of You"), ("Mark Ronson", "Uptown Funk"), ("Pharrell Williams", "Happy"),
    ("Swedish House Mafia", "Don't You Worry Child"), ("John Summit", "Where You Are"), ("Robin S", "Show Me Love"),
]


def catalog_durations() -> dict[tuple[str, str], float]:
    """(artist, title) normalized -> seconds, from the store's Spotify table if it is on this machine."""
    for p in (os.path.join(ROOT, "data/dna/raw/spotify.csv"), os.path.expanduser("~/dev/producer-web/data/dna/raw/spotify.csv")):
        if not os.path.exists(p): continue
        want = {(resolver.norm(a), resolver.norm(t)) for a, t in NAMES}
        out: dict[tuple[str, str], float] = {}
        with open(p, newline="") as f:
            for r in csv.DictReader(f):
                t = resolver.norm(r.get("track_name"))
                for a in (r.get("artists") or "").split(";"):
                    k = (resolver.norm(a), t)
                    if k in want and k not in out: out[k] = int(r["duration_ms"]) / 1000.0
        return out
    return {}


def main() -> None:
    n = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else len(NAMES)
    as_json = "--json" in sys.argv
    durs = catalog_durations()
    rows = []
    for artist, title in NAMES[:n]:
        dur = durs.get((resolver.norm(artist), resolver.norm(title)))
        ask = resolver.parse_ask(f"{artist} - {title}", duration_sec=dur)
        t0 = time.time()
        ranked = finder.search(ask.query, None, None, ask=ask)
        top = ranked[0] if ranked else None
        if not top: verdict = "nothing found: the worker says it could not find a copy and offers capture or upload"
        elif any("30 s preview" in w for w in top.why): verdict = "only a 30 s preview exists on the sources: the worker says so and offers capture or upload"
        elif top.version and top.version != "original?": verdict = f"top pick is marked {top.version}: after Shazam the worker would refuse in one line"
        elif any(w.startswith("uploader is the artist") for w in top.why): verdict = "likely the original (the artist uploaded it)"
        else: verdict = "unverified until Shazam names it: taken only if the name matches"
        rows.append({"ask": f"{artist} - {title}", "catalogSec": dur, "candidates": len(ranked), "searchSec": round(time.time() - t0, 1),
                     "top": None if not top else {"source": top.source, "uploader": top.artist, "title": top.title, "durationSec": top.duration_sec, "score": top.score, "why": top.why, "url": top.url},
                     "verdict": verdict})
        if not as_json:
            r = rows[-1]
            print(f"{r['ask']}  (catalog {dur or '?'} s, {r['candidates']} candidates, {r['searchSec']} s)")
            if top: print(f"   top: {top.score:5.2f} {top.source} | {top.artist} | {top.title} | {top.duration_sec or '?'} s\n   why: {'; '.join(top.why)}")
            print(f"   -> {verdict}")
    if as_json: print(json.dumps(rows, indent=1))
    else:
        likely = sum(1 for r in rows if r["verdict"].startswith("likely"))
        refuse = sum(1 for r in rows if "refuse" in r["verdict"]); none = sum(1 for r in rows if r["verdict"].startswith("nothing") or "preview" in r["verdict"])
        print(f"\nbattery: {len(rows)} names; top pick uploaded by the artist {likely}; top pick marked as another version {refuse}; nothing whole found {none}; unverified until Shazam {len(rows) - likely - refuse - none}")


if __name__ == "__main__":
    main()
