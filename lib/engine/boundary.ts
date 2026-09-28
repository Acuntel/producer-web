// Every change has an address in musical time (masterprompt 8.2). Content lands on the next bar;
// sections, the arrangement, the tempo, the loop and a jump land on the next 4-bar phrase; a mixer move
// lands on the next beat; mute and solo act at once (and ramp). Tone-free, so a test holds the rules.
import type { Song, Track } from "../song/types";
import type { Boundary } from "./ledger";

export type { Boundary };
const RANK: Record<Boundary, number> = { now: 0, beat: 1, bar: 2, phrase: 3 };
export const later = (a: Boundary, b: Boundary): Boundary => (RANK[a] >= RANK[b] ? a : b);

const j = (x: unknown) => JSON.stringify(x ?? null);
// What a track plays (its notes, instrument, clip and anything that makes a new voice), not how loud.
function contentOf(t: Track) {
  const fx = t.fx ?? {};
  return j([t.role, t.loopBeats, t.notes, t.patterns, t.synth, t.clip, t.transpose, t.groove, t.velDev, t.chance, t.duck,
    fx.gate ?? 0, fx.filter?.type ?? null, fx.eq ?? null, fx.comp ?? null, (fx.crush ?? 0) > 0]);
}
// The mixer: levels, sends and the rampable inserts.
function mixOf(t: Track) { const fx = t.fx ?? {}; return j([t.volume, fx.pan, fx.width, fx.reverb, fx.delay, fx.drive, fx.crush, fx.filter?.cutoff, fx.filter?.q]); }

/** Where a change from `before` to `after` lands. A first lay, or nothing audible changed, is "now". */
export function boundaryFor(before: Song | null, after: Song): Boundary {
  if (!before) return "now";
  const structure = (s: Song) => j([s.bpm, s.arrangement, s.sections.map((x) => [x.id, x.bars]), s.loop]);
  if (structure(before) !== structure(after)) return "phrase";
  let b: Boundary = "now";
  const sectionContent = (s: Song) => j([s.sections.map((x) => [x.id, x.active, x.variants, x.fill, x.automation]), s.humanize, s.kit, s.lane, s.key]);
  if (sectionContent(before) !== sectionContent(after)) b = later(b, "bar");
  const was = new Map(before.tracks.map((t) => [t.id, t]));
  if (before.tracks.length !== after.tracks.length || after.tracks.some((t) => !was.has(t.id))) b = later(b, "bar");
  for (const t of after.tracks) {
    const o = was.get(t.id); if (!o) continue;
    if (contentOf(o) !== contentOf(t)) b = later(b, "bar");
    else if (mixOf(o) !== mixOf(t)) b = later(b, "beat");
  }
  if (j(before.master) !== j(after.master)) b = later(b, "beat");
  return b;
}

/** Only mute or solo changed: it acts at once. */
export function onlyMuteSolo(before: Song | null, after: Song): boolean {
  if (!before || before.tracks.length !== after.tracks.length) return false;
  const strip = (s: Song) => j({ ...s, tracks: s.tracks.map((t) => ({ ...t, mute: undefined, solo: undefined })) });
  return strip(before) === strip(after) && j(before.tracks.map((t) => [!!t.mute, !!t.solo])) !== j(after.tracks.map((t) => [!!t.mute, !!t.solo]));
}

export const unitBeats = (b: Boundary) => (b === "phrase" ? 16 : b === "bar" ? 4 : b === "beat" ? 1 : 0);

/** The tick a change lands on, and the tick before it where the landing is laid (a Part laid at the
 *  tick it starts on would miss its own first hit). `frontier` is the last tick the transport may already
 *  have scheduled; the landing is never before it. With a loop [loopStart, loopEnd), a boundary at or past
 *  the loop's end is the wrap itself: the landing is laid on the loop's last tick and lands on its first. */
export function nextBoundary(frontier: number, b: Boundary, ppq: number, loop: { start: number; end: number } | null): { tick: number; layAt: number; wraps: boolean } {
  const unit = Math.max(1, unitBeats(b)) * ppq;
  // Past the loop's end, the wrap has been scheduled but not yet processed: read the frontier after it.
  if (loop && loop.end > loop.start && frontier >= loop.end) frontier = loop.start + ((frontier - loop.end) % (loop.end - loop.start));
  let tick = (Math.floor(frontier / unit) + 1) * unit;
  if (tick - 1 <= frontier) tick += unit;
  if (loop && loop.end > loop.start && frontier < loop.end && tick >= loop.end) {
    // The first tick of the next pass is the next boundary, unless the loop's start is not one (a
    // region that does not sit on the grid): then the next grid line inside the loop after the wrap.
    const first = Math.ceil(loop.start / unit) * unit;
    const land = first < loop.end ? first : loop.start;
    return land === loop.start ? { tick: loop.start, layAt: loop.end - 1, wraps: true } : { tick: land, layAt: land - 1, wraps: true };
  }
  return { tick, layAt: tick - 1, wraps: false };
}
