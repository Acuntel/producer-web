// Tonal: chroma-based key finding (Krumhansl-Schmuckler) and per-bar chord labels.
import type { Frames } from "./dsp";

export const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
// Temperley key profiles, with the minor profile's seventh degree turned natural (b7 strong,
// leading tone weak): dance music lives in aeolian minor. On the DJ-tagged test set this beat
// Krumhansl-Schmuckler and plain Temperley by 3 tracks.
const MAJOR = [5, 2, 3.5, 2, 4.5, 4, 2, 4.5, 2, 3.5, 1.5, 4];
const MINOR = [5, 2, 3.5, 4.5, 2, 4, 2, 4.5, 3.5, 2, 4, 1.5];

export type KeyResult = { name: string; tonic: string; mode: "major" | "minor"; confidence: number; alt: string; chroma: number[] };

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

// Mean of the max-normalized frame chroma over a frame range (the shape key profiles expect).
export function meanChroma(fr: Frames, from = 0, to = fr.count, source: Float32Array = fr.chroma): number[] {
  const c = new Array(12).fill(0);
  let w = 0;
  for (let t = Math.max(0, from); t < Math.min(fr.count, to); t++) {
    for (let p = 0; p < 12; p++) c[p] += source[t * 12 + p];
    w++;
  }
  if (w > 0) for (let p = 0; p < 12; p++) c[p] /= w;
  return c;
}

// Key from the constant-Q chroma and the harmonic-salience chroma together (each votes with
// its own profile correlation); the chroma field reports the constant-Q one.
export function findKey(chroma: number[], salience?: number[]): KeyResult {
  const scores: { name: string; tonic: string; mode: "major" | "minor"; r: number }[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const rot = (prof: number[]) => prof.map((_, i) => prof[((i - tonic) % 12 + 12) % 12]);
    for (const mode of ["major", "minor"] as const) {
      const prof = rot(mode === "major" ? MAJOR : MINOR);
      const r = pearson(chroma, prof) + (salience ? pearson(salience, prof) : 0);
      scores.push({ name: `${NOTE_NAMES[tonic]} ${mode}`, tonic: NOTE_NAMES[tonic], mode, r });
    }
  }
  scores.sort((a, b) => b.r - a.r);
  const best = scores[0], second = scores[1];
  return {
    name: best.name, tonic: best.tonic, mode: best.mode,
    confidence: Math.round(Math.max(0, best.r - second.r) * 1000) / 1000,
    alt: second.name, chroma: chroma.map((v) => Math.round(v * 1000) / 1000),
  };
}

// Diatonic triads of a key (natural minor also admits the major dominant).
export function diatonicTriads(tonic: number, mode: "major" | "minor"): Set<string> {
  const tri = (root: number, minor: boolean) => NOTE_NAMES[((root % 12) + 12) % 12] + (minor ? "m" : "");
  return new Set(mode === "major"
    ? [tri(tonic, false), tri(tonic + 2, true), tri(tonic + 4, true), tri(tonic + 5, false), tri(tonic + 7, false), tri(tonic + 9, true)]
    : [tri(tonic, true), tri(tonic + 3, false), tri(tonic + 5, true), tri(tonic + 7, true), tri(tonic + 7, false), tri(tonic + 8, false), tri(tonic + 10, false)]);
}

// Chord label for a chroma vector: best of 24 triads (diatonic ones get a nudge when the key is
// known, which stops a bar flipping between C and Cm on harmonic noise), or "N" when nothing stands out.
export function chordOf(chroma: number[], diatonic?: Set<string>): string {
  let sum = 0, max = 0;
  for (const v of chroma) { sum += v; if (v > max) max = v; }
  if (sum <= 0 || max / (sum / 12) < 1.25) return "N";
  let best = "N", bestS = -Infinity;
  for (let root = 0; root < 12; root++) {
    for (const [label, third] of [["", 4], ["m", 3]] as [string, number][]) {
      const name = NOTE_NAMES[root] + label;
      const s = chroma[root] * 1.0 + chroma[(root + third) % 12] * 0.85 + chroma[(root + 7) % 12] * 0.8
        - 0.25 * (chroma[(root + (third === 4 ? 3 : 4)) % 12]) + (diatonic && diatonic.has(name) ? 0.08 * max : 0);
      if (s > bestS) { bestS = s; best = name; }
    }
  }
  return best;
}

export function chordsPerBar(fr: Frames, barSec: number, downbeatOffset: number, durationSec: number, key?: { tonic: string; mode: "major" | "minor" }): string[] {
  const diatonic = key ? diatonicTriads(NOTE_INDEX(key.tonic), key.mode) : undefined;
  const out: string[] = [];
  for (let start = downbeatOffset; start + barSec <= durationSec + 1e-6; start += barSec) {
    const a = Math.floor(start * fr.fps), b = Math.floor((start + barSec) * fr.fps);
    out.push(chordOf(meanChroma(fr, a, b), diatonic));
  }
  // A lone bar that differs from two equal neighbours is noise, not harmony.
  for (let i = 1; i + 1 < out.length; i++) if (out[i - 1] === out[i + 1] && out[i] !== out[i - 1]) out[i] = out[i - 1];
  return out;
}

// Run-length condensed progression, longest recurring stretch first, max 8 entries.
export function progressionOf(perBar: string[], max = 8): string[] {
  const runs: string[] = [];
  for (const c of perBar) if (c !== "N" && runs[runs.length - 1] !== c) runs.push(c);
  if (runs.length <= max) return runs;
  // Pick the 8-long window whose chords recur the most across the track.
  const freq = new Map<string, number>();
  for (const c of runs) freq.set(c, (freq.get(c) ?? 0) + 1);
  let bestI = 0, bestS = -1;
  for (let i = 0; i + max <= runs.length; i++) {
    let s = 0;
    for (let j = i; j < i + max; j++) s += freq.get(runs[j]) ?? 0;
    if (s > bestS) { bestS = s; bestI = i; }
  }
  return runs.slice(bestI, bestI + max);
}

export function keyFromCamelot(code: string): string {
  const m = /^(\d{1,2})\s*([AB])$/i.exec(code.trim());
  if (!m) return "";
  const n = parseInt(m[1], 10);
  if (n < 1 || n > 12) return "";
  const minors = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "Db"];
  const majors = ["B", "F#", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];
  return m[2].toUpperCase() === "A" ? `${minors[n - 1]} minor` : `${majors[n - 1]} major`;
}

export const NOTE_INDEX = (name: string) => {
  const flat: Record<string, string> = { "C#": "Db", "D#": "Eb", "Gb": "F#", "G#": "Ab", "A#": "Bb" };
  return NOTE_NAMES.indexOf(flat[name] ?? name);
};
