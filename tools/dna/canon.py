"""The dance canon: what DJs actually play, read from their mixes.

For each mix name below, the deployed worker finds the mix (Mixcloud, SoundCloud, the
Internet Archive), identifies the records in it (Shazam, paced under the service's limit),
and the identified entries land in dna_canon with the mix in dna_canon_mixes. Sequential on
purpose: the recognition gate is shared. About five to nine minutes per two hour mix.

  <dna-venv>/bin/python tools/dna/canon.py            # every mix in MIXES not yet crawled
  <dna-venv>/bin/python tools/dna/canon.py "Fisher Essential Mix" ...   # named mixes
"""
from __future__ import annotations

import json, os, re, sys, time, unicodedata, uuid
from pathlib import Path

import psycopg, requests

ROOT = Path(__file__).resolve().parents[2]
OWNER = os.environ.get("CANON_OWNER", "c6b794a6-98cd-4dea-b990-05d2608b0508")   # the account the jobs run under
MIXES: list[tuple[str, str, str]] = [   # (mix name, finder query, dj)
    ("KETTAMA Essential Mix 2022", "kettama essential mix 2022", "KETTAMA"),
    ("John Summit Essential Mix", "john summit essential mix", "John Summit"),
    ("Chris Lake Essential Mix", "chris lake essential mix", "Chris Lake"),
    ("Fisher Essential Mix", "fisher essential mix", "FISHER"),
    ("Dom Dolla Essential Mix", "dom dolla essential mix", "Dom Dolla"),
    ("Interplanetary Criminal Essential Mix", "interplanetary criminal essential mix", "Interplanetary Criminal"),
    ("Sammy Virji Essential Mix", "sammy virji essential mix", "Sammy Virji"),
    ("salute Essential Mix", "salute essential mix", "salute"),
    ("Max Dean Boiler Room", "max dean boiler room", "Max Dean"),
    ("Mochakk Boiler Room", "mochakk boiler room", "Mochakk"),
    # The wider canon: the rooms he wants to move, one set each.
    ("Fred again Boiler Room London", "fred again boiler room london", "Fred again.."),
    ("Skrillex Boiler Room", "skrillex boiler room", "Skrillex"),
    ("Four Tet Essential Mix", "four tet essential mix", "Four Tet"),
    ("Disclosure Essential Mix", "disclosure essential mix", "Disclosure"),
    ("Jamie xx Essential Mix", "jamie xx essential mix", "Jamie xx"),
    ("Bicep Essential Mix", "bicep essential mix", "Bicep"),
    ("Peggy Gou Essential Mix", "peggy gou essential mix", "Peggy Gou"),
    ("Chris Stussy Boiler Room", "chris stussy boiler room", "Chris Stussy"),
    ("Solomun Essential Mix", "solomun essential mix", "Solomun"),
    ("Anyma Essential Mix", "anyma essential mix", "Anyma"),
    ("ARTBAT Essential Mix", "artbat essential mix", "ARTBAT"),
    ("Charlotte de Witte Essential Mix", "charlotte de witte essential mix", "Charlotte de Witte"),
    ("Amelie Lens Essential Mix", "amelie lens essential mix", "Amelie Lens"),
    ("Adam Beyer Essential Mix", "adam beyer essential mix", "Adam Beyer"),
    ("Carl Cox Essential Mix", "carl cox essential mix", "Carl Cox"),
    ("Vintage Culture Essential Mix", "vintage culture essential mix", "Vintage Culture"),
    ("Cloonee Boiler Room", "cloonee boiler room", "Cloonee"),
    ("MK Essential Mix", "mk marc kinchen essential mix", "MK"),
    ("Duke Dumont Essential Mix", "duke dumont essential mix", "Duke Dumont"),
    ("Gorgon City Essential Mix", "gorgon city essential mix", "Gorgon City"),
    ("CamelPhat Essential Mix", "camelphat essential mix", "CamelPhat"),
    ("Franky Wah Essential Mix", "franky wah essential mix", "Franky Wah"),
    ("Hot Since 82 Essential Mix", "hot since 82 essential mix", "Hot Since 82"),
    ("Patrick Topping Essential Mix", "patrick topping essential mix", "Patrick Topping"),
    ("Eats Everything Essential Mix", "eats everything essential mix", "Eats Everything"),
    ("Green Velvet Essential Mix", "green velvet essential mix", "Green Velvet"),
    ("Claptone Essential Mix", "claptone essential mix", "Claptone"),
    ("Purple Disco Machine Essential Mix", "purple disco machine essential mix", "Purple Disco Machine"),
    ("Kaytranada Essential Mix", "kaytranada essential mix", "Kaytranada"),
    ("Honey Dijon Essential Mix", "honey dijon essential mix", "Honey Dijon"),
    ("Mall Grab Essential Mix", "mall grab essential mix", "Mall Grab"),
    ("DJ Seinfeld Essential Mix", "dj seinfeld essential mix", "DJ Seinfeld"),
    ("Overmono Essential Mix", "overmono essential mix", "Overmono"),
    ("Barry Can't Swim Essential Mix", "barry cant swim essential mix", "Barry Can't Swim"),
    ("Conducta Essential Mix", "conducta essential mix", "Conducta"),
    ("Chloe Robinson Boiler Room", "chloe robinson boiler room", "Chloé Robinson"),
    ("DJ ADHD Boiler Room", "dj adhd boiler room", "DJ ADHD"),
    ("Jyoty Boiler Room", "jyoty boiler room", "Jyoty"),
    ("Sherelle Boiler Room", "sherelle boiler room", "SHERELLE"),
    ("Nia Archives Boiler Room", "nia archives boiler room", "Nia Archives"),
]


def env() -> dict:
    out = {}
    for line in (ROOT / ".env.local").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1); out[k.strip()] = v.strip()
    return out


def norm(s: str | None) -> str:
    if not s: return ""
    t = unicodedata.normalize("NFKD", s.lower())
    t = re.sub(r"\b(feat|featuring|ft)\b.*$", "", t).replace("&", "and")
    t = re.sub(r"[^\w ]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def crawl(conn, worker: str, secret: str, name: str, query: str, dj: str) -> int:
    with conn.cursor() as cur:
        cur.execute("select id, entries from public.dna_canon_mixes where name = %s", (name,))
        row = cur.fetchone()
        if row: print(f"[canon] {name}: already crawled ({row[1]} entries)"); return 0
    job_id = str(uuid.uuid4())
    with conn.cursor() as cur:
        cur.execute("insert into public.jobs (id, owner, kind, source, status) values (%s, %s, 'tracklist', %s, 'queued')", (job_id, OWNER, json.dumps({"query": query, "name": name})))
    conn.commit()
    r = requests.post(f"{worker.rstrip('/')}/jobs", json={"job_id": job_id, "owner": OWNER, "kind": "tracklist", "source": {"query": query, "name": name}}, headers={"X-Worker-Secret": secret}, timeout=30)
    if not r.ok: print(f"[canon] {name}: worker refused ({r.status_code} {r.text[:120]})"); return 0
    t0 = time.time(); status, result, error = "queued", None, None
    while time.time() - t0 < 25 * 60:
        time.sleep(15)
        with conn.cursor() as cur:
            cur.execute("select status, result, error from public.jobs where id = %s", (job_id,))
            status, result, error = cur.fetchone()
        n = len((result or {}).get("tracklist") or [])
        print(f"[canon] {name}: {status} {int(time.time() - t0)}s {n} entries", flush=True)
        if status in ("done", "error"): break
    entries = (result or {}).get("tracklist") or []
    if status == "error" or not entries:
        print(f"[canon] {name}: {status} {error or ''} ({len(entries)} entries)")
        return 0
    with conn.cursor() as cur:
        cur.execute("insert into public.dna_canon_mixes (name, dj, query, source_url, duration_sec, covered_sec, entries, job_id) values (%s,%s,%s,%s,%s,%s,%s,%s) returning id",
                    (name, dj, query, (result or {}).get("sourceUrl"), (result or {}).get("durationSec"), (result or {}).get("coveredSec"), len(entries), job_id))
        mix_id = cur.fetchone()[0]
        for e in entries:
            year = e.get("year"); year = int(year) if str(year or "").isdigit() else None
            cur.execute("insert into public.dna_canon (mix_id, mix_name, dj, position_sec, artist, title, artist_norm, title_norm, year, label, isrc, pitch_pct, hits, raw) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                        (mix_id, name, dj, e.get("offsetSec") or e.get("start"), e.get("artist"), e.get("title"), norm(e.get("artist")), norm(e.get("title")), year, e.get("label"), e.get("isrc"), e.get("pitchPct"), e.get("hits"), json.dumps(e)))
        # The job row served its purpose; the account's job list stays clean.
        cur.execute("delete from public.jobs where id = %s", (job_id,))
    conn.commit()
    print(f"[canon] {name}: {len(entries)} records, {int(time.time() - t0)}s")
    return len(entries)


def main() -> None:
    e = env()
    worker, secret = e.get("STEMS_WORKER_URL", ""), e.get("STEMS_WORKER_SECRET", "")
    dsn = (ROOT / "data/dna/PG_DSN").read_text().strip()
    if not (worker and secret and dsn): sys.exit("missing STEMS_WORKER_URL, STEMS_WORKER_SECRET or data/dna/PG_DSN")
    wanted = set(sys.argv[1:])
    total = 0
    with psycopg.connect(dsn, connect_timeout=15) as conn:
        for name, query, dj in MIXES:
            if wanted and name not in wanted: continue
            try: total += crawl(conn, worker, secret, name, query, dj)
            except Exception as ex:
                conn.rollback(); print(f"[canon] {name}: failed: {ex}")
        with conn.cursor() as cur:
            cur.execute("select count(*), count(distinct artist_norm), count(distinct mix_name) from public.dna_canon")
            n, a, m = cur.fetchone()
    print(f"[canon] done: +{total} this run; canon holds {n} records by {a} artists across {m} mixes")


if __name__ == "__main__":
    main()
