// The human process as ops (docs/MASTERPROMPT_SMOOTH.md section 1). What a producer was watched doing,
// in order: name the record and take its tempo before anything else, chop a phrase off its vocal, loop
// the chop alone and sing it back, bring the beat to the vocal at the vocal's tempo, go to the next
// candidate before polishing, and pull everything down to hear the seed again.
//
// These are the pure halves: edits on the SongDoc and the level map for a listen. What needs the browser
// (a lookup, a cut, the audio graph) resolves in hooks/useRitual, the way "slice" resolves before ops apply.
import type { Song, Track, AudioClip, Source, Note } from "./types";
import { isDrum } from "./types";

export type RitualOp =
  | ({ op: "source" } & Source)
  | { op: "chop"; clip: AudioClip; beats: number; track?: string }
  | { op: "alone"; track?: string }
  | { op: "beat"; bpm?: number }
  | { op: "next"; clip: AudioClip; beats: number; track?: string }
  | { op: "down"; keep?: string };   // a listen on the graph, never an edit of the record

export const SEED_ID = "chop";
export const DOWN_DB = 10;   // the mute-to-listen we watched: bass -11, chords -13, hats -8, snare -6

const clamp01 = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/** The seed: the chop the record is built under. A named track wins, then the chop, then the first audio loop. */
export function seedOf(s: Song, id?: string | null): Track | undefined {
  const named = id ? s.tracks.find((t) => t.id === id || t.name.toLowerCase() === id.toLowerCase()) : undefined;
  return named ?? s.tracks.find((t) => t.id === SEED_ID) ?? s.tracks.find((t) => t.role === "audio" && !!t.clip && !t.clip.oneShot);
}

export function applyRitualOp(s: Song, o: RitualOp): boolean {
  switch (o.op) {
    case "source": {
      if (typeof o.name !== "string" || !o.name.trim() || typeof o.bpm !== "number" || !Number.isFinite(o.bpm) || o.bpm < 60 || o.bpm > 200) return false;
      const bpm = Math.round(o.bpm * 10) / 10;
      s.source = { name: o.name.trim().slice(0, 80), bpm, tempoConfidence: clamp01(o.tempoConfidence), from: o.from ?? "said", alt: typeof o.alt === "number" ? o.alt : null,
        ...(typeof o.key === "string" && o.key.trim() ? { key: o.key.trim(), keyConfidence: clamp01(o.keyConfidence) } : {}) };
      s.bpm = bpm;
      if (s.source.key) s.key = s.source.key;
      return true;
    }
    case "chop": case "next": return placeSeed(s, o.clip, o.beats, o.track);
    case "alone": {
      const t = seedOf(s, o.track);
      if (!t) return false;
      for (const x of s.tracks) x.solo = false;
      t.solo = true; t.mute = false;
      s.loop ??= loopOn(s, t);
      return true;
    }
    case "beat": return buildBeat(s, o.bpm);
    default: return false;   // "down" never edits the record: the studio plays it on the graph
  }
}

// The chop, or the next candidate, as the seed: a loop cut on the source grid, warped from the tempo it was cut at.
// A seed already there keeps its fader, inserts and mixer state and only changes what it plays.
function placeSeed(s: Song, clip: AudioClip, beats: number, trackId?: string): boolean {
  if (!clip || typeof clip.clipId !== "string" || !clip.clipId || typeof beats !== "number" || !(beats > 0)) return false;
  const n = Math.max(1, Math.min(64, Math.round(beats)));
  const loop: AudioClip = { ...clip, oneShot: false, warp: !!clip.bpm, startSec: clip.startSec ?? 0, lengthBeats: n };
  let t = seedOf(s, trackId);
  if (!t) {
    t = { id: trackId ?? SEED_ID, name: "Chop", role: "audio", volume: -3, duck: false, mute: false, solo: false, loopBeats: n, notes: [], clip: loop, fx: { filter: { type: "highpass", cutoff: 120 } } };
    s.tracks.push(t);
  } else { t.clip = loop; t.loopBeats = n; t.role = "audio"; }
  for (const sec of s.sections) if (!sec.active.includes(t.id)) sec.active.push(t.id);
  // The phrase runs on repeat the moment it is cut: the transport loops exactly its bars, so it starts within one
  // phrase and every trip around is one pass of the idea.
  s.loop = loopOn(s, t);
  return true;
}

// The seed's own bars, from the top of the first section it plays in (bar numbers count from 1 across the arrangement).
function loopOn(s: Song, t: Track): Song["loop"] {
  let bar = 1;
  for (const id of s.arrangement) {
    const sec = s.sections.find((x) => x.id === id); if (!sec) continue;
    if (sec.active.includes(t.id)) return { startBar: bar, endBar: bar + Math.max(1, Math.min(sec.bars, Math.round(t.loopBeats / 4))) - 1 };
    bar += sec.bars;
  }
  return null;
}

const PC: Record<string, number> = { c: 0, "c#": 1, db: 1, d: 2, "d#": 3, eb: 3, e: 4, f: 5, "f#": 6, gb: 6, g: 7, "g#": 8, ab: 8, a: 9, "a#": 10, bb: 10, b: 11 };
const rootMidi = (key: string) => 36 + (PC[key.trim().split(/\s+/)[0]?.toLowerCase() ?? ""] ?? 9);
const steps = (grid: string, midi: number): Note[] => [...grid].flatMap((ch, i) => (ch === "X" || ch === "x" ? [[midi, i * 0.25, 0.125, ch === "X" ? 120 : 92] as Note] : []));

/** The first drums and bass, at the source record's tempo. With no source there is no beat: a default tempo
 *  is exactly what the first law forbids, so the op is refused and the studio asks for the record. */
function buildBeat(s: Song, bpm?: number): boolean {
  const tempo = typeof bpm === "number" && bpm >= 60 && bpm <= 200 ? bpm : s.source?.bpm;
  if (!tempo) return false;
  s.bpm = Math.round(tempo * 10) / 10;
  const root = rootMidi(s.source?.key ?? s.key);
  // Four on the floor where dance records live; a broken hip hop pocket below it.
  const floor = tempo >= 108;
  const parts: Track[] = [
    { id: "kick", name: "Kick", role: "kick", volume: 0, duck: false, loopBeats: 4, notes: steps(floor ? "X...X...X...X..." : "X.....x...X.....", 36) },
    { id: "clap", name: "Clap", role: "clap", volume: -4, duck: false, loopBeats: 4, notes: steps("....X.......X...", 39) },
    { id: "hat", name: "Hats", role: "hat", volume: -9, duck: true, loopBeats: 4, notes: steps(floor ? "..x...x...x...x." : "x.x.x.x.x.x.x.x.", 42) },
    { id: "bass", name: "Bass", role: "bass", volume: -3, duck: true, loopBeats: 4, notes: floor
      ? [[root, 0.5, 0.4, 110], [root, 1.5, 0.4, 100], [root, 2.5, 0.4, 106], [root + 12, 3.5, 0.3, 96]]
      : [[root, 0, 0.9, 112], [root, 1.5, 0.4, 96], [root + 7, 2.5, 1.2, 104]] },
  ];
  for (const p of parts) {
    const have = s.tracks.find((t) => t.id === p.id);
    if (have) { have.notes = p.notes; have.loopBeats = p.loopBeats; have.mute = false; }
    else s.tracks.push({ ...p, mute: false, solo: false });
  }
  // The beat comes to the vocal: everything plays together now, the seed included.
  for (const t of s.tracks) t.solo = false;
  for (const sec of s.sections) for (const p of parts) if (!sec.active.includes(p.id)) sec.active.push(p.id);
  return true;
}

/** Mute to listen: every track but one pulled down (in the fader's own dB, before the role trim), the one kept where it is. */
export function downLevels(s: Song, keep?: string | null, db = DOWN_DB): { keep: string | null; levels: Record<string, number> } {
  const kept = seedOf(s, keep) ?? s.tracks.find((t) => !isDrum(t.role)) ?? s.tracks[0];
  const levels: Record<string, number> = {};
  for (const t of s.tracks) levels[t.id] = t.id === kept?.id ? t.volume : t.volume - db;
  return { keep: kept?.id ?? null, levels };
}

/** Back to the written faders. */
export const upLevels = (s: Song): Record<string, number> => Object.fromEntries(s.tracks.map((t) => [t.id, t.volume]));
