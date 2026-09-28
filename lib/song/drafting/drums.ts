// The drums of a draft: the heard record's grids when they are real, else the lane's, with seeded variations
// among the strongest candidates. Step strings are the store's own form (16 steps a bar).
import type { Track, Note } from "../types";
import type { DraftDna, Steer } from "./types";
import type { Recipe } from "./recipes";
import { isPattern } from "./recipes";
import { thompson, chance, pick, between, type Rng, type Cand } from "./choose";

const VEL: Record<string, number> = { X: 120, x: 92, g: 45, o: 88, O: 112 };
export const velOf = (ch: string) => (/[1-9]/.test(ch) ? Math.round(15 + Number(ch) * 12) : VEL[ch] ?? 0);
export const flat = (steps: string) => steps.replace(/[\s|]/g, "");
export const hits = (steps: string) => [...flat(steps)].filter((c) => c !== ".").length;

/** Steps to notes: one bar is 16 characters; an "o" rings longer. */
export function stepNotes(steps: string, midi: number, scale = 1): Note[] {
  const out: Note[] = [];
  [...flat(steps)].forEach((ch, i) => { const v = velOf(ch); if (ch !== "." && v) out.push([midi, i * 0.25, ch === "o" || ch === "O" ? 0.4 : 0.12, Math.max(1, Math.min(127, Math.round(v * scale)))]); });
  return out;
}
const beatsOf = (steps: string) => Math.max(4, flat(steps).length / 4);

// A grid from the hearing counts when it looks like a part: a kick with two to ten hits a bar, not a smear or a silence.
const usable = (g: string | null | undefined, lo: number, hi: number): g is string => !!g && isPattern(g) && hits(g) >= lo && hits(g) <= hi;
const plain = (steps: string) => flat(steps).replace(/[g1-4]/g, ".");

const HATS = ["..x...x...x...x.", "x.x.x.x.x.x.x.x.", "xgxgxgxgxgxgxgxg", "x.gxx.g.x.gxx.g.", "..x.x.x...x.x.xg", "g.x.g.x.g.xgg.x."];
const SPARSE_HAT = "..x...x...x...x.";
function percSteps(rng: Rng): string {
  const slots = [3, 6, 7, 10, 11, 14, 15, 13, 5, 9].slice(0, 6 + Math.floor(rng() * 4));
  const n = 3 + Math.floor(rng() * 3); const on = new Set<number>();
  while (on.size < n) on.add(pick(slots, rng));
  return Array.from({ length: 16 }, (_, i) => (on.has(i) ? (i % 2 ? "x" : "g") : ".")).join("");
}

export function drumTracks(dna: DraftDna, recipe: Recipe, r: (k: string) => Rng, steer?: Steer): Track[] {
  const d = recipe.drums, out: Track[] = [];
  const busy = steer?.busy ?? 0;
  // Kick: the record's own grid first, then the lane's, then the lane's with a pickup.
  const kicks: Cand<string>[] = [];
  // A four on the floor lane takes a sparser kick from the source only as an outside chance.
  const floor = hits(d.kick?.[0] ?? "X...X...X...X...") >= 4;
  if (usable(dna.grids?.kick, 2, 10)) kicks.push({ v: flat(dna.grids!.kick!), w: floor && hits(dna.grids!.kick!) < 4 ? 1 : 5 });
  (d.kick ?? ["X...X...X...X..."]).forEach((k, i) => kicks.push({ v: k, w: i === 0 ? 3 : 1 }));
  const k0 = flat(d.kick?.[0] ?? "X...X...X...X...");
  if (k0.length === 16 && hits(k0) === 4) kicks.push({ v: k0.slice(0, 15) + "g", w: 1.5 }, { v: k0.slice(0, 14) + "g.", w: 1 });
  const kick = thompson(kicks, r("kick"));
  out.push({ id: "kick", name: "Kick", role: "kick", volume: 0, loopBeats: beatsOf(kick), notes: stepNotes(kick, 36), patterns: { plain: stepNotes(plain(kick), 36) } });

  // The backbeat: a clap where the lane claps, a snare where it snares, the record's own when it has one.
  const role: "clap" | "snare" = d.clap ? "clap" : "snare";
  const backs: Cand<string>[] = [];
  if (usable(dna.grids?.snare, 1, 8)) backs.push({ v: flat(dna.grids!.snare!), w: 4 });
  const lane = role === "clap" ? d.clap : d.snare;
  (lane ?? ["....X.......X..."]).forEach((s, i) => backs.push({ v: s, w: i === 0 ? 3 : 1 }));
  const back = thompson(backs, r("back"));
  out.push({ id: role, name: role === "clap" ? "Clap" : "Snare", role, volume: -4, loopBeats: beatsOf(back), notes: stepNotes(back, role === "clap" ? 39 : 38), fx: { reverb: Math.round(between(0.12, 0.22, r("backfx")) * 100) / 100 } });
  if (role === "clap" && d.snare?.length && chance(0.6, r("ghosts"))) {
    const g = pick(d.snare, r("ghostpick"));
    out.push({ id: "ghost", name: "Ghost Snares", role: "snare", volume: -10, duck: true, loopBeats: beatsOf(g), notes: stepNotes(g, 38, 0.8), fx: { pan: 0.2 } });
  }

  // Hats: the record's, the lane's, then the common languages. A "too busy" steer leans to the sparse ones.
  const hats: Cand<string>[] = [];
  if (usable(dna.grids?.hat, 2, 16)) hats.push({ v: flat(dna.grids!.hat!), w: 4 });
  (d.hat ?? []).forEach((h, i) => hats.push({ v: h, w: i === 0 ? 3 : 1.5 }));
  HATS.forEach((h) => hats.push({ v: h, w: Math.max(0.2, 1 + busy * (hits(h) > 8 ? 0.8 : -0.8)) }));
  const hat = thompson(hats, r("hat"), 4);
  out.push({ id: "hat", name: "Hats", role: "hat", volume: -10, duck: true, loopBeats: beatsOf(hat), notes: stepNotes(hat, 42), patterns: { sparse: stepNotes(SPARSE_HAT, 42, 0.85) }, velDev: 8, fx: { pan: 0.12 } });

  if (d.openhat?.length || chance(0.5, r("ohat?"))) {
    const oh = d.openhat?.length ? thompson(d.openhat.map((v, i) => ({ v, w: i ? 1 : 2 })), r("ohat")) : "..o...o...o...o.";
    out.push({ id: "openhat", name: "Open Hat", role: "openhat", volume: -9, duck: true, loopBeats: beatsOf(oh), notes: stepNotes(oh, 46), fx: { pan: -0.1 } });
  }
  if (busy > -0.5) {
    const percs: Cand<string>[] = (d.perc ?? []).map((v, i) => ({ v, w: i ? 1 : 2 }));
    percs.push({ v: percSteps(r("percgen")), w: 1.5 });
    const p = thompson(percs, r("perc"));
    out.push({ id: "perc", name: "Percussion", role: "perc", volume: -12, duck: true, loopBeats: beatsOf(p), notes: stepNotes(p, 46), fx: { pan: 0.3 } });
  }
  return out;
}
