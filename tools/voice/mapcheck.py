"""The vocal map measured on real singing: the ground-truth mixes (tools/voice/mixes.py), the vocal as Kim separated
it (tools/voice/sdr.py kim), and answers we know without the model.

- hook: the map's hook phrase against the hand label (the uploader's own repeated chorus line, in meta.json).
- grid: the map's downbeats against the beat we built (a bar every 4 beats from 0 s at meta.bpm).
- drop: the map's first drop against the breakdown we built (8 bars without kick and bass, centred).
- words: word starts against a hand-checked phrase (build/handcheck.json, marked by eye on the envelope plot).
- time: seconds per audio-minute for each stage, with the load average before and after (over 20 = under load).

    OMP_NUM_THREADS=4 python tools/voice/mapcheck.py map [names...]   # build and score the maps
    python tools/voice/mapcheck.py rescore [names...]                 # sections and hook again, models not re-run
    python tools/voice/mapcheck.py plot NAME START END                # the envelope and onsets, for the hand check
    python tools/voice/mapcheck.py words                              # score the words against build/handcheck.json
"""
from __future__ import annotations
import json, os, sys, time
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(ROOT, "worker"))
BUILD = os.path.expanduser("~/dev/producer-web-progress/build")
MIXES, SEP, MAPS = os.path.join(BUILD, "mixes"), os.path.join(BUILD, "sep", "kim"), os.path.join(BUILD, "maps")
LOG = os.path.join(BUILD, "mapcheck-runs.jsonl")


def overlap(label: str, text: str) -> float:
    import lyrics
    want, have = lyrics.norm(label), set(lyrics.norm(text))
    return sum(1 for w in want if w in have) / max(1, len(want))


def score(name: str, m: dict, meta: dict) -> dict:
    ph = m["phrases"]; label = meta["hook"]
    hit = [p for p in ph if overlap(label, p["text"]) >= 0.5]
    ranked = sorted(ph, key=lambda p: -p["hookScore"])
    hook = next((p for p in ph if p["id"] == m["hook"]), None)
    rank = next((i + 1 for i, p in enumerate(ranked) if overlap(label, p["text"]) >= 0.5), None)
    bar = 240.0 / meta["bpm"]; truth = np.arange(0, meta["seconds"], bar)
    d = np.array(m["source"]["downbeats"])
    err = [float(np.min(np.abs(truth - x))) for x in d] if len(d) else []
    bars = int(meta["seconds"] / bar) + 1; drop_truth = (bars // 2 + 4) * bar
    drop = next((s for s in m["sections"] if s["label"] == "drop"), None)
    return {"name": name, "phrases": len(ph), "words": m["words"]["count"], "hookText": hook["text"] if hook else None,
            "hookPass": bool(hook and overlap(label, hook["text"]) >= 0.5), "labelPhrases": len(hit), "labelRank": rank,
            "grid": m["source"]["grid"], "downbeatErrMedianMs": round(1000 * float(np.median(err)), 1) if err else None,
            "downbeatsWithin70ms": round(float(np.mean(np.array(err) < 0.07)), 3) if err else None,
            "dropSec": drop["start"] if drop else None, "dropTruthSec": round(drop_truth, 2), "dropErrBars": round((drop["start"] - drop_truth) / bar, 2) if drop else None,
            "sections": " ".join(f"{s['label']}:{s['startBar']}" for s in m["sections"])}


def run_map(names: list[str]) -> None:
    import analysis, vocalmap
    os.makedirs(MAPS, exist_ok=True)
    for name in names:
        meta = json.load(open(os.path.join(MIXES, name, "meta.json")))
        mix, vocal = os.path.join(MIXES, name, "mix.wav"), os.path.join(SEP, f"{name}.wav")
        load0 = os.getloadavg()[0]; t0 = time.time()
        facts = analysis.analyze(mix); facts["name"] = name; t_facts = time.time() - t0
        m = vocalmap.build(vocal, mix, facts)
        total = time.time() - t0; minutes = meta["seconds"] / 60
        json.dump(m, open(os.path.join(MAPS, f"{name}.json"), "w"))
        stages, prev = {}, 0.0
        for k, v in m["timing"].items(): stages[k] = round((v - prev) / minutes, 1); prev = v
        row = {"at": time.strftime("%Y-%m-%d %H:%M:%S"), **score(name, m, meta), "audioSec": meta["seconds"], "sec": round(total, 1),
               "secPerAudioMin": round(total / minutes, 1), "factsSec": round(t_facts, 1), "stageSecPerAudioMin": stages,
               "threads": os.environ.get("OMP_NUM_THREADS"), "loadBefore": round(load0, 2), "loadAfter": round(os.getloadavg()[0], 2), "underLoad": load0 > 20}
        with open(LOG, "a") as f: f.write(json.dumps(row) + "\n")
        print(json.dumps(row), flush=True)


def rescore(names: list[str]) -> None:
    """Sections and hook again from a saved map, on the saved downbeats (the models are not run again)."""
    import grid, sections, vocalmap
    from analysis import load_mono
    for name in names:
        meta = json.load(open(os.path.join(MIXES, name, "meta.json")))
        path = os.path.join(MAPS, f"{name}.json"); m = json.load(open(path))
        d = grid.regularize(np.array(m["source"]["downbeats"])) if m["source"]["grid"] == "beat_this" else np.array(m["source"]["downbeats"])
        m["source"]["downbeats"] = [round(float(x), 3) for x in d]
        beats = np.sort(np.concatenate([d + k * m["source"]["beatSec"] for k in range(4)]))
        g = grid.Grid(beats, d, m["source"]["beatSec"], m["source"]["grid"])
        mix, sr = load_mono(os.path.join(MIXES, name, "mix.wav"), 22050)
        secs = sections.sections_of(mix, sr, g)
        import phrases as ph, wordtime
        y, vsr = load_mono(os.path.join(SEP, f"{name}.wav"), 16000)
        ons, st = ph.onsets(y, vsr)
        per = [p["words"] for p in m["phrases"]]
        for ws in per:
            for w in ws:
                if "asr" in w: w["start"] = w.pop("asr")
        m["words"]["lagSec"] = wordtime.refine(per, [(p["start"], p["end"]) for p in m["phrases"]], ons, st)
        m["sections"] = vocalmap.promote_choruses(m["phrases"], secs)
        json.dump(m, open(path, "w"))
        print(json.dumps({"at": time.strftime("%Y-%m-%d %H:%M:%S"), "rescored": True, **score(name, m, meta)}), flush=True)


def plot(name: str, a: float, b: float) -> None:
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import phrases as ph
    from analysis import load_mono
    y, sr = load_mono(os.path.join(MIXES, name, "vocals.wav"), 16000)
    seg = y[int(a * sr): int(b * sr)]
    env = ph.envelope(seg, sr); t = a + np.arange(len(env)) * 0.01
    ons, st = ph.onsets(seg, sr)
    m = json.load(open(os.path.join(MAPS, f"{name}.json")))
    fig, ax = plt.subplots(figsize=(22, 5))
    ax.plot(t, env, lw=0.8)
    for o in ons: ax.axvline(a + o, color="g", lw=0.6)
    for p in m["phrases"]:
        for w in p["words"]:
            if a <= w["start"] <= b: ax.axvline(w["start"], color="r", lw=0.8, ls="--"); ax.text(w["start"], env.max() + 2, w["w"], rotation=60, fontsize=8, color="r")
    ax.set_xticks(np.arange(np.floor(a), b, 0.25), minor=True); ax.set_xticks(np.arange(np.floor(a), b, 1.0)); ax.grid(which="both", alpha=0.3)
    out = os.path.join(BUILD, f"handcheck-{name}-{int(a)}.png"); fig.savefig(out, dpi=110, bbox_inches="tight"); print(out)
    print("onsets:", [round(a + float(o), 2) for o in ons])


def words() -> None:
    """build/handcheck.json: {name: {"words": [{"w": "break", "start": 80.12}, ...]}} marked by eye on the plot."""
    hand = json.load(open(os.path.join(BUILD, "handcheck.json")))
    for name, h in hand.items():
        m = json.load(open(os.path.join(MAPS, h.get("map", f"{name}.json"))))
        got = [w for p in m["phrases"] for w in p["words"]]
        for key in ("asr", "start"):   # Whisper's own time, then the time on the voice's onset
            errs = []
            for w in h["words"]:
                t = lambda g: g.get(key, g["start"])
                cand = [g for g in got if g["w"].lower().strip(",.!?") == w["w"] and abs(t(g) - w["start"]) < 1.6]
                if cand: errs.append(min(abs(t(g) - w["start"]) for g in cand))
            row = {"name": name, "time": "whisper" if key == "asr" else "onset", "map": h.get("map", f"{name}.json"), "handWords": len(h["words"]), "matched": len(errs),
                   "meanAbsErrMs": round(1000 * float(np.mean(errs)), 1) if errs else None, "medianAbsErrMs": round(1000 * float(np.median(errs)), 1) if errs else None,
                   "maxAbsErrMs": round(1000 * float(np.max(errs)), 1) if errs else None, "within100ms": round(float(np.mean(np.array(errs) < 0.1)), 3) if errs else None,
                   "lagSec": m["words"].get("lagSec")}
            print(json.dumps(row))


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "map"
    if mode == "map": run_map(sys.argv[2:] or sorted(os.listdir(MIXES)))
    elif mode == "rescore": rescore(sys.argv[2:] or sorted(n[:-5] for n in os.listdir(MAPS)))
    elif mode == "plot": plot(sys.argv[2], float(sys.argv[3]), float(sys.argv[4]))
    elif mode == "words": words()
