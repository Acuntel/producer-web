// Harmony as numbers: a roman progression in the record's key becomes a chord per bar, a voicing in a register,
// and the scale the hook walks. Roman numerals are read against the tonic (bVI is eight semitones up), the way
// the store writes them.
import { parseKey } from "../harmony";

export type Chord = { root: number; minor: boolean; dim: boolean; seventh: boolean; ninth: boolean };   // root = pitch class
export type KeyInfo = { pc: number; minor: boolean; name: string };

const DEG: Record<string, number> = { i: 0, ii: 2, iii: 4, iv: 5, v: 7, vi: 9, vii: 11 };
const ROMAN = /^(b|#)?(vii|vi|v|iv|iii|ii|i|VII|VI|V|IV|III|II|I)(.*)$/;

export function keyInfo(key: string): KeyInfo {
  const k = parseKey(key) ?? { tonic: "A", mode: "minor" as const, pc: 9 };
  return { pc: k.pc, minor: k.mode === "minor", name: `${k.tonic} ${k.mode}` };
}

/** One roman token ("bVI", "i7", "IVmaj7", "ii9", "v°") as a chord in the key, or null. */
export function romanChord(token: string, keyPc: number): Chord | null {
  const m = ROMAN.exec(token.trim()); if (!m) return null;
  const acc = m[1] === "b" ? -1 : m[1] === "#" ? 1 : 0;
  const deg = DEG[m[2].toLowerCase()]; if (deg === undefined) return null;
  const rest = m[3].toLowerCase();
  const lower = m[2] === m[2].toLowerCase();
  return { root: (((keyPc + deg + acc) % 12) + 12) % 12, minor: lower, dim: /dim|°|o$/.test(rest), seventh: /7/.test(rest), ninth: /9/.test(rest) };
}

/** A progression string ("i-bVI-bIII-bVII", "I V vi IV", "i9 (one chord)") as chords, runs collapsed, eight at most. */
export function parseProgression(p: string, keyPc: number): Chord[] {
  const body = p.replace(/\(.*?\)/g, " ").replace(/then.*$/i, " ");
  const out: Chord[] = [];
  for (const tok of body.split(/[\s\-–,>]+/).filter(Boolean)) {
    const c = romanChord(tok, keyPc); if (!c) continue;
    const last = out[out.length - 1];
    if (last && last.root === c.root && last.minor === c.minor) continue;
    out.push(c); if (out.length >= 8) break;
  }
  return out;
}

/** Eight bars of harmony: 1, 2 and 4 chords divide the bars evenly, 3 is 3+3+2, more are one bar each and cycle. */
export function chordsPerBar(chords: Chord[], bars = 8): Chord[] {
  if (!chords.length) return Array.from({ length: bars }, () => ({ root: 0, minor: true, dim: false, seventh: false, ninth: false }));
  const n = chords.length;
  if (bars % n === 0 && n <= 4) return Array.from({ length: bars }, (_, b) => chords[Math.floor(b / (bars / n))]);
  if (n === 3) return Array.from({ length: bars }, (_, b) => chords[b < 3 ? 0 : b < 6 ? 1 : 2]);
  return Array.from({ length: bars }, (_, b) => chords[b % n]);
}

/** The pitch classes of a chord, root first. */
export function chordPcs(c: Chord, color = false): number[] {
  const third = c.minor || c.dim ? 3 : 4, fifth = c.dim ? 6 : 7;
  const pcs = [0, third, fifth];
  if (c.seventh || color) pcs.push(c.minor || c.dim ? 10 : 11);
  if (c.ninth) pcs.push(14);
  return pcs.map((x) => (c.root + x) % 12);
}

/** A voicing near `center`: each chord tone placed within a fifth of the center, sorted, doubled root dropped. */
export function voice(c: Chord, center = 64, color = false): number[] {
  const notes = chordPcs(c, color).map((pc) => { let m = center - 6 + ((((pc - (center - 6)) % 12) + 12) % 12); if (m > center + 6) m -= 12; return m; });
  return [...new Set(notes)].sort((a, b) => a - b);
}

/** A root in a register: the pitch class placed in [lo, lo + 11]. */
export const rootIn = (pc: number, lo: number) => lo + ((((pc - lo) % 12) + 12) % 12);

export const scalePcs = (k: KeyInfo): number[] => (k.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]).map((x) => (k.pc + x) % 12);

/** The scale notes in [lo, hi], ascending. */
export function scaleNotes(k: KeyInfo, lo: number, hi: number): number[] {
  const pcs = new Set(scalePcs(k)); const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (pcs.has(((m % 12) + 12) % 12)) out.push(m);
  return out;
}

const NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
export const keyName = (pc: number, minor: boolean) => `${NAMES[((pc % 12) + 12) % 12]} ${minor ? "minor" : "major"}`;
