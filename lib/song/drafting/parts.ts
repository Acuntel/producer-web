// The harmony of a draft: a pad holding the chords, stabs or keys answering the bass, and an arp where the
// lane uses one. Each takes the lane's synth numbers and a seeded rhythm cell.
import type { Track, Note, SynthParams, Fx } from "../types";
import type { Recipe, PartDesc } from "./recipes";
import { voice, chordPcs, type Chord } from "./theory";
import { thompson, chance, pick, between, type Rng } from "./choose";
import { flat } from "./drums";

const STAB_CELLS = ["..x...x...x...x.", "...x..x....x..x.", "..x.....x.x.....", "x.....x...x.....", ".......x.......x", "..x..x....x..x.."];
const KEY_CELLS = ["x.......x.......", "..x..x....x..x..", "......x.....x...", "x..x..x...x..x.."];

const spans = (perBar: Chord[]) => { const out: { c: Chord; at: number; bars: number }[] = []; perBar.forEach((c, b) => { const last = out[out.length - 1]; if (last && last.c.root === c.root && last.c.minor === c.minor) last.bars++; else out.push({ c, at: b, bars: 1 }); }); return out; };
const merge = (p: PartDesc | undefined, synth: SynthParams, fx: Fx, volume: number) => ({ synth: { ...synth, ...(p?.synth ?? {}) }, fx: { ...fx, ...(p?.fx ?? {}) }, volume: p?.volume ?? volume });

function cellNotes(perBar: Chord[], cell: string, center: number, dur: number, vel: number, color: boolean): Note[] {
  return perBar.flatMap((c, bar) => [...flat(cell)].flatMap((ch, i) => (ch === "." ? [] : voice(c, center, color).map((m) => [m, bar * 4 + i / 4, dur, vel] as Note))));
}

export function harmonyTracks(recipe: Recipe, perBar: Chord[], r: (k: string) => Rng, busy = 0): Track[] {
  const out: Track[] = []; const beats = perBar.length * 4; const parts = recipe.parts;
  const color = chance(0.5, r("color"));
  // A pad in every draft that wants air; a lane with none still gets one quietly under the breakdown.
  const pad = merge(parts.pad, { wave: "fatsawtooth", unison: 2, spread: 20, cutoff: Math.round(between(1100, 2200, r("padCut"))), attack: 0.5, release: 1 }, { reverb: 0.32, width: 0.85 }, -12);
  out.push({ id: "pad", name: "Pad", role: "pad", duck: true, loopBeats: beats, ...pad,
    notes: spans(perBar).flatMap(({ c, at, bars }) => voice(c, 62, color).map((m) => [m, at * 4, bars * 4 - 0.05, 60] as Note)) });
  // Stabs or keys: the lane's own kind first; a lane that names neither gets stabs if it is a club lane.
  const kinds: ("stab" | "chords")[] = [];
  if (parts.stab) kinds.push("stab");
  if (parts.chords) kinds.push("chords");
  if (!kinds.length && !recipe.verseChorus) kinds.push("stab");
  if (!kinds.length) kinds.push("chords");
  const kind = kinds.length > 1 ? thompson(kinds.map((v, i) => ({ v, w: i ? 1 : 1.3 })), r("keysKind")) : kinds[0];
  if (busy > -0.7) {
    if (kind === "stab") {
      const cell = thompson(STAB_CELLS.map((v, i) => ({ v, w: i === 0 ? 2 : 1 })), r("stabCell"), 4);
      const p = merge(parts.stab, { wave: "fatsawtooth", unison: 2, spread: 24, cutoff: 2600, decay: 0.18, sustain: 0.1 }, { reverb: 0.2, delay: { time: "8n.", feedback: 0.25, wet: 0.16 }, pan: -0.15 }, -8);
      out.push({ id: "stab", name: "Stabs", role: "stab", duck: true, loopBeats: beats, ...p, notes: cellNotes(perBar, cell, 67, 0.18, 88, color) });
    } else {
      const cell = thompson(KEY_CELLS.map((v, i) => ({ v, w: i === 0 ? 2 : 1 })), r("keysCell"), 4);
      const p = merge(parts.chords, { wave: "epiano", attack: 0.02, release: 0.6 }, { reverb: 0.2, width: 0.8 }, -10);
      out.push({ id: "chords", name: "Keys", role: "chords", duck: true, loopBeats: beats, ...p, notes: cellNotes(perBar, cell, 64, cell === KEY_CELLS[0] ? 1.8 : 0.35, 78, true) });
    }
  }
  if (parts.arp && busy > -0.3 && chance(0.75, r("arp?"))) {
    const step = pick([0.25, 0.5], r("arpStep"));
    const shape = pick([[0, 7, 12, 15], [0, 12, 7, 12], [0, 3, 7, 12]], r("arpShape"));
    const notes: Note[] = perBar.flatMap((c, bar) => {
      const pcs = chordPcs(c); const base = 57 + ((((pcs[0] - 57) % 12) + 12) % 12);
      return Array.from({ length: 4 / step }, (_, i) => { const iv = shape[i % shape.length]; const third = c.minor ? 3 : 4; return [base + (iv === 3 || iv === 15 ? iv - 3 + third : iv), bar * 4 + i * step, step * 0.8, i % 2 ? 78 : 94] as Note; });
    });
    const p = merge(parts.arp, { wave: "sawtooth", decay: 0.12, sustain: 0.1, cutoff: 1800 }, { delay: { time: "8n.", feedback: 0.35, wet: 0.22 }, reverb: 0.3 }, -10);
    out.push({ id: "arp", name: "Arp", role: "arp", duck: true, loopBeats: beats, ...p, notes });
  }
  return out;
}
