"""Hear like a human: per-stem listening for the brain. Numbers first (what carries each
block, the drum grids, the bass notes, the chords, the lyrics, the spectrum), then a
plain-English report the producer reasons from. CLAP gives descriptors and embeddings
for "this sounds like" and for sound search; Whisper gives the words."""
from __future__ import annotations
import json, math, os
from dataclasses import dataclass
import numpy as np
import librosa

SR = 22050
BANDS = [("sub", 20, 60), ("low", 60, 250), ("lowMid", 250, 500), ("mid", 500, 2000), ("highMid", 2000, 6000), ("air", 6000, 11025)]
NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
DESCRIPTORS = ["dark", "bright", "warm", "cold", "aggressive", "gentle", "hypnotic", "euphoric", "melancholic", "playful", "dusty", "clean", "distorted", "airy", "punchy", "soft", "wide", "narrow", "organic", "robotic", "lo-fi", "polished", "groovy", "stiff", "minimal", "dense", "dreamy", "raw", "funky", "cinematic", "sexy", "tense", "uplifting", "underground", "commercial"]
GENRES = ["tech house", "deep house", "hard house", "techno", "trance", "uk garage", "jersey club", "trap", "hip hop", "pop", "psychedelic rock", "afro house", "melodic techno", "drum and bass", "dubstep", "disco", "hardstyle", "ambient", "r&b", "indie rock"]

_clap = None
_whisper = None


def midi_name(m: float) -> str:
    n = int(round(m)); return f"{NOTE_NAMES[n % 12]}{n // 12 - 1}"


def band_shares(y: np.ndarray, sr: int) -> dict:
    S = np.abs(librosa.stft(y, n_fft=2048)) ** 2
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    tot = float(S.sum()) + 1e-9
    return {name: round(float(S[(freqs >= lo) & (freqs < hi)].sum()) / tot, 3) for name, lo, hi in BANDS}


def per_bar_rms(y: np.ndarray, sr: int, bar_sec: float, n_bars: int) -> np.ndarray:
    rms = librosa.feature.rms(y=y)[0]
    t = librosa.frames_to_time(np.arange(len(rms)), sr=sr)
    out = np.zeros(n_bars)
    for b in range(n_bars):
        m = (t >= b * bar_sec) & (t < (b + 1) * bar_sec)
        out[b] = float(rms[m].mean()) if m.any() else 0.0
    return out


def drum_grids(y: np.ndarray, sr: int, bar_sec: float, start_bar: int, bars: int = 8) -> dict:
    """Kick / snare / hat 16-step grids over the best bars: majority vote of classified onsets per step."""
    a, b = int(start_bar * bar_sec * sr), int(min(len(y), (start_bar + bars) * bar_sec * sr))
    seg = y[a:b]
    if len(seg) < sr: return {}
    onsets = librosa.onset.onset_detect(y=seg, sr=sr, units="samples", backtrack=True, delta=0.1)
    step = bar_sec / 16
    counts = {"kick": np.zeros(16), "snare": np.zeros(16), "hat": np.zeros(16)}
    for o in onsets:
        n = min(len(seg), o + int(0.12 * sr)); piece = seg[o:n]
        if len(piece) < 256: continue
        spec = np.abs(np.fft.rfft(piece * np.hanning(len(piece)))); freqs = np.fft.rfftfreq(len(piece), 1 / sr)
        tot = spec.sum() + 1e-9; low = spec[freqs < 150].sum() / tot; cen = float((freqs * spec).sum() / tot)
        role = "kick" if (low > 0.4 and cen < 700) else "hat" if cen > 4000 else "snare"
        t = o / sr; s16 = int(round((t % bar_sec) / step)) % 16
        counts[role][s16] += 1
    grids = {}
    for role, c in counts.items():
        if c.max() <= 0: continue
        thr = max(1.0, bars * 0.5)   # a hit that lands on that step in at least half the bars
        grids[role] = "".join("X" if v >= thr and v >= c.max() * 0.85 else "x" if v >= thr else "g" if v >= thr * 0.5 else "." for v in c)
    return grids


def bass_line(y: np.ndarray, sr: int, bar_sec: float, start_bar: int, bars: int = 4) -> dict:
    a, b = int(start_bar * bar_sec * sr), int(min(len(y), (start_bar + bars) * bar_sec * sr))
    seg = y[a:b]
    if len(seg) < sr: return {}
    f0, voiced, _ = librosa.pyin(seg, fmin=30, fmax=260, sr=sr, frame_length=4096, hop_length=512)
    t = librosa.frames_to_time(np.arange(len(f0)), sr=sr, hop_length=512)
    step = bar_sec / 8   # eighths
    notes: dict[int, list[float]] = {}
    for i, (f, v) in enumerate(zip(f0, voiced)):
        if not v or not f or f <= 0: continue
        s8 = int(t[i] // step)
        notes.setdefault(s8, []).append(float(librosa.hz_to_midi(f)))
    if not notes: return {}
    seq = []
    for s8 in sorted(notes):
        m = float(np.median(notes[s8]))
        seq.append({"eighth": s8, "midi": int(round(m)), "note": midi_name(m)})
    hist: dict[str, int] = {}
    for n in seq: hist[n["note"][:-1]] = hist.get(n["note"][:-1], 0) + 1
    rhythm = "".join("X" if any(n["eighth"] % 8 == k for n in seq) else "." for k in range(8))
    # Condense runs: "F1 x12, Ab1 x2" reads like a bassline, thirty-two F1s does not.
    runs: list[list] = []
    for n in seq:
        if runs and runs[-1][0] == n["note"]: runs[-1][1] += 1
        else: runs.append([n["note"], 1])
    notes = [f"{nm} x{c}" if c > 1 else nm for nm, c in runs][:16]
    return {"notes": notes, "root": max(hist, key=hist.get), "eighthRhythm": rhythm, "histogram": hist, "distinct": len(hist)}


def chords_per_block(y: np.ndarray, sr: int, bar_sec: float, n_bars: int) -> list[str]:
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    t = librosa.frames_to_time(np.arange(chroma.shape[1]), sr=sr)
    maj = np.array([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0], dtype=float); mnr = np.array([1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0], dtype=float)
    out = []
    for b in range(min(n_bars, 64)):
        m = (t >= b * bar_sec) & (t < (b + 1) * bar_sec)
        if not m.any(): out.append("-"); continue
        c = chroma[:, m].mean(axis=1); c = c / (c.sum() + 1e-9)
        best, name = -1.0, "-"
        for r in range(12):
            for q, tmpl in (("", maj), ("m", mnr)):
                sc = float((np.roll(tmpl, r) * c).sum())
                if sc > best: best, name = sc, f"{NOTE_NAMES[r]}{q}"
        out.append(name)
    return out


def condense(seq: list[str]) -> list[str]:
    out = []
    for x in seq:
        if not out or out[-1] != x: out.append(x)
    return out[:12]


def clap_model():
    global _clap
    if _clap is None:
        from transformers import ClapModel, ClapProcessor
        name = os.environ.get("CLAP_MODEL", "laion/clap-htsat-unfused")
        _clap = (ClapModel.from_pretrained(name).eval(), ClapProcessor.from_pretrained(name))
    return _clap


def clap_embed(y: np.ndarray, sr: int) -> np.ndarray:
    import torch
    model, proc = clap_model()
    y48 = librosa.resample(y.astype(np.float32), orig_sr=sr, target_sr=48000) if sr != 48000 else y.astype(np.float32)
    y48 = y48[: 48000 * 10]
    with torch.no_grad():
        inputs = proc(audios=[y48], sampling_rate=48000, return_tensors="pt")
        e = model.get_audio_features(**inputs)
        e = e / e.norm(dim=-1, keepdim=True)
    return e[0].cpu().numpy()


def clap_scores(emb: np.ndarray, labels: list[str], template: str) -> list[tuple[str, float]]:
    """Labels ranked by cosine similarity to the audio. Raw similarity, not a softmax: a
    peaky softmax over thirty labels reads as false certainty."""
    import torch
    model, proc = clap_model()
    with torch.no_grad():
        ti = proc(text=[template.format(l) for l in labels], return_tensors="pt", padding=True)
        te = model.get_text_features(**ti); te = te / te.norm(dim=-1, keepdim=True)
        sims = (torch.tensor(emb) @ te.T).cpu().numpy()
    order = np.argsort(-sims)
    return [(labels[i], round(float(sims[i]), 3)) for i in order]


def whisper_lyrics(vocals_path: str, max_sec: int = 240) -> dict:
    global _whisper
    try:
        from faster_whisper import WhisperModel
        if _whisper is None: _whisper = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), device="cpu", compute_type="int8")
        segments, info = _whisper.transcribe(vocals_path, beam_size=1, vad_filter=True, vad_parameters={"min_silence_duration_ms": 500})
        lines = []
        for s in segments:
            if s.end > max_sec: break
            txt = s.text.strip()
            if txt: lines.append({"at": round(float(s.start), 1), "text": txt})
        return {"language": info.language, "lines": lines[:60]}
    except Exception as e:
        return {"error": str(e)[:160], "lines": []}


def hear(mix_path: str, stems: dict[str, str], facts: dict) -> dict:
    """The full listening pass. facts needs bpm, bars, bestBars.startBar, blocks (optional)."""
    bpm = float(facts.get("bpm") or 126); bar_sec = 240.0 / bpm
    n_bars = int(facts.get("bars") or 32)
    best_bar = int((facts.get("bestBars") or {}).get("startBar", 0))
    mix, _ = librosa.load(mix_path, sr=SR, mono=True)
    loaded = {k: librosa.load(p, sr=SR, mono=True)[0] for k, p in stems.items()}
    per_stem = {}
    energies = {}
    for name, y in loaded.items():
        rms = per_bar_rms(y, SR, bar_sec, n_bars); energies[name] = rms
        onsets = librosa.onset.onset_detect(y=y, sr=SR, units="time")
        cen = librosa.feature.spectral_centroid(y=y, sr=SR)[0]
        peak = float(np.max(np.abs(y)) + 1e-9); rmsall = float(np.sqrt(np.mean(y ** 2)) + 1e-9)
        per_stem[name] = {"bands": band_shares(y, SR), "centroidHz": int(np.median(cen)) if len(cen) else 0, "onsetsPerBeat": round(len(onsets) / max(1.0, len(y) / SR / (60 / bpm)), 2), "crestDb": round(20 * math.log10(peak / rmsall), 1), "share": 0.0}
    total = sum(energies.values()) if energies else np.zeros(n_bars)
    total = np.where(total > 0, total, 1e-9)
    for name, rms in energies.items(): per_stem[name]["share"] = round(float((rms / total).mean()), 3)
    # What carries each 8-bar block, and who enters or leaves.
    blocks = []
    prev = None
    for b in range(0, n_bars, 8):
        shares = {name: float((rms[b:b + 8] / total[b:b + 8]).mean()) for name, rms in energies.items()}
        level = float(total[b:b + 8].mean() / (total.max() + 1e-9))
        carries = max(shares, key=shares.get) if shares else "-"
        entering = [n for n, v in shares.items() if v > 0.12 and (prev is None or prev.get(n, 0) <= 0.12)] if prev is not None else []
        leaving = [n for n, v in shares.items() if v <= 0.05 and prev is not None and prev.get(n, 0) > 0.12] if prev is not None else []
        blocks.append({"bar": b, "at": round(b * bar_sec, 1), "level": round(level, 2), "carries": carries, "shares": {k: round(v, 2) for k, v in shares.items()}, "entering": entering, "leaving": leaving})
        prev = shares
    drums = drum_grids(loaded["drums"], SR, bar_sec, best_bar) if "drums" in loaded else {}
    bass = bass_line(loaded["bass"], SR, bar_sec, best_bar) if "bass" in loaded else {}
    chords = condense(chords_per_block(loaded.get("other", mix), SR, bar_sec, n_bars))
    vocals_share = per_stem.get("vocals", {}).get("share", 0.0)
    lyrics = whisper_lyrics(stems["vocals"]) if "vocals" in stems and vocals_share > 0.04 else {"lines": []}
    # CLAP on the best bars of the mix and on each stem: descriptors, genres, embeddings for sound search.
    clap = {"descriptors": [], "genres": [], "embeddings": {}}
    try:
        a = int(best_bar * bar_sec * SR); ex = mix[a: a + int(8 * bar_sec * SR)]
        emb = clap_embed(ex, SR)
        clap["descriptors"] = clap_scores(emb, DESCRIPTORS, "This music sounds {}.")[:6]
        clap["genres"] = clap_scores(emb, GENRES, "This is a {} track.")[:3]
        clap["embeddings"]["mix"] = [round(float(v), 4) for v in emb]
        for name, y in loaded.items():
            seg = y[a: a + int(8 * bar_sec * SR)]
            if float(np.max(np.abs(seg)) if len(seg) else 0) > 0.01: clap["embeddings"][name] = [round(float(v), 4) for v in clap_embed(seg, SR)]
    except Exception as e:
        clap["error"] = str(e)[:160]
    report = write_report(facts, per_stem, blocks, drums, bass, chords, lyrics, clap)
    return {"perStem": per_stem, "blocks": blocks, "drumGrids": drums, "bass": bass, "chords": chords, "lyrics": lyrics, "clap": {k: v for k, v in clap.items() if k != "embeddings"}, "embeddings": clap.get("embeddings", {}), "report": report}


HUMAN = {"drums": "drums", "bass": "bass", "vocals": "vocals", "other": "chords and keys"}
def hn(name: str) -> str: return HUMAN.get(name, name)


def write_report(facts, per_stem, blocks, drums, bass, chords, lyrics, clap) -> str:
    bpm = facts.get("bpm"); key = facts.get("key"); parts = []
    parts.append(f"{round(bpm)} BPM, {key}." if bpm and key else "")
    if blocks:
        first = blocks[0]; parts.append(f"It opens at {int(first['level'] * 100)} percent energy with the {hn(first['carries'])} carrying it.")
        moves = [f"at {mmss(b['at'])} the {' and '.join(hn(x) for x in b['entering'])} come{'s' if len(b['entering']) == 1 else ''} in" for b in blocks if b["entering"]][:5]
        outs = [f"at {mmss(b['at'])} the {' and '.join(hn(x) for x in b['leaving'])} drop{'s' if len(b['leaving']) == 1 else ''} out" for b in blocks if b["leaving"]][:4]
        if moves or outs: parts.append("; ".join(moves + outs).capitalize() + ".")
        lead = max(per_stem, key=lambda k: per_stem[k]["share"]) if per_stem else None
        if lead: parts.append(f"Over the whole record the {hn(lead)} carries {int(per_stem[lead]['share'] * 100)} percent of the energy.")
    if drums:
        parts.append("Drums in the best bars: " + ", ".join(f"{k} {v}" for k, v in drums.items()) + ".")
    if bass:
        parts.append(f"Bass lives on {bass.get('root')}, playing {', '.join(bass.get('notes', [])[:8])} with the rhythm {bass.get('eighthRhythm')} in eighths{' (one note the whole way)' if bass.get('distinct') == 1 else ''}.")
    if chords and any(c != "-" for c in chords): parts.append("Chords move " + " ".join(c for c in chords if c != "-")[:80] + ".")
    if lyrics.get("lines"):
        parts.append(f"Vocals: {len(lyrics['lines'])} lines; first words at {mmss(lyrics['lines'][0]['at'])}: \"{lyrics['lines'][0]['text'][:80]}\".")
    elif per_stem.get("vocals", {}).get("share", 0) > 0.04: parts.append("There is a vocal but the words are not clear.")
    if clap.get("descriptors"):
        parts.append("It sounds " + ", ".join(d for d, _ in clap["descriptors"][:4]) + (f"; the closest genre read is {clap['genres'][0][0]}." if clap.get("genres") else "."))
    if per_stem:
        d = per_stem.get("drums", {}); parts.append(f"Drum transients are {'sharp' if d.get('crestDb', 0) > 18 else 'soft'} ({d.get('crestDb')} dB crest), hats and top sit at {d.get('centroidHz')} Hz centroid.")
    return " ".join(p for p in parts if p)


def mmss(s: float) -> str:
    return f"{int(s // 60)}:{int(s % 60):02d}"


if __name__ == "__main__":
    import sys
    mix, sep = sys.argv[1], sys.argv[2]
    stems = {n: os.path.join(sep, f"{n}.wav") for n in ("drums", "bass", "vocals", "other") if os.path.exists(os.path.join(sep, f"{n}.wav"))}
    import analysis
    facts = analysis.analyze(mix)
    out = hear(mix, stems, facts)
    print(json.dumps({k: v for k, v in out.items() if k != "embeddings"}, indent=1)[:4000])
    print("EMBEDDINGS:", {k: len(v) for k, v in out.get("embeddings", {}).items()})
