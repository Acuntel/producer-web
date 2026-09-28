// The desk's own parts of the schedule: the riser, the pump, the silent gap before a drop, and the
// return of every automated parameter to where the record writes it. Every gain move here holds the
// value it has at its audio time and ramps from there (cancelAndHoldAtTime plus a few milliseconds),
// so nothing on the desk ever steps, however the hits fall against each other.
import * as Tone from "tone";
import type { Song } from "../song/types";
import type { Schedule } from "./schedule";
import type { Board } from "./board";
import type { Voice } from "./voices";
import { resyncPoints, type ResyncPoint } from "./automation";

export const EDGE = 0.005;       // the ramp every desk edge takes: instant to the ear, never a click
const PUMP_ATTACK = 0.005;       // how fast the pump pulls the ducked bus down on a kick

type Lay = (key: string, hash: string, make: () => Tone.Part) => void;
export type DeskCtx = {
  lay: Lay; tick: (beat: number) => string; beatSec: number; song: Song; schedule: Schedule; board: Board;
  voice: (id: string) => Voice | undefined; loopStart: number;
};

function hashBeats(beats: number[]): string {
  let h = 2166136261;
  for (const b of beats) h = Math.imul(h ^ Math.round(b * 960), 16777619);
  return `${beats.length}.${(h >>> 0).toString(36)}`;
}

/** Drop craft: "cut" and "riser" sections get a white-noise riser through the final bars. */
export function layRiser({ lay, tick, beatSec, song, schedule, board }: DeskCtx) {
  const riserEvents: [string, number][] = [];
  for (const s of schedule.sectionStarts) {
    if (s.fill !== "cut" && s.fill !== "riser") continue;
    const lenBeats = Math.min(16, s.beats);
    riserEvents.push([tick(s.startBeat + s.beats - lenBeats - (s.fill === "cut" ? 0.5 : 0)), lenBeats]);
  }
  if (!riserEvents.length) return;
  lay("riser", `${song.bpm}|${riserEvents.map((r) => r.join("/")).join(",")}`, () => {
    // Each riser its own voice, its envelope set here once rather than mutated inside the callback,
    // so two risers that overlap never share (or rewrite) one envelope.
    const lens = riserEvents.map(([, lenBeats]) => lenBeats * beatSec);
    const voices = lens.map((len, i) => { const v = board.riser(i); v.synth.envelope.attack = Math.max(0.1, len - 0.15); v.synth.envelope.decay = 0.1; v.synth.envelope.sustain = 0; return v; });
    return new Tone.Part((time, i: number) => {
      const { synth, hp } = voices[i]; const len = lens[i];
      hp.frequency.setValueAtTime(500, time); hp.frequency.exponentialRampToValueAtTime(7000, time + len);
      synth.triggerAttackRelease(len, time, 0.85);
    }, riserEvents.map(([at], i) => [at, i] as [string, number]));
  });
}

/** The pump: duck the bus at every kick, from wherever the last pump left it. Depth and release are master
 *  params (records: 5 to 7 dB, 100 to 120 ms). */
export function layPump({ lay, tick, beatSec, song, schedule, board }: DeskCtx) {
  const m = song.master ?? {};
  const floor = Math.pow(10, -Math.max(0, Math.min(14, m.sidechainDb ?? 6)) / 20);
  const release = Math.min(beatSec * 0.8, Math.max(0.06, (m.sidechainReleaseMs ?? 120) / 1000));
  const g = board.duck.gain;
  lay("duck", `${floor.toFixed(3)}|${release.toFixed(3)}|${hashBeats(schedule.kickBeats)}`, () =>
    new Tone.Part((time) => {
      g.cancelAndHoldAtTime(time);
      g.linearRampToValueAtTime(floor, time + PUMP_ATTACK);
      g.linearRampToValueAtTime(1, time + PUMP_ATTACK + release);
    }, schedule.kickBeats.map((b) => [tick(b), b] as [string, number])));
}

/** The gap before a drop is silent: a "cut" section's last half beat takes the whole music bus (tails,
 *  reverb and delay included) down, and it opens again on the downbeat. */
export function layGap({ lay, tick, beatSec, schedule, board }: DeskCtx) {
  const cuts = schedule.sectionStarts.filter((s) => s.fill === "cut").map((s) => s.startBeat + s.beats - 0.5);
  if (!cuts.length) return;
  const g = board.gap.gain; const gapSec = 0.5 * beatSec;
  lay("gap", `${beatSec.toFixed(5)}|${hashBeats(cuts)}`, () =>
    new Tone.Part((time) => {
      g.cancelAndHoldAtTime(time);
      g.linearRampToValueAtTime(0, time + EDGE);
      g.setValueAtTime(0, time + gapSec - EDGE);
      g.linearRampToValueAtTime(1, time + gapSec);
    }, cuts.map((b) => [tick(b), b] as [string, number])));
}

/** Automation back to base at every section start and the loop's start (automation.ts). */
export function layResync({ lay, tick, beatSec, song, schedule, board, voice, loopStart }: DeskCtx) {
  const points = resyncPoints(schedule.automation, schedule.sectionStarts, loopStart);
  if (!points.length) return;
  lay("resync", `${song.bpm}|${JSON.stringify(points)}|${JSON.stringify(song.master ?? {})}`, () =>
    new Tone.Part((time, p: ResyncPoint) => {
      for (const r of p.items) {
        if (r.kind === "base") { if (r.owner === "master") board.toBase(r.param, time, song.master ?? {}); else voice(r.owner)?.toBase(r.param, time); continue; }
        const t1 = time + (r.endBeat - p.beat) * beatSec;
        if (r.owner === "master") board.automate(r.param, r.from, r.to, time, t1, r.curve); else voice(r.owner)?.automate(r.param, r.from, r.to, time, t1, r.curve);
      }
    }, points.map((p) => [tick(p.beat), p] as [string, ResyncPoint])));
}
