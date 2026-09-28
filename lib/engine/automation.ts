// Who owns a parameter, and where it goes back to. An automation owns its parameter from its first
// beat to the end of its section (its end value holds until then), so a move made meanwhile leaves it
// alone instead of snapping a fade or a sweep back. Every section start, and the loop's start when it
// is not one, puts each automated parameter where the record writes it: back to the track's own value,
// or, at a loop start inside a running sweep, onto the sweep at that point. Tone-free, so a test holds it.
import type { AutoParam } from "../song/types";
import type { AutoEv, SectionSpan } from "./schedule";

export type Owner = string;   // "master" or a track id
export type Resync =
  | { owner: Owner; param: AutoParam; kind: "base" }
  | { owner: Owner; param: AutoParam; kind: "ramp"; from: number; to: number; endBeat: number; curve?: "linear" | "exp" };
export type ResyncPoint = { beat: number; items: Resync[] };

const EPS = 1e-6;
const keyOf = (owner: Owner, param: AutoParam) => `${owner}|${param}`;

function sectionEnd(sections: SectionSpan[], beat: number): number {
  const s = sections.find((x) => beat >= x.startBeat - EPS && beat < x.startBeat + x.beats - EPS);
  return s ? s.startBeat + s.beats : Infinity;
}

/** The parameters a running automation owns at this beat, by owner. */
export function ownedAt(automation: AutoEv[], sections: SectionSpan[], beat: number): Map<Owner, Set<AutoParam>> {
  const out = new Map<Owner, Set<AutoParam>>();
  for (const a of automation) {
    if (beat < a.startBeat - EPS || beat >= sectionEnd(sections, a.startBeat) - EPS) continue;
    const set = out.get(a.track) ?? new Set<AutoParam>(); set.add(a.param); out.set(a.track, set);
  }
  return out;
}

/** Where an automation is at a beat inside it: linear, or exponential when it sweeps between two positive values. */
export function valueAt(a: AutoEv, beat: number): number {
  const f = Math.max(0, Math.min(1, (beat - a.startBeat) / Math.max(EPS, a.endBeat - a.startBeat)));
  const exp = a.curve !== "linear" && a.param === "filter.cutoff" && a.from > 0 && a.to > 0;
  return exp ? a.from * Math.pow(a.to / a.from, f) : a.from + (a.to - a.from) * f;
}

/** At every section start, and at `loopStart`, what each automated parameter must be put back to. A
 *  parameter whose own automation starts right there is left to it. */
export function resyncPoints(automation: AutoEv[], sections: SectionSpan[], loopStart = 0): ResyncPoint[] {
  if (!automation.length) return [];
  const keys = new Map<string, { owner: Owner; param: AutoParam }>();
  for (const a of automation) keys.set(keyOf(a.track, a.param), { owner: a.track, param: a.param });
  const beats = [...new Set([...sections.map((s) => s.startBeat), loopStart])].sort((x, y) => x - y);
  const points: ResyncPoint[] = [];
  for (const beat of beats) {
    const items: Resync[] = [];
    for (const { owner, param } of keys.values()) {
      const mine = automation.filter((a) => a.track === owner && a.param === param);
      if (mine.some((a) => Math.abs(a.startBeat - beat) < EPS)) continue;
      const running = mine.find((a) => a.startBeat < beat - EPS && beat < a.endBeat - EPS);
      if (running) items.push({ owner, param, kind: "ramp", from: valueAt(running, beat), to: running.to, endBeat: running.endBeat, curve: running.curve });
      else items.push({ owner, param, kind: "base" });
    }
    if (items.length) points.push({ beat, items });
  }
  return points;
}
