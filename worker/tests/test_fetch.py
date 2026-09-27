"""The verify loop: each download is named by Shazam and only the original is accepted, with no network."""
import os
import pytest
import fetch, finder, identify, resolver
from models import Job, Source


class FakeWorld:
    """Search results, what each URL 'downloads' as, and what Shazam calls it."""
    def __init__(self, monkeypatch, tmp_path, listing: list[tuple[str, str, str]]):
        self.downloads = []
        cands = [finder.Candidate(source="soundcloud", title=t, url=u, artist=a, duration_sec=200) for u, a, t in listing]
        names = {u: {"key": u, "title": t.split(" |")[0], "artist": a, "confident": True} for u, a, t in listing}
        monkeypatch.setattr(finder, "search", lambda q, s=None, w=None, per_source=6, ask=None: resolver.rank(ask or resolver.parse_ask(q), list(cands)))
        def dl(target, tmp, max_seconds):
            self.downloads.append(target)
            p = os.path.join(tmp, "dl.mp3"); open(p, "wb").write(b"x"); return p, "title", ""
        monkeypatch.setattr(fetch, "_download", dl)
        def to_wav(raw, tmp, max_seconds, mono16):
            wav = os.path.join(tmp, "src.wav"); os.replace(raw, wav); open(wav + ".url", "w").write(self.downloads[-1]); return wav
        monkeypatch.setattr(fetch, "_to_wav", to_wav)
        monkeypatch.setattr(identify, "identify_file", lambda wav, *a, **k: names.get(open(wav + ".url").read()))


def job(**src):
    return Job(job_id="j1", owner="u1", source=Source(**src))


def test_a_cover_first_is_skipped_for_the_original(monkeypatch, tmp_path):
    w = FakeWorld(monkeypatch, tmp_path, [("https://sc/cover", "Jess Sings", "Sweet Caroline"), ("https://sc/orig", "Neil Diamond", "Sweet Caroline | ")])
    got = fetch.fetch_source(job(query="Neil Diamond - Sweet Caroline"), str(tmp_path), 480, verify=True)
    assert got.verdict.version == "original" and got.resolved == "https://sc/orig"
    assert got.name == "Neil Diamond - Sweet Caroline"


def test_only_covers_is_an_honest_refusal(monkeypatch, tmp_path):
    FakeWorld(monkeypatch, tmp_path, [("https://sc/a", "Glee Cast", "Sweet Caroline"), ("https://sc/b", "Sing King", "Sweet Caroline (Karaoke Version)")])
    with pytest.raises(fetch.NotTheOriginal) as e:
        fetch.fetch_source(job(query="Neil Diamond - Sweet Caroline"), str(tmp_path), 480, verify=True)
    r = e.value.result()
    assert r["version"] == "cover" and r["needsConsent"] and r["versionNote"].startswith("I found a cover of Sweet Caroline")
    assert len(r["tried"]) == 2


def test_a_cover_the_user_accepted_is_taken_and_labelled(monkeypatch, tmp_path):
    FakeWorld(monkeypatch, tmp_path, [("https://sc/a", "Glee Cast", "Sweet Caroline")])
    got = fetch.fetch_source(job(query="Neil Diamond - Sweet Caroline", accept_version="cover"), str(tmp_path), 480, verify=True)
    assert got.verdict.version == "cover" and "you said to use" in got.verdict.message


def test_the_download_budget_bounds_the_tries(monkeypatch, tmp_path):
    w = FakeWorld(monkeypatch, tmp_path, [(f"https://sc/{i}", "Someone", "Sweet Caroline (Live)") for i in range(6)])
    monkeypatch.setattr(fetch, "MAX_VERIFY_DOWNLOADS", 2)
    with pytest.raises(fetch.NotTheOriginal):
        fetch.fetch_source(job(query="Neil Diamond - Sweet Caroline"), str(tmp_path), 480, verify=True)
    assert len(w.downloads) == 2


def test_a_link_is_not_second_guessed(monkeypatch, tmp_path):
    w = FakeWorld(monkeypatch, tmp_path, [])
    got = fetch.fetch_source(job(url="https://soundcloud.com/x/y"), str(tmp_path), 480, verify=True)
    assert got.verdict is None and w.downloads == ["https://soundcloud.com/x/y"]
