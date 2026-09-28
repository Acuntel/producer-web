// The hook: a two-bar motif shaped by the source's melody contour, answered and resolved over eight bars.
// The rhythm is a seeded pick from motifs producers use; the pitches walk the scale along the contour and land
// on a chord tone on every strong beat, so the hook follows the harmony under it.
import type { Track, Note } from "../types";
import type { Recipe } from "./recipes";
import { chordPcs, scaleNotes, type Chord, type KeyInfo } from "./theory";
import { thompson, between, pick, type Rng, type Cand } from "./choose";

type Motif = [number, number][];   // [startBeat, durBeats] over two bars
const MOTIFS: Record<string, Motif> = {
  call: [[0, 0.75], [0.75, 0.75], [1.5, 1], [3, 0.5], [3.5, 0.5], [4.5, 1], [6, 1.5]],
  talk: [[0.5, 0.5], [1, 0.5], [1.5, 1], [2.5, 0.5], [3, 1], [4.5, 0.5], [5, 0.5], [5.5, 1.5]],
  long: [[0, 1.5], [1.5, 0.5], [2, 1], [4, 1.5], [5.5, 0.5], [6, 2]],
  pluck: [[0.5, 0.25], [1.25, 0.25], [2, 0.5], [2.75, 0.25], [3.5, 0.5], [4.5, 0.25], [5.25, 0.25], [6, 0.5], [6.75, 0.75]],
  anthem: [[0, 3], [3, 1], [4, 2], [6, 2]],
  skip: [[0.75, 0.5], [1.5, 0.25], [2.25, 0.75], [3.5, 0.5], [4.75, 0.5], [5.5, 0.25], [6.25, 1.25]],
};
const LANE_MOTIFS: Record<string, string[]> = {
  "tech-house": ["pluck", "skip", "call"], "hard-house": ["skip", "pluck", "call"], "melodic-house": ["anthem", "call", "long"], "afro-house": ["skip", "talk", "pluck"],
  "deep-house": ["talk", "skip", "long"], "uk-garage": ["skip", "pluck", "talk"], "jersey-club": ["skip", "pluck"], "trap-club": ["long", "talk", "call"],
  techno: ["pluck", "skip", "anthem"], trance: ["anthem", "call", "pluck"], pop: ["talk", "call", "long"], hardstyle: ["anthem", "call"], psychedelic: ["long", "talk", "call"],
};
const SHAPES: Record<string, (t: number) => number> = {
  rise: (t) => t, fall: (t) => 1 - t, arch: (t) => Math.sin(Math.PI * t), wave: (t) => 0.5 + 0.5 * Math.sin(2 * Math.PI * t), flat: (t) => 0.5 + 0.12 * Math.sin(4 * Math.PI * t),
};

const nearestTone = (m: number, pcs: number[]) => { let best = m, d = 99; for (let x = m - 6; x <= m + 6; x++) if (pcs.includes(((x % 12) + 12) % 12) && Math.abs(x - m) < d) { d = Math.abs(x - m); best = x; } return best; };

export function hookTrack(recipe: Recipe, key: KeyInfo, perBar: Chord[], contour: string | null, r: (k: string) => Rng, busy = 0): { track: Track; motif: string; shape: string } {
  const names = LANE_MOTIFS[recipe.id] ?? ["call", "pluck", "talk"];
  const cands: Cand<string>[] = Object.keys(MOTIFS).map((m) => ({ v: m, w: names.includes(m) ? 3 - names.indexOf(m) * 0.5 : 0.6 }));
  if (busy < -0.3) cands.forEach((c) => { if (MOTIFS[c.v].length <= 6) c.w += 2; });
  const motif = thompson(cands, r("motif"), 4);
  const shapeName = contour && SHAPES[contour] ? thompson([{ v: contour, w: 4 }, { v: pick(Object.keys(SHAPES), r("shapeAlt")), w: 1.5 }], r("shape")) : pick(Object.keys(SHAPES), r("shape"));
  const shape = SHAPES[shapeName];
  const pluck = !recipe.parts.lead && (motif === "pluck" || motif === "skip");
  const lo = pluck ? 67 : 69, hi = lo + 15;
  const scale = scaleNotes(key, lo, hi);
  const range = Math.round(between(4, 8, r("range")));
  const center = Math.floor(scale.length / 2) + Math.round(between(-2, 2, r("center")));
  const m = MOTIFS[motif]; const n = m.length;
  const notes: Note[] = [];
  for (let phrase = 0; phrase < perBar.length / 2; phrase++) {
    const last = phrase === perBar.length / 2 - 1;
    m.forEach(([at, dur], i) => {
      const t = n > 1 ? i / (n - 1) : 0.5;
      // The answer phrase inverts the top of the shape; the last phrase resolves down to the tonic.
      const lift = phrase % 2 === 1 ? -0.15 : 0;
      let idx = center + Math.round((shape(t) - 0.5 + lift) * range);
      idx = Math.max(0, Math.min(scale.length - 1, idx));
      let pitch = scale[idx];
      const beat = phrase * 8 + at; const chord = perBar[Math.min(perBar.length - 1, Math.floor(beat / 4))];
      if (at % 1 === 0) pitch = nearestTone(pitch, chordPcs(chord));
      if (last && i === n - 1) pitch = nearestTone(pitch, [key.pc]);
      if (last && i === n - 1 && n > 5 && busy < 0) return;
      notes.push([pitch, beat, Math.round(dur * 950) / 1000, i === 0 ? 108 : 92 + (i % 2 ? 0 : 6)]);
    });
  }
  const lead = recipe.parts.lead;
  const synth = pluck ? { wave: "triangle" as const, decay: 0.22, sustain: 0.05, release: 0.2, cutoff: 3200 } : { wave: "fatsawtooth" as const, unison: 3, spread: 24, cutoff: Math.round(between(2400, 4200, r("leadCut"))), attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.3, ...(lead?.synth ?? {}) };
  const track: Track = { id: "hook", name: pluck ? "Pluck Hook" : "Lead Hook", role: pluck ? "pluck" : "lead", volume: lead?.volume ?? -7, duck: true, loopBeats: perBar.length * 4,
    synth, fx: { delay: { time: "8n.", feedback: 0.3, wet: 0.2 }, reverb: 0.25, ...(lead?.fx ?? {}) }, notes };
  return { track, motif, shape: shapeName };
}
