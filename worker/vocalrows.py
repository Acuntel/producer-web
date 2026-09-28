"""What every heard record teaches about where a voice goes: one row per phrase against the record's peaks and
boundaries, and one lead-in row per record, keyed by the SOURCE record's family, tempo band and structure archetype
(docs/MASTERPROMPT_PRODUCER.md section 6). Numbers only; the rows go to dna_vocal_phrases and dna_vocal_drops
(supabase/migrations/0020_vocal_phrases.sql) and tools/dna/vocal_drops.py rolls them up for the planner.

The bands and the archetype are the store's own (tools/dna/bins.py, docs/DNA_SPEC.md section 3), and the family
from the ears is lib/brain/harmony.ts familyFromGenres, so a row files where the store's rows file."""
from __future__ import annotations

CODES = {"intro": "I", "verse": "V", "chorus": "C", "build": "U", "drop": "D", "break": "K", "outro": "O"}
PEAKS = ("drop", "chorus")
TEMPO_BANDS = [("<90", None, 90), ("90-110", 90, 110), ("110-122", 110, 122), ("122-132", 122, 132),
               ("132-145", 132, 145), ("145-160", 145, 160), (">160", 160, None)]
FAMILY_KEYS = [("house", ["house"]), ("techno", ["techno"]), ("trance", ["trance"]), ("garage", ["garage", "2-step"]),
               ("dnb", ["drum and bass", "dnb", "jungle"]), ("dubstep", ["dubstep"]), ("hardstyle", ["hardstyle", "hardcore"]),
               ("disco", ["disco"]), ("electronic", ["edm", "electro", "dance", "electronic", "ambient", "breakbeat"]),
               ("hiphop", ["hip hop", "hip-hop", "rap", "trap"]), ("rnb", ["r&b", "rnb", "soul", "funk"]), ("country", ["country"]),
               ("latin", ["latin", "reggaeton"]), ("jazz", ["jazz", "blues"]), ("classical", ["classical"]), ("folk", ["folk"]),
               ("metal", ["metal"]), ("rock", ["rock", "punk", "indie"]), ("pop", ["pop"]), ("world", ["afro", "reggae", "world"])]


def tempo_band(tempo: float | None) -> str:
    if tempo is None or tempo != tempo: return "unknown"
    for label, lo, hi in TEMPO_BANDS:
        if (lo is None or tempo >= lo) and (hi is None or tempo < hi): return label
    return "unknown"


def structure_of(sections: list[dict]) -> str | None:
    """The section letters in order, e.g. "I V C V K U D O"."""
    codes = [CODES.get(s.get("label"), "X") for s in sections]
    return " ".join(codes) if codes else None


def archetype(structure: str | None) -> str:
    """tools/dna/bins.py structure_archetype, the same rules."""
    if not structure: return "unknown"
    d = set(structure.split())
    if "U" in d or "D" in d: return "build_drop"
    if "V" in d and "C" in d: return "verse_chorus"
    if len(d) <= 2: return "loop"
    if len(d) >= 4 and "C" not in d: return "through"
    return "loop"


def family_from_genres(genres) -> str | None:
    """lib/brain/harmony.ts familyFromGenres: the CLAP genre votes ([label, score] pairs), top vote first."""
    labels = [str(g[0]) if isinstance(g, (list, tuple)) and g else str(g) for g in (genres or [])]
    for label in labels:
        t = label.lower()
        for fam, words in FAMILY_KEYS:
            if any(w in t for w in words): return fam
    return None


def pins(vmap: dict, family: str | None, hearing: dict | None) -> dict:
    """The keys every row files under: the SOURCE record's family (the caller's, else the ears'), its tempo band
    and its structure archetype."""
    fam = family or family_from_genres(((hearing or {}).get("clap") or {}).get("genres"))
    structure = structure_of(vmap.get("sections") or [])
    return {"family": fam, "tempo": (vmap.get("source") or {}).get("bpm"), "tempo_band": tempo_band((vmap.get("source") or {}).get("bpm")),
            "structure": structure, "archetype": archetype(structure)}


def coverage(phrases: list[dict], a: float, b: float) -> float:
    """Share of [a, b] the voice sings in."""
    if b <= a: return 0.0
    return round(sum(max(0.0, min(b, p["end"]) - max(a, p["start"])) for p in phrases) / (b - a), 3)


def phrase_rows(vmap: dict, record_key: str, family: str | None, hearing: dict | None = None) -> list[dict]:
    """One row per phrase: its place against its peak (the drop or chorus it sings in, else the next one), the nearest
    section boundary and its own section, with its hook score and its pitch against the key."""
    src = vmap.get("source") or {}; beat = float(src.get("beatSec") or 0.5); bar = 4 * beat
    secs = vmap.get("sections") or []; phrases = vmap.get("phrases") or []
    peaks = [s for s in secs if s.get("label") in PEAKS]
    bounds = [s["start"] for s in secs] + ([secs[-1]["end"]] if secs else [])
    p = pins(vmap, family, hearing)
    rows = []
    for ph in phrases:
        anchor = float(ph["stressOnset"])
        inside = next((s for s in secs if s["start"] <= anchor < s["end"]), None)
        # The peak a phrase belongs to: the one it sings inside (then the distances are negative: past the one),
        # else the next one to come.
        nxt = inside if inside and inside.get("label") in PEAKS else next((s for s in peaks if s["start"] >= ph["start"] - 0.2), None)
        near = min(bounds, key=lambda t: abs(t - anchor)) if bounds else None
        rows.append({
            "record_key": record_key, "phrase": ph["id"], **{k: p[k] for k in ("family", "tempo", "tempo_band", "archetype")},
            "section": ph.get("section"), "start_sec": ph["start"], "end_sec": ph["end"],
            "dur_beats": round((ph["end"] - ph["start"]) / beat, 3), "source_bar": ph.get("sourceBar"), "source_beat": ph.get("sourceBeat"),
            "pickup_beats": ph.get("pickupBeats"),
            "peak_label": nxt["label"] if nxt else None, "peak_bar": nxt["startBar"] if nxt else None,
            "lead_in_beats": round((nxt["start"] - ph["end"]) / beat, 3) if nxt else None,
            "anchor_to_peak_beats": round((nxt["start"] - anchor) / beat, 3) if nxt else None,
            "bar_in_section": round((anchor - inside["start"]) / bar, 3) if inside else None,
            "section_bars": (inside["endBar"] - inside["startBar"]) if inside else None,
            "boundary_beats": round((anchor - near) / beat, 3) if near is not None else None,
            "hook_score": ph.get("hookScore"), "repeats": ph.get("repeats"), "is_hook": ph["id"] == vmap.get("hook"),
            "key_rel": ph.get("keyRelToSource"), "in_key": ph.get("inKey"),
            "vocal_share": coverage(phrases, inside["start"], inside["end"]) if inside else None,
        })
    return rows


def drop_row(vmap: dict, record_key: str, family: str | None, hearing: dict | None = None, name: str | None = None, identity: dict | None = None) -> dict | None:
    """The record's lead-in to its first drop (dna_vocal_drops, the row the placement rule reads): the last phrase
    that ends at most 0.2 s after the drop starts and less than 16 s before it."""
    src = vmap.get("source") or {}; beat = float(src.get("beatSec") or 0.5)
    drop = next((s for s in vmap.get("sections") or [] if s.get("label") == "drop"), None)
    if not drop: return None
    phrases = vmap.get("phrases") or []
    before = sorted([q for q in phrases if q["end"] <= drop["start"] + 0.2 and drop["start"] - q["end"] < 16], key=lambda q: -q["end"])
    last = before[0] if before else None
    lead = max(0.0, drop["start"] - last["end"]) if last else None
    p = pins(vmap, family, hearing)
    return {"key": record_key, "artist": (identity or {}).get("artist"), "title": (identity or {}).get("title") or name,
            "family": p["family"], "tempo": p["tempo"], "drop_sec": drop["start"], "phrases": len(phrases),
            "lead_in_sec": round(lead, 3) if lead is not None else None, "lead_in_beats": round(lead / beat, 3) if lead is not None else None,
            "phrase_sec": round(last["end"] - last["start"], 3) if last else None,
            "carries_through": any(drop["start"] <= q["start"] < drop["end"] for q in phrases),
            "tempo_band": p["tempo_band"], "archetype": p["archetype"], "measured_by": "worker"}


def record_key(identity: dict | None, job_id: str) -> str:
    """The key dna_heard uses when the ears named the record (lib/dna/heard.ts keyOf), else the job."""
    return f"id:{identity['key']}" if identity and identity.get("key") else f"job:{job_id}"
