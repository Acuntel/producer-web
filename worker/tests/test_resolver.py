"""The resolver on fixture listings: identity-first ranking, and the check of Shazam's name against the ask."""
import json, os
import pytest
import finder, resolver

FIX = json.load(open(os.path.join(os.path.dirname(__file__), "fixtures", "listings.json")))


def cands(rows):
    return [finder.Candidate(**{"kind": "track", **r}) for r in rows]


@pytest.mark.parametrize("case", FIX["cases"], ids=[c["ask"]["query"] for c in FIX["cases"]])
def test_rank_puts_the_original_first(case):
    a = case["ask"]
    ask = resolver.parse_ask(a["query"], duration_sec=a.get("duration_sec"))
    ranked = finder.rank(a["query"], cands(case["candidates"]), None, ask)
    assert ranked[0].url == case["expect_top_url"], [(c.score, c.title, c.why) for c in ranked]
    assert ranked[0].why, "every pick says why"


def test_parse_ask_reads_artist_and_title():
    assert (resolver.parse_ask("Neil Diamond - Sweet Caroline").artist, resolver.parse_ask("Neil Diamond - Sweet Caroline").title) == ("Neil Diamond", "Sweet Caroline")
    a = resolver.parse_ask("sweet caroline by neil diamond")
    assert (a.artist, a.title) == ("neil diamond", "sweet caroline")
    b = resolver.parse_ask("sweet caroline")
    assert b.artist is None and b.title is None and b.query == "sweet caroline"


def test_uploader_is_the_artist_across_channel_spellings():
    for up in ("Neil Diamond", "NeilDiamondVEVO", "Neil Diamond - Topic", "neil diamond official"):
        assert resolver.uploader_is("Neil Diamond", up), up
    assert resolver.uploader_is("John Summit & Hayla", "John Summit")
    assert not resolver.uploader_is("Neil Diamond", "Karaoke Hits Band")


def test_live_as_a_title_word_is_not_a_live_version():
    ask = resolver.parse_ask("Oasis - Live Forever")
    assert "live" not in resolver.markers_in("Live Forever", ask)
    assert "live" in resolver.markers_in("Wonderwall (Live at Knebworth)", resolver.parse_ask("Oasis - Wonderwall"))


def ident(title, artist, album=None):
    return {"key": "1", "title": title, "artist": artist, "album": album, "confident": True}


ASK = resolver.parse_ask("Neil Diamond - Sweet Caroline")


def test_verify_accepts_the_original_and_its_release_suffixes():
    assert resolver.verify(ASK, ident("Sweet Caroline", "Neil Diamond")).version == "original"
    assert resolver.verify(ASK, ident("Sweet Caroline - Single Version", "Neil Diamond")).ok
    assert resolver.verify(resolver.parse_ask("john summit where you are"), ident("Where You Are", "John Summit & Hayla")).ok


@pytest.mark.parametrize("heard,version", [
    (ident("Sweet Caroline", "Glee Cast"), "cover"),
    (ident("Sweet Caroline (Karaoke Version)", "Sing King"), "cover"),
    (ident("Sweet Caroline (Live)", "Neil Diamond"), "live"),
    (ident("Sweet Caroline (DJ Ötzi Remix)", "Neil Diamond"), "remix"),
    (ident("Cracklin' Rosie", "Neil Diamond"), "unverified"),
    (None, "unverified"),
])
def test_verify_labels_everything_that_is_not_the_original(heard, version):
    v = resolver.verify(ASK, heard)
    assert v.version == version
    assert v.message and "—" not in v.message and "–" not in v.message
    assert v.message.endswith("?")


def test_the_zedd_remix_precedent_is_a_remix():
    v = resolver.verify(resolver.parse_ask("john summit where you are"), ident("Where You Are (Zedd Remix)", "John Summit, Hayla & Zedd"))
    assert v.version == "remix", v


def test_an_asked_remix_is_the_right_version():
    ask = resolver.parse_ask("Adele - Someone Like You remix")
    assert resolver.verify(ask, ident("Someone Like You (DJ Y Remix)", "Adele")).version in ("original",)
