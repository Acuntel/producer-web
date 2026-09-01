// Tonal: chroma-based key finding (Krumhansl-Schmuckler) and per-bar chord labels.
import type { Frames } from "./dsp";

export const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

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

// Energy- and tonalness-weighted mean chroma over a frame range.
export function meanChroma(fr: Frames, from = 0, to = fr.count): number[] {
  const c = new Array(12).fill(0);
  let w = 0;
  for (let t = Math.max(0, from); t < Math.min(fr.count, to); t++) {
    let mx = 0, sum = 0;
    for (let p = 0; p < 12; p++) { const v = fr.chroma[t * 12 + p]; sum += v; if (v > mx) mx = v; }
    if (sum <= 0) continue;
    const peaky = Math.max(0, mx / (sum / 12) - 1.5); // flat chroma = noise = little weight
    const e = Math.sqrt(fr.energy[t] + 1e-9) * peaky;
    for (let p = 0; p < 12; p++) c[p] += fr.chroma[t * 12 + p] * e;
    w += e;
  }
  if (w > 0) for (let p = 0; p < 12; p++) c[p] /= w;
  return c;
}

export function findKey(chroma: number[]): KeyResult {
  const scores: { name: string; tonic: string; mode: "major" | "minor"; r: number }[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const rot = (prof: number[]) => prof.map((_, i) => prof[((i - tonic) % 12 + 12) % 12]);
    scores.push({ name: `${NOTE_NAMES[tonic]} major`, tonic: NOTE_NAMES[tonic], mode: "major", r: pearson(chroma, rot(MAJOR)) });
    scores.push({ name: `${NOTE_NAMES[tonic]} minor`, tonic: NOTE_NAMES[tonic], mode: "minor", r: pearson(chroma, rot(MINOR)) });
  }
  scores.sort((a, b) => b.r - a.r);
  const best = scores[0], second = scores[1];
  return {
    name: best.name, tonic: best.tonic, mode: best.mode,
    confidence: Math.round(Math.max(0, best.r - second.r) * 1000) / 1000,
    alt: second.name, chroma: chroma.map((v) => Math.round(v * 1000) / 1000),
  };
}

// Chord label for a chroma vector: best of 24 triads, or "N" when nothing stands out.
export function chordOf(chroma: number[]): string {
  let sum = 0, max = 0;
  for (const v of chroma) { sum += v; if (v > max) max = v; }
  if (sum <= 0 || max / (sum / 12) < 1.6) return "N";
  let best = "N", bestS = -Infinity;
  for (let root = 0; root < 12; root++) {
    for (const [label, third] of [["", 4], ["m", 3]] as [string, number][]) {
      const s = chroma[root] * 1.0 + chroma[(root + third) % 12] * 0.85 + chroma[(root + 7) % 12] * 0.8
        - 0.25 * (chroma[(root + (third === 4 ? 3 : 4)) % 12]);
      if (s > bestS) { bestS = s; best = NOTE_NAMES[root] + label; }
    }
  }
  return best;
}

export function chordsPerBar(fr: Frames, barSec: number, downbeatOffset: number, durationSec: number): string[] {
  const out: string[] = [];
  for (let start = downbeatOffset; start + barSec <= durationSec + 1e-6; start += barSec) {
    const a = Math.floor(start * fr.fps), b = Math.floor((start + barSec) * fr.fps);
    out.push(chordOf(meanChroma(fr, a, b)));
  }
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
