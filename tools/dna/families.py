"""Fold source genre tags into one of twelve families, and derive a studio lane
from family + tempo. Keyword map is intentionally simple substring matching,
first family to match a tag wins; the song's family is the mode across its tags.
"""
from __future__ import annotations

from collections import Counter

FAMILIES = ["pop", "rock", "hiphop", "rnb", "country", "electronic", "latin",
            "jazz", "classical", "folk", "metal", "world", "other"]

# Checked in this order; first substring hit on a tag assigns that tag's family.
# Order matters where genres overlap (e.g. "garage" -> electronic before rock,
# "punk" -> rock before metal).
KEYWORDS: list[tuple[str, list[str]]] = [
    ("electronic", ["house", "techno", "edm", "trance", "garage", "dnb",
                     "drum-and-bass", "drum and bass", "dubstep", "disco",
                     "electro", "idm", "hardstyle", "breakbeat", "club",
                     "j-dance", "dance"]),
    ("hiphop", ["hip-hop", "hiphop", "hip hop", "rap", "trap", "grime"]),
    ("rnb", ["r-n-b", "rnb", "r&b", "soul", "funk", "motown"]),
    ("country", ["country", "honky-tonk", "honky tonk", "bluegrass", "americana"]),
    ("latin", ["latin", "latino", "reggaeton", "salsa", "samba", "sertanejo",
               "tango", "mpb", "pagode", "forro", "brazil", "bachata", "cumbia",
               "spanish", "mambo"]),
    ("jazz", ["jazz", "bossa", "blues"]),
    ("classical", ["classical", "opera", "orchestra"]),
    ("folk", ["folk", "singer-songwriter", "songwriter", "acoustic"]),
    ("metal", ["metal", "metalcore", "grindcore", "hardcore", "industrial", "goth"]),
    ("rock", ["rock", "alt-rock", "indie", "grunge", "punk", "emo",
              "psych-rock", "power-pop", "rockabilly"]),
    ("pop", ["pop", "k-pop", "j-pop", "mandopop", "cantopop", "synth-pop",
             "indie-pop", "teen pop"]),
    ("world", ["world-music", "world music", "reggae", "dancehall", "ska",
               "afrobeat", "indian", "iranian", "turkish", "malay", "j-idol",
               "anime", "bollywood"]),
]


def tag_family(tag: str) -> str | None:
    t = (tag or "").strip().lower()
    if not t:
        return None
    for family, keys in KEYWORDS:
        for k in keys:
            if k and k in t:
                return family
    return None


def family_from_genres(genres: list[str] | None) -> str | None:
    """Majority-vote family across a song's genre tags. None if no tag matches."""
    if not genres:
        return None
    votes = Counter()
    for g in genres:
        fam = tag_family(g)
        if fam:
            votes[fam] += 1
    if not votes:
        return None
    return votes.most_common(1)[0][0]


# tempo bands for electronic sub-lanes: (lane, lo, hi) checked in order
_ELECTRONIC_LANES = [
    ("tech-house", 120, 131),
    ("hard-house", 136, 148),
    ("melodic", 110, 119),
    ("dnb", 160, 180),
]

# families that get a flat, tempo-independent generic lane
_GENERIC_LANE_FAMILIES = {"rnb", "country", "latin", "jazz", "classical",
                           "folk", "metal", "world"}


def derive_lane(family: str | None, tempo: float | None) -> str | None:
    """Studio lane from family + tempo, per docs/DNA_SPEC.md section 2.
    electronic: tempo picks tech-house/hard-house/melodic/dnb, else null (can't
    tell without tempo). hiphop -> trap/hiphop always. pop -> pop, rock -> rock.
    rnb/country/latin/jazz/classical/folk/metal/world -> generic "other" lane.
    family unknown, or "other" -> null.
    """
    if family == "electronic":
        if tempo is None:
            return None
        for lane, lo, hi in _ELECTRONIC_LANES:
            if lo <= tempo <= hi:
                return lane
        return None
    if family == "hiphop":
        return "trap/hiphop"
    if family == "pop":
        return "pop"
    if family == "rock":
        return "rock"
    if family in _GENERIC_LANE_FAMILIES:
        return "other"
    return None
