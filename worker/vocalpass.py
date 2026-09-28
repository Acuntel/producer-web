"""The vocal pass every stems and learn job runs once the voice is separated: the vocal map (worker/vocalmap.py),
the rows that teach placement (worker/vocalrows.py), and the lyric lines the listening pass reports, taken from the
map instead of a second transcription. Any failure is a note in the result, never a failed job."""
from __future__ import annotations
import json, os
import supa, vocalmap, vocalrows
from models import Job


def lines_of(vmap: dict) -> dict:
    """The listening pass's lyric lines ({at, text}), one per phrase that has words."""
    lines = [{"at": round(p["start"], 1), "text": p["text"]} for p in vmap.get("phrases") or [] if p.get("text")]
    return {"language": (vmap.get("words") or {}).get("language"), "lines": lines[:60], "from": "vocalMap"}


def build(vocals_path: str, mix_path: str, facts: dict, tmp: str, base: str | None) -> tuple[dict | None, dict]:
    """(vocal map or None, notes). base is the owner's stems folder, or None for a learn job (numbers only). The rows
    are written after the listening pass (write_rows), which knows the family when the caller did not."""
    notes: dict = {}
    try:
        vmap = vocalmap.build(vocals_path, mix_path, facts)
    except Exception as e:
        print("vocal map failed", e, flush=True)
        return None, {"vocalMapError": str(e)[:200]}
    if base:
        try:
            path = os.path.join(tmp, "vocal-map.json")
            with open(path, "w") as f: json.dump(vmap, f)
            notes["vocalMapPath"] = supa.upload(f"{base}/vocal-map.json", path, "application/json")
        except Exception as e: print("vocal map upload failed", e, flush=True)
    return vmap, notes


def write_rows(job: Job, vmap: dict | None, ident: dict | None, name: str, hearing: dict | None) -> dict:
    """Phrase rows and the lead-in row, filed under the SOURCE record's family (the caller's, else the ears')."""
    if not vmap: return {"phrases": 0, "written": False}
    key = vocalrows.record_key(ident, job.job_id)
    family = job.source.family
    rows = vocalrows.phrase_rows(vmap, key, family, hearing)
    drop = vocalrows.drop_row(vmap, key, family, hearing, name, ident)
    ok_rows = supa.upsert("dna_vocal_phrases", rows, "record_key,phrase") if rows else False
    ok_drop = supa.upsert("dna_vocal_drops", [drop], "key") if drop else False
    pins = vocalrows.pins(vmap, family, hearing)
    return {"key": key, "phrases": len(rows), "written": bool(ok_rows), "leadIn": drop.get("lead_in_beats") if drop else None, "leadInWritten": bool(ok_drop),
            "family": pins["family"], "tempoBand": pins["tempo_band"], "archetype": pins["archetype"]}
