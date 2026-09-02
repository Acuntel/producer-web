// The Groove Pool: 16-slot timing and accent templates (Ableton swing, MPC,
// 909, SP-1200, garage skip), the per-track resolution rule, and the pure
// per-event application the scheduler calls. Notes stay on the straight grid;
// the groove moves them at play time, deterministically.
import type { Groove, GrooveName, Song, Track } from "./types";

export const GROOVE_NAMES: GrooveName[] = ["straight", "swing16", "swing8", "mpc16", "mpc8", "909", "sp1200", "garage-skip", "custom"];
export const STRAIGHT_ROLES = ["kick", "clap", "sub"];
const SLOTS = 16;
const T16 = 1 / 12;  // beats: an offbeat 16th at full triplet swing (0.25 -> 0.333)
const T8 = 1 / 6;    // beats: an offbeat 8th at full triplet swing (0.5 -> 0.667)

const zeros = () => new Array<number>(SLOTS).fill(0);
const fill = (pick: (slot: number) => number) => Array.from({ length: SLOTS }, (_, i) => pick(i));
const odd = (i: number) => i % 2 === 1;
const offbeat8 = (i: number) => i % 4 === 2;
const downbeat = (i: number) => i % 4 === 0;

// Timing in beats at amount 1, accents in -1..1 at velocity 1.
export function templateOffsets(name: GrooveName): { timing: number[]; accents: number[] } {
  switch (name) {
    case "swing16": return { timing: fill((i) => (odd(i) ? T16 : 0)), accents: fill((i) => (downbeat(i) ? 0.15 : odd(i) ? -0.2 : 0)) };
    case "swing8": return { timing: fill((i) => (offbeat8(i) ? T8 : 0)), accents: fill((i) => (downbeat(i) ? 0.15 : offbeat8(i) ? -0.15 : 0)) };
    // MPC 16 swing at 66%: the classic hip-hop and house pocket, odd 16ths late, downbeats leaning in.
    case "mpc16": return { timing: fill((i) => (odd(i) ? T16 : 0)), accents: fill((i) => (i === 0 ? 0.25 : downbeat(i) ? 0.12 : odd(i) ? -0.3 : -0.05)) };
    case "mpc8": return { timing: fill((i) => (offbeat8(i) ? T8 : 0)), accents: fill((i) => (i === 0 ? 0.25 : downbeat(i) ? 0.1 : offbeat8(i) ? -0.25 : 0)) };
    // TR-909 shuffle: a tighter shift than the MPC, with the box's own accent switch on the downbeats.
    case "909": return { timing: fill((i) => (odd(i) ? 0.05 : 0)), accents: fill((i) => (downbeat(i) ? 0.3 : odd(i) ? -0.25 : 0)) };
    // SP-1200: the odd 16ths sit late and the 4th 16th of each beat drags a hair more.
    case "sp1200": return { timing: fill((i) => (i % 4 === 3 ? 0.07 : odd(i) ? 0.045 : 0)), accents: fill((i) => (downbeat(i) ? 0.2 : odd(i) ? -0.35 : -0.1)) };
    // UK garage skip: past-triplet 16ths, the skip lands on the 4th 16th of beats 1 and 3, the 2 and 4 stay firm.
    case "garage-skip": return { timing: fill((i) => (i === 3 || i === 11 ? 0.12 : odd(i) ? 0.09 : 0)), accents: fill((i) => (i === 3 || i === 11 ? 0.35 : i === 4 || i === 12 ? 0.2 : odd(i) ? -0.3 : 0)) };
    default: return { timing: zeros(), accents: zeros() };
  }
}

const clampN = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const slots16 = (v: unknown, lo: number, hi: number): number[] | undefined =>
  Array.isArray(v) && v.length === SLOTS && v.every((x) => typeof x === "number" && Number.isFinite(x)) ? v.map((x) => Math.max(lo, Math.min(hi, x))) : undefined;

// Validate a groove from storage or the brain. Returns null for junk.
export function cleanGroove(g: unknown): Groove | null {
  if (!g || typeof g !== "object") return null;
  const o = g as Record<string, unknown>;
  if (!GROOVE_NAMES.includes(o.name as GrooveName)) return null;
  const out: Groove = { name: o.name as GrooveName, amount: clampN(o.amount, 0, 1.3, 1) };
  const velocity = clampN(o.velocity, -1, 1, 0); if (velocity !== 0) out.velocity = velocity;
  const random = clampN(o.random, 0, 12, 0); if (random > 0) out.random = random;
  const timing = slots16(o.timing, -0.25, 0.25); if (timing) out.timing = timing;
  const accents = slots16(o.accents, -1, 1); if (accents) out.accents = accents;
  return out;
}

// The legacy dial: humanize.swing 0.5..0.667 is swing16 at amount 0..1 (the same 0.0833-beat push as before).
export const swingToAmount = (swing: number) => Math.max(0, Math.min(1.3, (swing - 0.5) * 6));
export const legacyGroove = (song: Song): Groove | null => (song.humanize.swing > 0.5 ? { name: "swing16", amount: swingToAmount(song.humanize.swing) } : null);

// The song groove as the old single swing number (for the ears' facts and the brain's summary).
export function swingOf(g: Groove | null | undefined): number {
  if (!g) return 0.5;
  const timing = g.timing ?? templateOffsets(g.name).timing;
  const shift = timing[1] * g.amount;
  return Math.max(0.5, Math.min(0.7, Math.round((0.5 + shift * 2) * 1000) / 1000));
}
export const songGroove = (song: Song): Groove | null => (song.groove === undefined ? legacyGroove(song) : song.groove);
export const songSwing = (song: Song) => swingOf(songGroove(song));

// Which groove a track plays: its own, else the song groove; kick, clap and sub stay straight unless told otherwise.
export function grooveFor(track: Track, song: Song): Groove | null {
  if (track.groove !== undefined) return track.groove;
  if (STRAIGHT_ROLES.includes(track.role)) return null;
  return songGroove(song);
}

export type GrooveHit = { beat: number; vel: number };
// Move one hit. `local` is the note's straight-grid position in beats (within its bar or pattern; the
// slot is taken mod one bar), `vel` 1-127. rng feeds the jitter only when the groove asks for it.
export function applyGroove(local: number, vel: number, groove: Groove | null, rng: () => number, beatSec = 0.5): GrooveHit {
  if (!groove || (groove.amount <= 0 && !groove.random)) return { beat: local, vel };
  const pos = ((local % 4) + 4) % 4;
  const slotF = pos * 4;
  const slot = Math.round(slotF) % SLOTS;
  const onGrid = Math.abs(slotF - Math.round(slotF)) < 0.1; // triplets and 32nds keep their own feel
  const tpl = templateOffsets(groove.name);
  const timing = groove.timing ?? tpl.timing;
  const accents = groove.accents ?? tpl.accents;
  let beat = local;
  let v = vel;
  if (onGrid) {
    beat += timing[slot] * groove.amount;
    const velAmt = groove.velocity ?? 0;
    if (velAmt !== 0) v = v * (1 + accents[slot] * velAmt * Math.min(1, groove.amount));
  }
  if (groove.random && groove.random > 0) beat += ((rng() * 2 - 1) * groove.random) / 1000 / beatSec;
  return { beat, vel: Math.max(1, Math.min(127, Math.round(v))) };
}

export type GrooveTemplate = { timing: number[]; accents: number[] };
// The brain writes {op:"groove", name:"custom", from:"reference"}; the studio fills in what the ears extracted.
export function withReferenceGroove(ops: unknown[] | null, ref: GrooveTemplate | null | undefined): unknown[] | null {
  if (!ops) return ops;
  return ops.map((raw) => {
    const o = raw as Record<string, unknown>;
    if (!o || o.op !== "groove" || o.from !== "reference") return raw;
    if (!ref) return { ...o, timing: undefined, accents: undefined };
    return { ...o, name: "custom", timing: ref.timing, accents: ref.accents };
  });
}

export const grooveLine = (g: Groove | null | undefined) => (!g ? "straight" : `${g.name} amount ${Math.round(g.amount * 100) / 100}${g.velocity ? ` velocity ${g.velocity}` : ""}${g.random ? ` random ${g.random} ms` : ""}`);
