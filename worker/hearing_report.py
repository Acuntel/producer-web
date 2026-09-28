"""The listening pass's plain-English report: what the numbers say, in the words the producer reasons from."""
from __future__ import annotations

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
