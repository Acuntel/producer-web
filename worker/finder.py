"""The finder: one general search over every public source that answers from a server.
Each source returns candidates in the same shape; the caller ranks and downloads the
best. Sources: Internet Archive (search API), SoundCloud, Mixcloud and hearthis.at
(via yt-dlp search/extractors), Free Music Archive, Jamendo, Freesound (APIs, keys
optional), Bandcamp (direct links). YouTube is not a source: it refuses servers."""
from __future__ import annotations
import json, os, re, subprocess, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict, field
import resolver

UA = "producer-web/1.0 (+https://producer-web-theta.vercel.app)"
TIMEOUT = 12


@dataclass
class Candidate:
    source: str
    title: str
    url: str
    artist: str | None = None
    duration_sec: float | None = None
    year: int | None = None
    license: str | None = None
    kind: str = "track"        # track | mix | sample | album
    score: float = 0.0
    why: list[str] = field(default_factory=list)   # the ranking's reasons, in words
    version: str | None = None                      # the version its title says it is (cover, remix, live) or "original?"


def _get_json(url: str, headers: dict | None = None) -> dict | list | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception:
        return None


def _ytdlp_search(prefix: str, query: str, n: int, source: str, kind: str) -> list[Candidate]:
    """Any yt-dlp search extractor (scsearch, mixcloud) as a flat JSON listing, no download."""
    cmd = ["yt-dlp", "--flat-playlist", "--dump-single-json", "--no-warnings", "--quiet", "--socket-timeout", "10", f"{prefix}{n}:{query}"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=40)
        d = json.loads(r.stdout or "{}")
    except Exception:
        return []
    out = []
    for e in d.get("entries") or []:
        if not e or not e.get("url"): continue
        out.append(Candidate(source=source, title=e.get("title") or "", url=e.get("url") if str(e.get("url")).startswith("http") else e.get("webpage_url") or e.get("url"), artist=e.get("uploader") or e.get("channel"), duration_sec=e.get("duration"), kind=kind))
    return out


def soundcloud(query: str, n: int = 8) -> list[Candidate]:
    return _ytdlp_search("scsearch", query, n, "soundcloud", "track")


def mixcloud(query: str, n: int = 5) -> list[Candidate]:
    # Mixcloud's public search endpoint lists cloudcasts; yt-dlp downloads them.
    d = _get_json(f"https://api.mixcloud.com/search/?type=cloudcast&limit={n}&q={urllib.parse.quote(query)}")
    out = []
    for e in (d or {}).get("data", []) if isinstance(d, dict) else []:
        out.append(Candidate(source="mixcloud", title=e.get("name") or "", url=e.get("url") or "", artist=(e.get("user") or {}).get("name"), duration_sec=e.get("audio_length"), kind="mix"))
    return [c for c in out if c.url]


def archive(query: str, n: int = 8) -> list[Candidate]:
    """Internet Archive advanced search over audio: netlabels, live music, the Great 78 Project."""
    q = urllib.parse.quote(f"({query}) AND mediatype:(audio)")
    d = _get_json(f"https://archive.org/advancedsearch.php?q={q}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&fl[]=licenseurl&fl[]=collection&rows={n}&sort[]=downloads+desc&output=json")
    out = []
    for doc in ((d or {}).get("response") or {}).get("docs", []) if isinstance(d, dict) else []:
        ident = doc.get("identifier"); 
        if not ident: continue
        coll = doc.get("collection") or []
        kind = "sample" if "78rpm" in " ".join(coll if isinstance(coll, list) else [coll]) else "album"
        creator = doc.get("creator"); creator = creator[0] if isinstance(creator, list) else creator
        out.append(Candidate(source="archive", title=doc.get("title") or ident, url=f"https://archive.org/details/{ident}", artist=creator, year=int(doc["year"]) if str(doc.get("year", "")).isdigit() else None, license=doc.get("licenseurl"), kind=kind))
    return out


def archive_first_file(details_url: str) -> str | None:
    """The first downloadable audio file of an archive.org item (yt-dlp handles the item page too, but a direct file is faster)."""
    ident = details_url.rstrip("/").split("/")[-1]
    d = _get_json(f"https://archive.org/metadata/{ident}/files")
    files = (d or {}).get("result", []) if isinstance(d, dict) else []
    pref = [".mp3", ".flac", ".ogg", ".m4a", ".wav"]
    files = [f for f in files if any(str(f.get("name", "")).lower().endswith(x) for x in pref) and not str(f.get("name", "")).endswith("_spectrogram.png")]
    files.sort(key=lambda f: (pref.index(next(x for x in pref if str(f["name"]).lower().endswith(x))), -float(f.get("length") or 0)))
    return f"https://archive.org/download/{ident}/{urllib.parse.quote(files[0]['name'])}" if files else None


def fma(query: str, n: int = 6) -> list[Candidate]:
    key = os.environ.get("FMA_API_KEY")
    if not key: return []
    d = _get_json(f"https://freemusicarchive.org/api/get/tracks.json?api_key={key}&limit={n}&search={urllib.parse.quote(query)}")
    out = []
    for t in (d or {}).get("dataset", []) if isinstance(d, dict) else []:
        out.append(Candidate(source="fma", title=t.get("track_title") or "", url=t.get("track_file_url") or t.get("track_url") or "", artist=t.get("artist_name"), duration_sec=None, license=t.get("license_title"), kind="track"))
    return [c for c in out if c.url]


def jamendo(query: str, n: int = 6) -> list[Candidate]:
    cid = os.environ.get("JAMENDO_CLIENT_ID")
    if not cid: return []
    d = _get_json(f"https://api.jamendo.com/v3.0/tracks/?client_id={cid}&format=json&limit={n}&search={urllib.parse.quote(query)}&audioformat=mp32")
    out = []
    for t in (d or {}).get("results", []) if isinstance(d, dict) else []:
        out.append(Candidate(source="jamendo", title=t.get("name") or "", url=t.get("audio") or "", artist=t.get("artist_name"), duration_sec=t.get("duration"), license=t.get("license_ccurl"), kind="track"))
    return [c for c in out if c.url]


def freesound(query: str, n: int = 6) -> list[Candidate]:
    key = os.environ.get("FREESOUND_API_KEY")
    if not key: return []
    d = _get_json(f"https://freesound.org/apiv2/search/text/?query={urllib.parse.quote(query)}&fields=id,name,username,duration,license,previews&page_size={n}&token={key}")
    out = []
    for s in (d or {}).get("results", []) if isinstance(d, dict) else []:
        prev = (s.get("previews") or {}).get("preview-hq-mp3")
        if prev: out.append(Candidate(source="freesound", title=s.get("name") or "", url=prev, artist=s.get("username"), duration_sec=s.get("duration"), license=s.get("license"), kind="sample"))
    return out


SOURCES = {"soundcloud": soundcloud, "mixcloud": mixcloud, "archive": archive, "fma": fma, "jamendo": jamendo, "freesound": freesound}
def rank(query: str, cands: list[Candidate], want: str | None = None, ask: resolver.Ask | None = None) -> list[Candidate]:
    """Identity first (worker/resolver.py): the uploader is the artist, the duration matches the catalog, and no
    cover, karaoke, remix, live, sped up or nightcore marker the ask did not use. Then the kind and source trust."""
    return resolver.rank(ask or resolver.parse_ask(query), cands, want)


def search(query: str, sources: list[str] | None = None, want: str | None = None, per_source: int = 6, ask: resolver.Ask | None = None) -> list[Candidate]:
    """Every source in parallel, one ranked list. Sources that need a key and have none return nothing."""
    names = [s for s in (sources or list(SOURCES)) if s in SOURCES]
    out: list[Candidate] = []
    with ThreadPoolExecutor(max_workers=len(names) or 1) as ex:
        futs = {ex.submit(SOURCES[n], query, per_source): n for n in names}
        for f in as_completed(futs, timeout=45):
            try: out.extend(f.result())
            except Exception: pass
    seen = set(); uniq = []
    for c in out:
        k = (c.source, c.url)
        if k in seen or not c.url: continue
        seen.add(k); uniq.append(c)
    return rank(query, uniq, want, ask)


def to_json(cands: list[Candidate]) -> list[dict]: return [asdict(c) for c in cands]


if __name__ == "__main__":
    import sys, time
    q = " ".join(sys.argv[1:]) or "john summit where you are"
    t0 = time.time(); res = search(q)
    print(f"{len(res)} candidates in {time.time() - t0:.1f}s")
    for c in res[:12]: print(f"  {c.score:5.2f} {c.source:10} {c.kind:6} {str(c.duration_sec or '?'):>6} | {(c.artist or '')[:22]:22} | {c.title[:60]} | {'; '.join(c.why)}")
