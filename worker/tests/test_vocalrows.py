"""The placement rows and the numbers-only cache: what a heard record teaches, filed under the SOURCE record, and a
shared cache that can no longer hand anyone audio."""
import os, sys
import pytest

import vocalrows, supa, jobs  # noqa: E402
from models import Job, Source  # noqa: E402

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "tools", "dna")))
import bins  # noqa: E402


def vmap():
    beat = 0.5
    sections = [
        {"label": "intro", "startBar": 0, "endBar": 4, "start": 0.0, "end": 8.0, "energy": 0.3, "low": 0.2},
        {"label": "build", "startBar": 4, "endBar": 8, "start": 8.0, "end": 16.0, "energy": 0.6, "low": 0.3},
        {"label": "drop", "startBar": 8, "endBar": 16, "start": 16.0, "end": 32.0, "energy": 1.0, "low": 1.0},
        {"label": "outro", "startBar": 16, "endBar": 20, "start": 32.0, "end": 40.0, "energy": 0.4, "low": 0.3},
    ]
    ph = lambda i, a, b, stress, hook=0.2, sec="build": {"id": i, "start": a, "end": b, "stressOnset": stress, "section": sec, "hookScore": hook, "repeats": 1,
                                                          "sourceBar": int(a // 2), "sourceBeat": (a % 2) / beat, "pickupBeats": (stress - a) / beat, "keyRelToSource": 0, "inKey": 0.9}
    return {"version": 1, "source": {"bpm": 120.0, "beatSec": beat, "downbeats": [2.0 * k for k in range(20)]}, "sections": sections, "hook": 2,
            "phrases": [ph(0, 9.0, 11.0, 10.0), ph(1, 13.5, 15.5, 14.0), ph(2, 16.0, 18.0, 16.0, 0.9, "drop")]}


def test_the_bands_and_the_archetype_are_the_stores_own():
    for t in (None, 80, 95, 115, 125, 128, 140, 150, 170):
        assert vocalrows.tempo_band(t) == bins.tempo_band(t)
    for s in ("I V C V C O", "I U D K U D O", "V V", "I V K B O", None):
        assert vocalrows.archetype(s) == bins.structure_archetype(s)
    assert vocalrows.structure_of(vmap()["sections"]) == "I U D O"


def test_the_family_is_the_callers_then_the_ears():
    m = vmap()
    assert vocalrows.pins(m, "house", {"clap": {"genres": [["trap", 0.3]]}})["family"] == "house"
    assert vocalrows.pins(m, None, {"clap": {"genres": [["deep house", 0.3], ["pop", 0.2]]}})["family"] == "house"
    assert vocalrows.pins(m, None, None)["family"] is None


def test_every_phrase_says_where_it_sits_against_the_next_peak():
    rows = vocalrows.phrase_rows(vmap(), "id:1", "house")
    assert [r["phrase"] for r in rows] == [0, 1, 2]
    lead = rows[1]
    assert lead["peak_label"] == "drop" and lead["peak_bar"] == 8
    assert lead["lead_in_beats"] == pytest.approx(1.0)          # ends half a second (a beat) before the drop
    assert lead["anchor_to_peak_beats"] == pytest.approx(4.0)
    assert lead["tempo_band"] == "110-122" and lead["archetype"] == "build_drop" and lead["family"] == "house"
    hook = rows[2]
    assert hook["is_hook"] and hook["anchor_to_peak_beats"] == pytest.approx(0.0) and hook["bar_in_section"] == pytest.approx(0.0)
    assert hook["vocal_share"] == pytest.approx(2.0 / 16.0, abs=1e-3)
    assert "text" not in hook and "words" not in hook, "numbers only: no lyric leaves the map"


def test_the_lead_in_row_is_the_last_line_before_the_drop():
    row = vocalrows.drop_row(vmap(), "id:1", "house", name="A - B")
    assert row["drop_sec"] == 16.0 and row["lead_in_sec"] == pytest.approx(0.5) and row["carries_through"]   # phrase 2 ends 2 s late; phrase 1 ends 0.5 s before
    m = vmap(); m["phrases"] = m["phrases"][:2]
    row = vocalrows.drop_row(m, "id:1", "house")
    assert row["lead_in_beats"] == pytest.approx(1.0) and row["measured_by"] == "worker" and not row["carries_through"]
    m["sections"] = [s for s in m["sections"] if s["label"] != "drop"]
    assert vocalrows.drop_row(m, "id:1", "house") is None


def test_the_shared_cache_holds_numbers_and_never_a_path_to_audio():
    old = {"facts": {"bpm": 120}, "hearing": {"report": "x"}, "stems": [{"stem": "vocals", "path": "shared/records/k/vocals.mp3"}], "oneshots": [{"path": "shared/records/k/kick.wav"}], "name": "A - B"}
    assert supa.numbers_of(old) == {"facts": {"bpm": 120}, "hearing": {"report": "x"}, "name": "A - B"}


def test_a_known_record_finishes_a_learn_job_and_only_informs_a_persons(monkeypatch):
    calls = []
    monkeypatch.setattr(supa, "update_job", lambda job_id, **f: calls.append(f))
    known = {"fingerprint": "k", "result": {"facts": {"bpm": 120}, "stems": [{"stem": "vocals", "path": "shared/records/k/vocals.mp3"}], "vocalMap": {"version": 1}}}
    learn = Job(job_id="j1", owner="o", source=Source(query="a b", learn=True))
    assert jobs._known(learn, "A - B", known, {}) is True
    assert calls[-1]["status"] == "done" and "stems" not in calls[-1]["result"] and calls[-1]["result"]["vocalMap"] == {"version": 1}
    person = Job(job_id="j2", owner="o", source=Source(query="a b"))
    assert jobs._known(person, "A - B", known, {}) is False
    assert "status" not in calls[-1] and "stems" not in calls[-1]["result"] and calls[-1]["result"]["knownNumbers"] is True
