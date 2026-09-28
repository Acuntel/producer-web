"""The vocal map: one JSON of numbers per record, the contract in docs/VOCAL_MAP.md and lib/song/vocalMap.ts.

From the isolated vocal and the mix: the voice's own phrases (phrases.py), every word with a time (lyrics.py),
the notes and the key of each phrase (melody.py), the record's grid (grid.py) and sections (sections.py), and a
hook score from how often a line repeats (its words, and its melody), and how prominent it is (Van Balen et al.,
ISMIR 2015: repetition, melodic self-similarity, prominence). Each phrase says where it starts on the source grid,
which syllable it anchors on, and how many beats of pickup lead into that syllable."""
from __future__ import annotations
import json, time
import numpy as np
import grid as gridmod, lyrics, melody, phrases as ph, sections as sec, wordtime

VERSION = 1
W_REPEAT, W_MELODY, W_PROMINENCE = 0.45, 0.30, 0.25


def anchor(ons: np.ndarray, strength: np.ndarray, a: float, b: float, g) -> float:
    """The stressed syllable a phrase anchors on: of the voice's onsets inside it, the one nearest a downbeat
    (within a quarter beat), then the strongest near any beat; the phrase start when it has no onsets."""
    m = (ons >= a - 0.05) & (ons < b)
    if not m.any(): return a
    t, s = ons[m], strength[m] / (strength[m].max() + 1e-9)
    beat = g.beat_sec
    d_down = np.array([abs(x - g.nearest(float(x), "downbeats")) for x in t]) / beat
    d_beat = np.array([abs(x - g.nearest(float(x), "beats")) for x in t]) / beat
    score = s * np.exp(-(d_down / 0.25) ** 2) + 0.3 * s * np.exp(-(d_beat / 0.15) ** 2)
    return float(t[int(np.argmax(score))])


def repeats_of(texts: list[list[str]], contours: list, lengths: list[float]) -> tuple[list[int], list[int]]:
    """For each phrase: how many phrases sing the same words (itself included; lines of fewer than two words count
    once), and how many share its melody (a contour at least 0.75 alike and a length within 30 percent)."""
    n = len(texts); by_words, by_melody = [1] * n, [1] * n
    for i in range(n):
        for j in range(n):
            if i == j: continue
            if len(texts[i]) >= 2 and len(texts[j]) >= 2 and lyrics.line_similarity(texts[i], texts[j]) >= 0.6: by_words[i] += 1
            ratio = lengths[i] / max(1e-6, lengths[j])
            if 0.7 <= ratio <= 1.43 and melody.similarity(contours[i], contours[j]) >= 0.75: by_melody[i] += 1
    return by_words, by_melody


def hook_scores(by_words: list[int], by_melody: list[int], rms: list[float], energy: list[float]) -> list[float]:
    """0 to 1: repetition of the words, repetition of the melody, and prominence (loudness against the loudest
    phrase over 18 dB, and the mix's energy where it sings)."""
    if not rms: return []
    top_w, top_m, top_r = max(by_words), max(by_melody), max(rms)
    out = []
    for w, m, r, e in zip(by_words, by_melody, rms, energy):
        rep = (w - 1) / max(1, top_w - 1)
        mel = (m - 1) / max(1, top_m - 1)
        loud = max(0.0, min(1.0, 1 - (top_r - r) / 18.0))
        out.append(round(W_REPEAT * rep + W_MELODY * mel + W_PROMINENCE * (0.5 * loud + 0.5 * e), 3))
    return out


def build(vocal_path: str, mix_path: str, facts: dict, words: dict | None = None) -> dict:
    """The map for one record. words may be passed in (a transcription made elsewhere); otherwise it is made here."""
    from analysis import load_mono
    t0 = time.time(); timing: dict[str, float] = {}
    def stamp(k: str) -> None: timing[k] = round(time.time() - t0, 1)
    y, _ = load_mono(vocal_path, melody.SR)
    mix, msr = load_mono(mix_path, 22050)
    found = ph.find_phrases(y, melody.SR); spans = [(p.start, p.end) for p in found]; stamp("phrases")
    g = gridmod.grid_for(mix_path, facts, mix, msr); stamp("grid")
    sections = sec.sections_of(mix, msr, g); stamp("sections")
    ons, strength = ph.onsets(y, melody.SR); stamp("onsets")
    midi = melody.f0_track(y, spans); stamp("melody")
    words = words or lyrics.words(vocal_path); stamp("words")
    per = lyrics.assign(words.get("words") or [], spans)
    lag = wordtime.refine(per, spans, ons, strength); stamp("wordTimes")
    texts = [lyrics.norm(" ".join(w["w"] for w in ws)) for ws in per]
    contours = [melody.contour(midi, a, b) for a, b in spans]
    by_words, by_melody = repeats_of(texts, contours, [b - a for a, b in spans])
    energy = []
    for a, b in spans:
        s = sec.section_at(sections, (a + b) / 2); energy.append(float(s["energy"]) if s else 0.5)
    scores = hook_scores(by_words, by_melody, [p.rms_db for p in found], energy)
    out = []
    for i, p in enumerate(found):
        notes = melody.notes_of(midi, p.start, p.end)
        rel, in_key = melody.key_rel(notes, facts.get("key"))
        stress = anchor(ons, strength, p.start, p.end, g)
        bar, beat = g.position(p.start)
        s = sec.section_at(sections, stress)
        out.append({
            "id": i, "start": p.start, "end": p.end, "loudest": list(p.loudest),
            "text": " ".join(w["w"] for w in per[i]).strip(), "words": per[i], "notes": notes,
            "keyRelToSource": rel, "inKey": in_key, "section": s["label"] if s else None,
            "repeats": max(by_words[i], by_melody[i]) if texts[i] else by_melody[i], "repeatsWords": by_words[i], "repeatsMelody": by_melody[i],
            "hookScore": scores[i], "sourceBar": bar, "sourceBeat": beat,
            "pickupBeats": round((stress - p.start) / g.beat_sec, 3), "stressOnset": round(stress, 3),
            "rmsDb": p.rms_db, "peakDb": p.peak_db,
        })
    sections = promote_choruses(out, sections)
    hook = max(out, key=lambda x: (x["hookScore"], -x["start"]))["id"] if out else None
    stamp("done")
    return {
        "version": VERSION,
        "source": {"name": facts.get("name"), "bpm": facts.get("bpm"), "key": facts.get("key"), "durationSec": facts.get("durationSec"),
                   "grid": g.source, "beatSec": round(g.beat_sec, 4), "downbeats": [round(float(x), 3) for x in g.downbeats]},
        "words": {"model": words.get("model"), "language": words.get("language"), "count": len(words.get("words") or []), "lagSec": lag, "error": words.get("error")},
        "melody": {"model": melody.MODEL},
        "sections": sections, "hook": hook, "phrases": out, "timing": timing,
    }


def promote_choruses(out: list[dict], sections: list[dict]) -> list[dict]:
    """A verse that carries the record's most repeated line is a chorus: the words say so when the energy cannot.
    Returns the sections with same-label neighbours merged, and relabels every phrase."""
    sung = [p for p in out if p["repeatsWords"] >= 3]
    if sung:
        top = max(p["repeatsWords"] for p in sung)
        for p in sung:
            if p["repeatsWords"] < top: continue
            s = sec.section_at(sections, p["stressOnset"])
            if s and s["label"] == "verse": s["label"] = "chorus"
    sections = sec.merge_runs(sections)
    for p in out:
        s = sec.section_at(sections, p["stressOnset"])
        if s: p["section"] = s["label"]
    return sections


if __name__ == "__main__":
    import sys, os
    sys.path.insert(0, os.path.dirname(__file__))
    import analysis
    vocal, mix = sys.argv[1], sys.argv[2]
    f = analysis.analyze(mix); f["name"] = os.path.basename(os.path.dirname(os.path.abspath(mix)))
    m = build(vocal, mix, f)
    print(json.dumps(m if "--full" in sys.argv else {k: v for k, v in m.items() if k != "phrases"}, indent=1))
