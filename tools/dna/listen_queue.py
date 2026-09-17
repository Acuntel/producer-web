"""The studio's own ears on the famous records it has not heard: public copies only, nothing kept but the DNA.

For the top records by fame that have no dna_heard row, in order: find a public copy by name (SoundCloud search,
as the worker does), analyze it locally (tempo, key, structure, best bars), separate the stems, hear them (drum grids,
bass line, chords, descriptors), fold the hearing into the DNA fields (the same rules as the heard route, in Python)
and upsert one dna_heard row. The audio and the stems are deleted as soon as the row is written.

  DYLD_LIBRARY_PATH=/opt/homebrew/lib <worker-venv>/bin/python tools/dna/listen_queue.py [--limit N] [--min-fame 0.5]
Runs from the worker environment (demucs, librosa, the CLAP model). Slow on purpose: about a minute a record.
"""
from __future__ import annotations

import json, os, shutil, subprocess, sys, tempfile, time
from pathlib import Path

import pandas as pd
import psycopg

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "worker")); sys.path.insert(0, str(Path(__file__).resolve().parent))
from harmony import parse_chord, to_roman, collapse_runs, harmony_class  # noqa: E402  (tools/dna)
from util import norm_artist, norm_title  # noqa: E402

NOTE_PC = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def key_of(name: str | None):
    if not name: return None, None
    parts = name.split(); pc = NOTE_PC.get(parts[0]); mode = "minor" if len(parts) > 1 and parts[1].lower().startswith("min") else "major"
    return pc, mode


def grid16(g): return g.replace("x", "X").replace("g", ".") if isinstance(g, str) and len(g) == 16 else None
def bass16(e): return "".join("X." if c == "X" else ".." for c in e) if isinstance(e, str) and len(e) == 8 else None


def structure_codes(blocks: list[dict]) -> str | None:
    e = [float(b.get("energy", 0)) for b in blocks]
    if len(e) < 2: return None
    codes = []
    for i, v in enumerate(e):
        prev = e[i - 1] if i else 0; nxt = e[i + 1] if i + 1 < len(e) else v
        if i == 0 and v < 0.6: codes.append("I")
        elif i == len(e) - 1 and v < 0.6: codes.append("O")
        elif v >= 0.85: codes.append("D")
        elif v < 0.5 and prev >= 0.7: codes.append("K")
        elif nxt > v + 0.15 and v < 0.85: codes.append("B")
        else: codes.append("V")
    return collapse_runs(codes, 32)


def dna_row(name: str, artist: str, title: str, facts: dict, hearing: dict, fame: float) -> dict:
    pc, mode = key_of(facts.get("key"))
    chords = hearing.get("chords") or []
    roman = [to_roman(c["root_pc"], c["quality"], pc) for c in (parse_chord(x) for x in chords) if c] if pc is not None else []
    progression = collapse_runs(roman) if roman else None
    grids = hearing.get("drumGrids") or {}; bass = hearing.get("bass") or {}; clap = hearing.get("clap") or {}
    blocks = facts.get("blocks") or []
    genres = [g[0] if isinstance(g, (list, tuple)) else str(g) for g in (clap.get("genres") or [])]
    from families import family_from_genres
    return {"key": f"name:{norm_artist(artist)} {norm_title(title)}".strip(), "title": title, "artist": artist, "artist_norm": norm_artist(artist), "title_norm": norm_title(title),
            "tempo": facts.get("bpm"), "key_name": facts.get("key"), "bars": facts.get("bars"), "energy_contour": json.dumps([round(float(b.get("energy", 0)), 2) for b in blocks][:64]),
            "hearing": json.dumps({k: v for k, v in hearing.items() if k not in ("embeddings",)})[:200000],
            "key_pc": pc, "mode": mode, "progression": progression, "harmony_class": harmony_class(progression) if progression else None, "chords": " ".join(chords) or None,
            "structure": structure_codes(blocks), "kick_grid": grid16(grids.get("kick")), "snare_grid": grid16(grids.get("snare")), "hat_grid": grid16(grids.get("hat")),
            "bass_rhythm": bass16(bass.get("eighthRhythm")), "bass_root": bass.get("root"), "energy": round(sum(float(b.get("energy", 0)) for b in blocks) / max(len(blocks), 1), 3) if blocks else None,
            "family": family_from_genres(genres), "descriptors": ", ".join(d[0] if isinstance(d, (list, tuple)) else str(d) for d in (clap.get("descriptors") or [])[:4]) or None}


def main() -> None:
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 40
    min_fame = float(sys.argv[sys.argv.index("--min-fame") + 1]) if "--min-fame" in sys.argv else 0.5
    import analysis, hearing as hearing_mod   # the worker's modules
    fame = pd.read_parquet(ROOT / "data" / "dna" / "fame.parquet", columns=["artist_norm", "title_norm", "artist", "title", "fame"])
    fame = fame[fame["fame"] >= min_fame].sort_values("fame", ascending=False)
    conn = psycopg.connect((ROOT / "data" / "dna" / "PG_DSN").read_text().strip(), autocommit=True); cur = conn.cursor()
    cur.execute("select artist_norm, title_norm from public.dna_heard"); heard = {(a, t) for a, t in cur.fetchall()}
    todo = [r for r in fame.itertuples(index=False) if (r.artist_norm, r.title_norm) not in heard][:limit]
    print(f"[listen] {len(fame):,} famous records, {len(heard):,} heard, taking {len(todo)}", flush=True)
    done = 0
    for r in todo:
        t0 = time.time(); tmp = tempfile.mkdtemp(prefix="producer-listen-")
        try:
            q = f"{r.artist} {r.title}"
            out = os.path.join(tmp, "dl.%(ext)s")
            subprocess.run(["yt-dlp", "-q", "-f", "bestaudio/best", "--no-playlist", "--max-downloads", "1", "--no-update", "--match-filter", "duration <? 720", "-o", out, f"scsearch1:{q}"], capture_output=True, text=True, timeout=300)
            files = [f for f in os.listdir(tmp) if f.startswith("dl.")]
            if not files: print(f"[listen] {q}: no public copy", flush=True); continue
            wav = os.path.join(tmp, "src.wav"); analysis.ffmpeg_to_wav(os.path.join(tmp, files[0]), wav, 480)
            facts = analysis.analyze(wav)
            stems = analysis.separate(wav, os.path.join(tmp, "sep"))
            heard_json = hearing_mod.hear(wav, stems, facts)
            row = dna_row(q, r.artist, r.title, facts, heard_json, float(r.fame))
            cols = list(row.keys())
            cur.execute(f"insert into public.dna_heard ({', '.join(cols)}, heard_count) values ({', '.join(['%s'] * len(cols))}, 1) on conflict (key) do update set " + ", ".join(f"{c} = excluded.{c}" for c in cols if c != "key"), [row[c] for c in cols])
            done += 1
            print(f"[listen] {q}: {facts.get('bpm')} BPM {facts.get('key')}, progression {row['progression']}, kick {row['kick_grid']} in {time.time() - t0:.0f}s", flush=True)
        except Exception as e:
            print(f"[listen] {r.artist} {r.title}: {str(e)[:120]}", flush=True)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)   # nothing kept but the row
    print(f"[listen] done: {done} records heard")


if __name__ == "__main__":
    main()
