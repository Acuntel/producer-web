// The score of a slot (masterprompt 5.5): H harmonic fit, K in-scale ratio, R rhythmic fit, C stretch and shift cost,
// M masking, S section-role fit, B boundary fit, E energy fit, G "the same kind of moment". Each is 0 to 1 except C
// (over 1 fails). The rule score weighs them; once Brady has given enough verdicts, a logistic P(in) fitted to them
// takes over (lib/learn/placement.ts). Tone-free and browser-free.
import type { Song } from "../types";
import type { Fit } from "../fit";
import { fitCost } from "../fit";
import { parseKey } from "../harmony";
import type { Instance, PhraseRole, PlacePhrase, Placed, SectionRole, SlotKind, Terms } from "./types";
import { chromaUnder, isLead, isMid, notesIn } from "./geometry";

/** Beta counts for "a <phrase role> in a <section role> is kept", from the rules: the hook goes in the drop, a verse
 *  line over the break, a tag in the build. Every verdict adds to them (lib/learn/placement.ts). */
export const RULE_PRIOR: Record<PhraseRole, Partial<Record<SectionRole, [number, number]>>> = {
  hook: { drop: [8, 2], break: [4, 4], build: [3, 5], groove: [3, 5] },
  verse: { break: [6, 2], groove: [5, 3], drop: [3, 5], build: [3, 5] },
  tag: { build: [5, 3], drop: [4, 4], break: [3, 4] },
  adlib: { drop: [4, 4], build: [4, 4] },
};
export type RoleCounts = (role: PhraseRole, sec: SectionRole) => [number, number];
export const ruleCounts: RoleCounts = (r, s) => RULE_PRIOR[r]?.[s] ?? [2, 4];

const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
const cos = (a: number[], b: number[]) => { let d = 0, x = 0, y = 0; for (let i = 0; i < 12; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return x && y ? d / Math.sqrt(x * y) : 0; };
const roll = (c: number[], s: number) => c.map((_, i) => c[(((i - s) % 12) + 12) % 12]);

/** H over shifts: the cosine of the phrase's chroma (moved s semitones) with the section's, less 0.05 per semitone
 *  (AutoMashUpper). Returns the best shift too. */
export function harmonic(phrase: number[] | null, section: number[], prefer: number): { H: number; shift: number } {
  if (!phrase || section.every((x) => x === 0)) return { H: 0.5, shift: prefer };
  let best = { H: -1, shift: prefer };
  for (let s = -3; s <= 3; s++) {
    const h = cos(roll(phrase, s), section) - 0.05 * Math.abs(s) + (s === prefer ? 0.05 : 0);
    if (h > best.H + 1e-9) best = { H: h, shift: s };
  }
  return { H: Math.max(0, Math.min(1, best.H)), shift: best.shift };
}

/** K: the share of the sung notes (moved by the fit) inside the song key's scale. */
export function inScale(midis: number[], semitones: number, key: string): number {
  const k = parseKey(key); if (!k || !midis.length) return 0.6;
  const scale = (k.mode === "minor" ? MINOR : MAJOR).map((x) => (x + k.pc) % 12);
  return midis.filter((m) => scale.includes((((Math.round(m + semitones)) % 12) + 12) % 12)).length / midis.length;
}

/** R: the share of the phrase's word onsets, stretched onto the grid from its anchor, within 25 ms of a 16th. */
export function rhythmic(p: PlacePhrase, anchorSrc: number, anchorBeat: number, bpm: number, rate: number): number {
  const others = p.onsets.filter((t) => Math.abs(t - anchorSrc) > 0.01);
  if (!others.length) return 0.8;
  const beatSec = 60 / bpm;
  const ok = others.filter((t) => { const beat = anchorBeat + ((t - anchorSrc) / rate) / beatSec; const off = Math.abs(beat * 4 - Math.round(beat * 4)) / 4; return off * beatSec <= 0.025; }).length;
  return ok / others.length;
}

export type ScoreCtx = { song: Song; secs: Placed[]; fit: Fit; roleCounts: RoleCounts; phrases: PlacePhrase[] };

/** Every term for one slot. `anchorSrc` is the source time the slot anchors (the stress, or the last word). */
export function termsFor(kind: SlotKind, p: PlacePhrase, target: number, ins: Instance[], c: ScoreCtx): Terms {
  const { song, secs, fit } = c;
  const bpm = song.bpm, first = ins[0];
  const tsec = secs[target];
  const from = secs[first.hostIndex].startBeat + first.noteBeat, to = from + first.lengthBeats;
  const H = harmonic(p.chroma, chromaUnder(song, secs, from, to), fit.semitones).H;
  const K = inScale(p.midis, fit.semitones, song.key);
  const anchorSrc = first.cut[0] + first.anchorInCut;
  const R = rhythmic(p, anchorSrc, first.anchorBeat, bpm, fit.rate);
  const C = fitCost(fit);
  // M: parts in the voice's band under it (leads are dipped by the placement, so pads, chords and stabs count).
  let mids = 0;
  for (const t of song.tracks) if (isMid(t) && !isLead(t) && secs.some((s) => notesIn(t, s, from, to).length)) mids++;
  const M = Math.max(0, 1 - 0.2 * mids);
  const [a, b] = c.roleCounts(p.role, tsec.role);
  const S = a / (a + b);
  // B: on a 4-bar boundary, a length near 1, 2, 4 or 8 bars, and never sung into the silent gap before a drop.
  const phraseStart = (beat: number) => { const sec = secs.find((q) => beat >= q.startBeat - 1e-6 && beat < q.startBeat + q.beats - 1e-6); return sec ? Math.abs(((beat - sec.startBeat) % 16 + 16) % 16) < 1e-3 : false; };
  const onBoundary = ins.every((x) => phraseStart(x.anchorBeat)) ? 1 : kind === "drop-chop" ? 0.7 : 0.5;
  const bars = first.lengthBeats / 4;
  const nearest = [1, 2, 4, 8].reduce((q, n) => (Math.abs(n - bars) < Math.abs(q - bars) ? n : q), 1);
  const lengthFit = Math.max(0, 1 - Math.max(0, Math.abs(nearest - bars) - 0.125) / 2);
  let gap = 0;
  for (const x of ins) {
    const a0 = secs[x.hostIndex].startBeat + x.noteBeat, a1 = a0 + x.lengthBeats;
    for (const s of secs) if (s.fill === "cut") { const g0 = s.startBeat + s.beats - 0.5, g1 = s.startBeat + s.beats; if (a1 > g0 && a0 < g1) gap = Math.max(gap, Math.min(a1, g1) - Math.max(a0, g0)); }
  }
  const B = Math.max(0, Math.min(1, 0.5 * onBoundary + 0.5 * lengthFit - (gap > 0 ? 0.3 * Math.min(1, gap / 0.5) : 0)));
  // E: the loudest, most repeated phrase goes in the highest-energy section.
  const prom = (x: PlacePhrase) => x.rmsDb / 18 + x.hookScore + Math.log2(1 + x.repeats) * 0.3;
  const pr = c.phrases.filter((x) => prom(x) <= prom(p)).length / Math.max(1, c.phrases.length);
  const sr = secs.filter((s) => s.energy <= tsec.energy).length / Math.max(1, secs.length);
  const E = 1 - Math.abs(pr - sr);
  // G: the same kind of moment, by the source's section label until CLAP embeddings ride on the vocal map.
  const same: Record<string, SectionRole[]> = { drop: ["drop"], chorus: ["drop"], verse: ["break", "groove"], build: ["build"], break: ["break"], intro: ["intro", "break"], outro: ["outro", "break"] };
  const G = p.section ? (same[p.section]?.includes(tsec.role) ? 1 : 0.4) : 0.6;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  return { H: r3(H), K: r3(K), R: r3(R), C: r3(C), M: r3(M), S: r3(S), B: r3(B), E: r3(E), G: r3(G) };
}

/** The rule score: every term weighed, C as a cost. */
export const RULE_WEIGHTS: Terms = { H: 0.2, K: 0.1, R: 0.1, C: 0.1, M: 0.1, S: 0.15, B: 0.1, E: 0.1, G: 0.05 };
export function ruleScore(t: Terms): number {
  if (t.C > 1) return 0;
  const w = RULE_WEIGHTS;
  return Math.round((w.H * t.H + w.K * t.K + w.R * t.R + w.C * (1 - t.C) + w.M * t.M + w.S * t.S + w.B * t.B + w.E * t.E + w.G * t.G) * 1000) / 1000;
}
