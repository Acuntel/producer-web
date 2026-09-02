// Symbolic harmony: the song knows its own notes, so key and chords per bar
// are exact for our own renders. Used by the ears when hearing the app's work.
import type { Song, Section, Note } from "./types";
import { isMelodic } from "./types";
import { patternFor } from "./pattern";

const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const FLAT_TO_PC: Record<string, number> = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };

export function parseKey(key: string): { tonic: string; mode: "major" | "minor"; pc: number } | null {
  const m = key.trim().match(/^([A-Ga-g])([#b]?)\s*(maj|major|min|minor|m)?/);
  if (!m) return null;
  const pc = FLAT_TO_PC[`${m[1].toUpperCase()}${m[2] ?? ""}`];
  if (pc === undefined) return null;
  const mode = /^(min|minor|m)$/.test(m[3] ?? "") ? "minor" : "major";
  return { tonic: NAMES[pc], mode, pc };
}

export const keyName = (k: { tonic: string; mode: "major" | "minor" }) => `${k.tonic} ${k.mode}`;

// Chord templates over pitch classes, root-relative.
const TEMPLATES: [string, number[]][] = [
  ["", [0, 4, 7]], ["m", [0, 3, 7]], ["7", [0, 4, 7, 10]], ["m7", [0, 3, 7, 10]], ["maj7", [0, 4, 7, 11]],
  ["sus2", [0, 2, 7]], ["sus4", [0, 5, 7]], ["dim", [0, 3, 6]], ["m9", [0, 3, 7, 10, 2]], ["add9", [0, 4, 7, 2]], ["5", [0, 7]],
];

// Weighted pitch-class profile of every melodic note sounding in a bar.
function barProfile(song: Song, sec: Section, bar: number): Float64Array {
  const prof = new Float64Array(12);
  const b0 = bar * 4, b1 = b0 + 4;
  const anySolo = song.tracks.some((t) => t.solo && !t.mute);
  for (const tr of song.tracks) {
    if (!isMelodic(tr.role) || tr.mute || (anySolo && !tr.solo) || !sec.active.includes(tr.id)) continue;
    const notes: Note[] = patternFor(tr, sec, bar, song.humanize.seed);
    const loop = Math.max(0.25, tr.loopBeats);
    const weight = ["bass", "sub"].includes(tr.role) ? 1.4 : ["chords", "pad", "stab"].includes(tr.role) ? 1.2 : 0.8;
    for (let r = 0; r * loop < b1; r++) {
      for (const n of notes) {
        const s = r * loop + n[1], e = s + n[2];
        if (e <= b0 || s >= b1) continue;
        const dur = Math.min(e, b1) - Math.max(s, b0);
        prof[(((n[0] + (tr.transpose ?? 0)) % 12) + 12) % 12] += dur * weight * (n[3] / 100);
      }
    }
  }
  return prof;
}

export function chordName(prof: Float64Array): string | null {
  const total = prof.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let best: { name: string; score: number } | null = null;
  for (let root = 0; root < 12; root++) {
    for (const [suffix, iv] of TEMPLATES) {
      let inside = 0;
      for (const i of iv) inside += prof[(root + i) % 12];
      const outside = total - inside;
      const score = inside / total - 0.6 * (outside / total) + (prof[root] / total) * 0.5 - iv.length * 0.01;
      if (!best || score > best.score) best = { name: `${NAMES[root]}${suffix}`, score };
    }
  }
  return best && best.score > 0.25 ? best.name : null;
}

export function chordsForSection(song: Song, sec: Section, bars = sec.bars): string[] {
  const out: string[] = [];
  for (let b = 0; b < bars; b++) out.push(chordName(barProfile(song, sec, b)) ?? "-");
  return out;
}

export function condense(perBar: string[], max = 8): string[] {
  const out: string[] = [];
  for (const c of perBar) if (c !== "-" && out[out.length - 1] !== c) out.push(c);
  return out.slice(0, max);
}
