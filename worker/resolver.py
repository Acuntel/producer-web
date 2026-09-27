"""The resolver: who the ask names, which candidate is that record, and whether the file we downloaded is it.

Identity first. An ask is an artist, a title and (when the DNA store knows it) the catalog duration. Every
candidate is ranked against that identity: the uploader is the artist, the duration sits within 3 s of the
catalog, and the title carries no cover, karaoke, remix, live, sped up or nightcore marker the ask did not
use. After the download, Shazam's name for the audio is checked against the ask, and anything that is not
the original is labelled (cover, remix, live, unverified) with one spoken line, never used silently."""
from __future__ import annotations
import re, unicodedata
from dataclasses import dataclass, field

DURATION_TOLERANCE_SEC = 3.0

# Words that mark a version other than the original, by the version they mark. Each counts only when the ask
# itself does not use it ("X remix" asks for a remix). Multi-word phrases are matched as phrases.
VERSION_MARKERS: dict[str, list[str]] = {
    "cover": ["cover", "covered by", "karaoke", "tribute", "in the style of", "made famous by", "originally performed",
              "originally by", "piano version", "acoustic version", "sing along", "backing track", "instrumental version"],
    "remix": ["remix", "rmx", "bootleg", "rework", "re edit", "reedit", "vip", "mashup", "mash up", "flip", "sped up",
              "speed up", "nightcore", "slowed", "8d audio", "daycore", "hardstyle edit", "techno edit"],
    "live": ["live at", "live from", "live in", "live on", "live version", "live session", "live performance",
             "unplugged", "in concert", "concert", "live"],
}
# How hard each marker class pulls a candidate down in the ranking.
PENALTY = {"cover": 2.0, "remix": 1.6, "live": 1.4}
KARAOKE_EXTRA = 1.0   # karaoke and backing tracks usually have no voice at all: the worst pick for a vocal ask
# Parts of an uploader's name that do not change who it is.
UPLOADER_NOISE = re.compile(r"\b(official|music|records|recordings|vevo|topic|channel|tv|band|the)\b")
FEAT = re.compile(r"\s*[\(\[]?\s*\b(feat|ft|featuring|with)\b\.?\s.*$", re.I)
BRACKETS = re.compile(r"[\(\[][^\)\]]*[\)\]]")
TITLE_SUFFIX = re.compile(r"\s+-\s+(remaster(ed)?|\d{4} remaster|mono|stereo|single version|radio edit|original mix|extended mix|official (audio|video|music video)|lyrics?|audio)\b.*$", re.I)


@dataclass
class Ask:
    query: str
    artist: str | None = None
    title: str | None = None
    duration_sec: float | None = None


@dataclass
class Verdict:
    version: str                     # original | cover | remix | live | unverified
    message: str | None              # the one line the producer says when it is not the original
    reasons: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool: return self.version == "original"


def norm(s: str | None) -> str:
    """Lower case, accents folded, '&' as 'and', punctuation to spaces, one space between words."""
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode("ascii").lower()
    s = s.replace("&", " and ").replace("'", "")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()


def tokens(s: str | None) -> set[str]: return set(norm(s).split())


def parse_ask(query: str, artist: str | None = None, title: str | None = None, duration_sec: float | None = None) -> Ask:
    """The identity in an ask. A caller that resolved it from the DNA store passes artist, title and duration;
    otherwise "Artist - Title" and "Title by Artist" are read off the query, and anything else stays a query."""
    q = re.sub(r"\s+", " ", (query or "").strip())
    if not artist and not title:
        m = re.match(r"^(.+?)\s+[-–—]\s+(.+)$", q)
        if m: artist, title = m.group(1), m.group(2)
        else:
            m = re.match(r"^(.+?)\s+by\s+(.+)$", q, re.I)
            if m: title, artist = m.group(1), m.group(2)
    return Ask(query=q or f"{artist or ''} {title or ''}".strip(), artist=(artist or None), title=(title or None), duration_sec=duration_sec)


def markers_in(text: str, ask: Ask) -> dict[str, list[str]]:
    """The version markers a title carries that the ask did not ask for."""
    t = f" {norm(text)} "; a = f" {norm(ask.query)} {norm(ask.title)} "
    found: dict[str, list[str]] = {}
    for version, words in VERSION_MARKERS.items():
        for w in words:
            p = f" {w} "
            if p in t and p not in a: found.setdefault(version, []).append(w)
    # A bare "live" is also a word in titles ("Live Your Life"): it counts only in brackets or after a dash.
    if found.get("live") == ["live"] and not re.search(r"([\(\[]\s*live\b|\s-\s*live\b|\blive\s*[\)\]]|\blive\s*$)", text or "", re.I):
        found.pop("live")
    return found


def core_title(title: str | None) -> str:
    """The title without its brackets, features and release suffixes: what a cover and the original share."""
    t = TITLE_SUFFIX.sub("", title or ""); t = BRACKETS.sub(" ", t); t = FEAT.sub("", t)
    return norm(t)


def uploader_is(artist: str | None, uploader: str | None) -> bool:
    """The uploader is the artist: 'Neil Diamond', 'NeilDiamondVEVO', 'Neil Diamond - Topic' all count."""
    a = norm(artist); u = norm(uploader)
    if not a or not u: return False
    a2 = UPLOADER_NOISE.sub(" ", a).split(); u2 = UPLOADER_NOISE.sub(" ", u).split()
    if not a2 or not u2: return False
    if " ".join(a2) == " ".join(u2) or "".join(a2) == _strip_tail("".join(u2)): return True
    # One of several credited artists ("John Summit & Hayla" asked, "John Summit" uploads it).
    main = [p for p in re.split(r"\band\b|\bx\b|,|\bvs\b", a) if p.strip()]
    return any(UPLOADER_NOISE.sub(" ", p).split() == u2 or "".join(UPLOADER_NOISE.sub(" ", p).split()) == "".join(u2) for p in main)


def _strip_tail(joined: str) -> str:
    """'neildiamondvevo' -> 'neildiamond': channel suffixes glued onto the name."""
    for _ in range(3):
        m = re.search(r"(official|music|records|vevo|topic|tv)$", joined)
        if not m or m.start() == 0: break
        joined = joined[: m.start()]
    return joined


def score(ask: Ask, c) -> tuple[float, list[str]]:
    """One candidate against the ask: the number and the reasons, in words."""
    why: list[str] = []
    want = tokens(ask.title) if ask.title else tokens(ask.query)
    have = tokens(f"{c.artist or ''} {c.title}")
    overlap = len(want & have) / max(1, len(want))
    s = overlap * 3.0; why.append(f"title words {overlap:.0%}")
    if ask.artist:
        if uploader_is(ask.artist, c.artist): s += 2.0; why.append("uploader is the artist")
        elif tokens(ask.artist) <= tokens(c.title): s += 0.5; why.append("artist named in the title")
        else: s -= 0.5; why.append("artist not named")
    if c.source == "soundcloud" and c.duration_sec is not None and 29.0 <= float(c.duration_sec) <= 31.0:
        # A label's upload served as a 30 s preview: the record is behind a subscription and never downloads whole.
        s -= 3.0; why.append("a 30 s preview, not the whole record")
    elif ask.duration_sec and c.duration_sec:
        d = abs(float(c.duration_sec) - float(ask.duration_sec))
        if d <= DURATION_TOLERANCE_SEC: s += 1.5; why.append(f"duration within {d:.1f} s of the catalog")
        elif d <= 12: s += 0.2; why.append(f"duration {d:.0f} s off")
        else: s -= 1.2; why.append(f"duration {d:.0f} s off the catalog")
    elif c.duration_sec is not None and not (45 <= float(c.duration_sec) <= 900):
        s -= 0.8; why.append("duration outside a record's length")
    for version, words in markers_in(c.title, ask).items():
        pen = PENALTY[version] + (KARAOKE_EXTRA if any(w in ("karaoke", "backing track", "sing along") for w in words) else 0.0)
        s -= pen; why.append(f"{version} ({', '.join(words)})")
    # An ask that names a version ("X remix", "X live") wants that version, not the original.
    for version in asked_versions(ask):
        if any(f" {w} " in f" {norm(c.title)} " for w in VERSION_MARKERS[version]): s += 1.5; why.append(f"the {version} that was asked for")
        else: s -= 1.0; why.append(f"not the {version} that was asked for")
    return s, why


def asked_versions(ask: Ask) -> list[str]:
    a = f" {norm(ask.query)} {norm(ask.title)} "
    return [v for v, words in VERSION_MARKERS.items() if any(f" {w} " in a for w in words if w != "live") or (v == "live" and re.search(r"\blive (at|from|in|version)\b|\(live", ask.query or "", re.I))]


def rank(ask: Ask, cands: list, want: str | None = None) -> list:
    """Candidates best first against the identity; ties go to the source that most often holds originals."""
    trust = {"soundcloud": 1.0, "archive": 0.9, "mixcloud": 0.85, "jamendo": 0.8, "fma": 0.8, "freesound": 0.7}
    for c in cands:
        s, why = score(ask, c)
        s += trust.get(c.source, 0.5) * 0.5
        if want and c.kind == want: s *= 1.15; why.append(f"is a {want}")
        c.score = round(s, 3); c.why = why
        c.version = next(iter(markers_in(c.title, ask)), None) or "original?"
    return sorted(cands, key=lambda c: -c.score)


def _title_matches(ask: Ask, ident_title: str) -> bool:
    want = core_title(ask.title) if ask.title else norm(ask.query)
    got = core_title(ident_title)
    if not want or not got: return False
    wt, gt = set(want.split()), set(got.split())
    if ask.title: return len(wt & gt) / max(1, len(wt)) >= 0.6 and len(wt & gt) / max(1, len(gt)) >= 0.5
    # A bare query ("sweet caroline", "neil diamond sweet caroline"): the heard title must sit inside it.
    return len(gt & wt) / max(1, len(gt)) >= 0.75


def _artist_matches(ask_artist: str, ident_artist: str | None) -> bool:
    a, b = tokens(ask_artist), tokens(ident_artist)
    if not a or not b: return False
    return len(a & b) / max(1, len(a)) >= 0.5 or uploader_is(ask_artist, ident_artist)


def verify(ask: Ask, ident: dict | None) -> Verdict:
    """Shazam's name for the downloaded audio against the ask. Only a match is the original."""
    name = ask.title or ask.query
    offer = "Want it, or play the original in a tab and I'll capture it?"
    if not ident or not ident.get("title"):
        return Verdict("unverified", f"I could not confirm that this is {name}. Want it anyway, or play the original in a tab and I'll capture it?", ["the sound was not recognised"])
    heard = f"{ident.get('artist') or ''} - {ident['title']}".strip(" -")
    if not _title_matches(ask, ident["title"]):
        return Verdict("unverified", f"What I found is {heard}, not {name}. Want it anyway, or play the original in a tab and I'll capture it?", [f"heard title {ident['title']!r}"])
    found = markers_in(f"{ident['title']} {ident.get('album') or ''}", ask)
    if "cover" in found: return Verdict("cover", f"I found a cover of {name}, not the original. {offer}", [f"heard {heard}"])
    if "remix" in found: return Verdict("remix", f"I found a remix of {name}, not the original. {offer}", [f"heard {heard}"])
    if "live" in found: return Verdict("live", f"I found a live version of {name}, not the original. {offer}", [f"heard {heard}"])
    if ask.artist and not _artist_matches(ask.artist, ident.get("artist")):
        by = f" by {ident['artist']}" if ident.get("artist") else ""
        return Verdict("cover", f"I found a cover of {name}{by}, not the original. {offer}", [f"heard {heard}, asked {ask.artist}"])
    return Verdict("original", None, [f"heard {heard}"])
