"""The vocal map's parts on audio whose answers are known: tones for phrases and notes, a click grid for bars,
a synthetic loudness plan for sections, and made-up word lists for the lyric and hook arithmetic."""
import os
import numpy as np
import pytest

os.environ["BEAT_THIS"] = "0"
import grid, lyrics, melody, phrases, sections, vocalmap  # noqa: E402

SR = 16000


def tone(midi: float, sec: float, amp: float = 0.3, sr: int = SR) -> np.ndarray:
    t = np.arange(int(sec * sr)) / sr
    f = 440.0 * 2 ** ((midi - 69) / 12)
    fade = np.minimum(1, np.minimum(t / 0.02, (sec - t) / 0.02))
    return (amp * fade * (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t))).astype(np.float32)


def stem(parts: list[tuple[float, np.ndarray]], seconds: float) -> np.ndarray:
    rng = np.random.default_rng(3)
    y = (rng.standard_normal(int(seconds * SR)) * 0.0005).astype(np.float32)
    for at, x in parts:
        i = int(at * SR); y[i:i + len(x)] += x[: max(0, len(y) - i)]
    return y


def test_phrases_follow_the_voice_and_keep_the_loudest_window():
    quiet, loud = tone(60, 4, 0.05), tone(60, 4, 0.4)
    long = np.concatenate([quiet, loud])                       # 8 s: the loud half is the last 4 s
    y = stem([(1.0, tone(64, 1.5)), (4.0, long)], 14)
    got = phrases.find_phrases(y, SR, max_sec=4.0, long_sec=9.0)
    assert len(got) == 2
    assert abs(got[0].start - 1.0) < 0.05 and abs(got[0].end - 2.5) < 0.1
    assert abs(got[1].end - 12.0) < 0.1, "a long phrase is kept whole in the map"
    a, b = got[1].loudest
    assert b - a == pytest.approx(4.0, abs=0.02) and a >= 7.9, f"the cap keeps the loudest window, not the first: {a}"


def test_a_run_of_lines_is_cut_at_its_deepest_breath():
    line = lambda: tone(64, 2.8, 0.3)
    breath = tone(64, 0.25, 0.012)                               # under the close level, but shorter than a join
    run = np.concatenate([line(), breath, line(), breath, line(), breath, line()])
    y = stem([(1.0, run)], 16)
    got = phrases.find_phrases(y, SR, long_sec=8.0)
    assert len(got) >= 2 and all(p.end - p.start <= 8.0 for p in got), [(p.start, p.end) for p in got]
    cuts = [p.end for p in got[:-1]]
    for c in cuts:
        assert any(abs(c - (1.0 + k * 3.05 + 2.8)) < 0.3 for k in range(3)), f"cut {c} is not at a breath"


def test_notes_and_key_of_a_sung_line():
    line = np.concatenate([tone(69, 0.5), tone(72, 0.5), tone(76, 0.5), tone(74, 0.5)])   # A C E D: A minor
    y = stem([(1.0, line)], 4)
    midi = melody.f0_track(y, [(1.0, 3.0)])
    notes = melody.notes_of(midi, 1.0, 3.0)
    got = [round(n["midi"]) for n in notes if n["end"] - n["start"] > 0.2]
    assert got == [69, 72, 76, 74], got
    assert melody.key_rel(notes, "A minor") == (0, 1.0)
    rel, in_key = melody.key_rel(notes, "Bb minor")
    assert rel == -1 and in_key < 0.5, "a line a semitone under the record's key says so"


def test_the_tempo_grid_counts_bars_from_the_first_downbeat():
    g = grid.from_tempo(120.0, 0.25, 20.0)
    assert g.source == "tempo" and g.downbeats[0] == pytest.approx(0.25)
    assert g.position(0.25) == (0, 0.0)
    assert g.position(2.25 + 0.5) == (1, 1.0)
    assert g.position(0.0)[0] == -1, "before the first downbeat the bar is negative"
    assert g.nearest(2.3) == pytest.approx(2.25)


def test_the_downbeat_is_where_the_low_end_lands():
    sr = 22050; bpm = 120.0; beat = 0.5
    y = np.zeros(int(16 * sr), dtype=np.float32)
    for k in range(32):
        at = int((0.1 + k * beat) * sr); amp = 1.0 if k % 4 == 2 else 0.2       # the hard hit is the third beat
        y[at:at + 2000] += amp * np.sin(2 * np.pi * 55 * np.arange(2000) / sr).astype(np.float32)
    from scipy.signal import butter, sosfiltfilt
    low = sosfiltfilt(butter(4, 150, "low", fs=sr, output="sos"), y)
    g = grid.from_tempo(bpm, 0.1, 16.0, low, sr)
    assert g.downbeats[0] == pytest.approx(1.1)


def test_sections_find_the_drop_the_build_and_the_break():
    e = [0.3, 0.5, 0.6, 1.0, 0.95, 0.4, 0.6, 1.0, 0.9, 0.3]
    lo = [0.1, 0.2, 0.2, 1.0, 1.0, 0.1, 0.2, 1.0, 1.0, 0.1]
    assert sections.label_groups(e, lo) == ["intro", "intro", "build", "drop", "drop", "break", "build", "drop", "drop", "outro"]


def test_sections_on_audio_merge_runs_and_mark_the_drop():
    sr = 22050; bar = 2.0
    plan = [0.1] * 8 + [1.0] * 8                                   # 8 quiet bars, then kick and bass come in
    y = np.zeros(int(len(plan) * bar * sr), dtype=np.float32)
    t = np.arange(len(y)) / sr
    y += 0.1 * np.sin(2 * np.pi * 440 * t).astype(np.float32)
    for b, lvl in enumerate(plan):
        i, j = int(b * bar * sr), int((b + 1) * bar * sr)
        y[i:j] += (lvl * 0.8 * np.sin(2 * np.pi * 50 * t[i:j])).astype(np.float32)
    g = grid.from_tempo(120.0, 0.0, len(plan) * bar)
    got = sections.sections_of(y, sr, g)
    assert [s["label"] for s in got] == ["intro", "build", "drop"]
    assert got[-1]["startBar"] == 8 and got[-1]["start"] == pytest.approx(16.0)


def test_words_go_to_the_phrase_they_overlap_or_the_nearest_one():
    ws = [{"w": "break", "start": 1.0, "end": 1.3, "p": 0.9}, {"w": "down", "start": 2.9, "end": 3.2, "p": 0.9}, {"w": "ghost", "start": 9.0, "end": 9.2, "p": 0.2}]
    got = lyrics.assign(ws, [(0.9, 2.0), (3.4, 5.0)])
    assert [w["w"] for w in got[0]] == ["break"]
    assert [w["w"] for w in got[1]] == ["down"], "a word that drifted 0.2 s early still labels its phrase"
    assert lyrics.norm("Don't stop, BELIEVIN'!") == ["dont", "stop", "believin"]


def test_the_most_repeated_loud_line_is_the_hook():
    texts = [lyrics.norm(t) for t in ["walking home tonight", "break it down for me now", "under the city lights", "break it down for me now", "break it down for me"]]
    c = np.linspace(-2, 2, 24)
    contours = [None, c, -c, c, c]
    by_w, by_m = vocalmap.repeats_of(texts, contours, [2.0, 2.2, 2.0, 2.1, 2.0])
    assert by_w == [1, 3, 1, 3, 3]
    assert by_m[1] == 3 and by_m[2] == 1
    scores = vocalmap.hook_scores(by_w, by_m, [-20, -18, -19, -18, -22], [0.5, 0.9, 0.5, 0.9, 0.9])
    assert int(np.argmax(scores)) == 1
    assert scores[0] < 0.3


def test_the_anchor_is_the_syllable_on_the_one():
    g = grid.from_tempo(120.0, 0.0, 20.0)                            # downbeats every 2 s
    ons = np.array([3.5, 3.75, 4.02, 4.5]); strength = np.array([0.6, 0.5, 0.8, 1.0])
    assert vocalmap.anchor(ons, strength, 3.45, 5.0, g) == pytest.approx(4.02)
    assert vocalmap.anchor(np.zeros(0), np.zeros(0), 3.45, 5.0, g) == 3.45
