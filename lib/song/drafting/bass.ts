// The low end of a draft: the bass line on the record's own rhythm (or the lane's) walking the chord roots,
// with a seeded octave or fifth as the hook note, and a sub under it.
import type { Track, Note } from "../types";
import type { DraftDna, Steer } from "./types";
import type { Recipe } from "./recipes";
import { isPattern } from "./recipes";
import { flat, hits, velOf } from "./drums";
import type { Chord } from "./theory";
import { rootIn } from "./theory";
import { thompson, chance, between, type Rng, type Cand } from "./choose";

const EIGHT08 = new Set(["trap-club", "jersey-club"]);

/** The 16-step rhythm per bar (a two-bar pattern alternates). */
const barSteps = (pattern: string, bar: number) => { const f = flat(pattern); const bars = Math.max(1, Math.floor(f.length / 16)); const b = bar % bars; return f.slice(b * 16, b * 16 + 16); };

function line(pattern: string, perBar: Chord[], rng: Rng, color: number): Note[] {
  const out: Note[] = [];
  perBar.forEach((c, bar) => {
    const steps = barSteps(pattern, bar); const root = rootIn(c.root, 34);
    const on = [...steps].map((ch, i) => [ch, i] as const).filter(([ch]) => ch !== ".");
    on.forEach(([ch, i], j) => {
      const next = j + 1 < on.length ? on[j + 1][1] : 16 + (on[0]?.[1] ?? 0);
      const dur = Math.max(0.12, Math.min(1.5, ((next - i) / 4) * 0.8));
      let pitch = root;
      // The hook note: late in an odd bar, an octave or a fifth up (seeded, so every record has its own).
      if (bar % 2 === 1 && i >= 12 && j === on.length - 1 && rng() < color) pitch = root + (rng() < 0.6 ? 12 : 7);
      else if (on.length >= 6 && i % 4 === 3 && rng() < color * 0.5) pitch = root + 12;
      out.push([pitch, bar * 4 + i / 4, Math.round(dur * 1000) / 1000, Math.max(40, velOf(ch) || 96)]);
    });
  });
  return out;
}

export function bassTracks(dna: DraftDna, recipe: Recipe, perBar: Chord[], kickSteps: string, r: (k: string) => Rng, steer?: Steer): Track[] {
  const rhythms: Cand<string>[] = [];
  if (dna.bass && isPattern(dna.bass) && hits(dna.bass) >= 2 && hits(dna.bass) <= 12) rhythms.push({ v: flat(dna.bass), w: 5 });
  recipe.bass.patterns.forEach((p, i) => rhythms.push({ v: p, w: i === 0 ? 3 : 2 }));
  if (EIGHT08.has(recipe.id)) rhythms.push({ v: kickSteps, w: 4 });   // the 808 follows the kick in these lanes
  const rhythm = thompson(rhythms, r("bassRhythm"));
  const alt = recipe.bass.patterns.find((p) => flat(p) !== flat(rhythm));
  const dark = steer?.dark ?? 0;
  const cutoff = Math.round((recipe.bass.synth.cutoff ?? 600) * between(0.8, 1.25, r("bassCut")) * (1 - 0.25 * Math.max(0, dark)) * (1 + 0.2 * Math.max(0, -dark)));
  const color = between(0.35, 0.8, r("bassColor"));
  const bass: Track = {
    id: "bass", name: "Bass", role: "bass", volume: -2, duck: recipe.bass.duck, loopBeats: perBar.length * 4,
    synth: { ...recipe.bass.synth, cutoff }, fx: { drive: recipe.bass.drive },
    notes: line(rhythm, perBar, r("bassLine"), color),
    ...(alt ? { patterns: { alt: line(alt, perBar, r("bassAlt"), color) } } : {}),
  };
  const out = [bass];
  if (!EIGHT08.has(recipe.id)) {
    const offbeat = recipe.id === "tech-house" || recipe.id === "hard-house" ? chance(0.7, r("subShape")) : chance(0.25, r("subShape"));
    const notes: Note[] = perBar.flatMap((c, bar) => { const p = rootIn(c.root, 24); return offbeat ? [[p, bar * 4 + 0.5, 0.4, 100], [p, bar * 4 + 2.5, 0.4, 96]] as Note[] : [[p, bar * 4, 3.5, 100]] as Note[]; });
    out.push({ id: "sub", name: "Sub", role: "sub", volume: -6, duck: true, loopBeats: perBar.length * 4, notes });
  }
  return out;
}
