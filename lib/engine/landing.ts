// Landing a change on its boundary: a Transport.scheduleOnce one tick before the boundary, under the
// latest-wins ticket, doing its work at the boundary's own audio time (never at now(), and never with a
// bare .value or rampTo inside the callback). One landing waits at a time; a newer one replaces it.
import * as Tone from "tone";
import type { Song } from "../song/types";
import type { SectionSpan } from "./schedule";
import type { LandAt, Applied } from "./rig";
import { recordLanding, type LandingRow } from "./ledger";
import { nextBoundary, type Boundary } from "./boundary";

type Transport = ReturnType<typeof Tone.getTransport>;
/** Where a change lands: its boundary, the bar and the audio time, and a promise that settles when it
 *  has landed in the audio (true) or was replaced by a newer change first (false). */
export type Landing = { boundary: Boundary; landsAtBar: number | null; landsAtTime: number | null; landed: Promise<boolean> };
type Run = (land?: LandAt) => { landsAtBar: number | null; landsAtTime: number | null };

export class Lander {
  private pending: { id: number; resolve: (ok: boolean) => void } | null = null;
  constructor(private tr: Transport) {}

  cancel() { if (this.pending) { this.tr.clear(this.pending.id); this.pending.resolve(false); this.pending = null; } }

  /** Run `run` on the next `b` boundary while `current()` still holds. At once when stopped, or for "now". */
  land(b: Boundary, current: () => boolean, run: Run): Landing {
    const tr = this.tr;
    this.cancel();
    if (b === "now" || tr.state !== "started") { const r = run(); return { boundary: b, ...r, landed: Promise.resolve(true) }; }
    const ppq = tr.PPQ;
    // The transport may already have scheduled up to now() (the clock plus the lookahead): never land before that.
    const frontier = tr.getTicksAtTime(tr.context.now()) + 2;
    const loop = tr.loop ? { start: tr.toTicks(tr.loopStart), end: tr.toTicks(tr.loopEnd) } : null;
    const nb = nextBoundary(frontier, b, ppq, loop);
    let resolve!: (ok: boolean) => void;
    const landed = new Promise<boolean>((res) => { resolve = res; });
    const id = tr.scheduleOnce((time) => {
      if (this.pending?.id === id) this.pending = null;
      if (!current()) { resolve(false); return; }
      const at = time + 60 / (tr.bpm.getValueAtTime(time) * ppq);   // the boundary tick's own time
      // At a wrap, the tick after the loop's last one is the loop's start only if the loop still ends there:
      // a change that moves or removes the loop decides it (Engine.lay reads wrapNext against the new loop).
      run({ at, beat: nb.tick / ppq, wrapNext: nb.wraps && loop && nb.layAt === loop.end - 1 ? loop.end : undefined }); resolve(true);
    }, `${nb.layAt}i`);
    this.pending = { id, resolve };
    return { boundary: b, landsAtBar: Math.floor(nb.tick / ppq / 4) + 1, landsAtTime: null, landed };
  }
}

/** The section starts of a record, without scheduling its notes: where the loop region sits. */
export function sectionSpans(song: Song): { starts: SectionSpan[]; total: number } {
  const byId = new Map(song.sections.map((x) => [x.id, x])); const starts: SectionSpan[] = []; let cursor = 0;
  for (const id of song.arrangement) { const sec = byId.get(id); if (!sec) continue; starts.push({ id: sec.id, name: sec.name, startBeat: cursor, beats: sec.bars * 4, fill: sec.fill, energy: sec.energy }); cursor += sec.bars * 4; }
  return { starts, total: cursor };
}

/** Move the playhead to `ticks` at audio time `at`, exactly, the way the transport's own loop wrap does.
 *  The public setter moves it at now(), which inside a boundary's callback is up to a clock tick late. */
export function moveClock(tr: Transport, ticks: number, at: number) {
  const clock = (tr as unknown as { _clock?: { setTicksAtTime?: (t: number, time: number) => void } })._clock;
  if (clock?.setTicksAtTime) clock.setTicksAtTime(ticks, at); else tr.ticks = ticks;
}

/** The ledger's landing row: the boundary's audio time, and where that time sits on the transport's grid,
 *  read back from the transport (folded into the loop when it wraps there). At once: now() while playing,
 *  the playhead when stopped. */
export function landingRow(tr: Transport, r: { jobId?: string; calledAt: number; boundary: Boundary; applied: Applied; notReady: string[]; where?: LandAt }): LandingRow {
  const ppq = tr.PPQ;
  const time = r.where ? r.where.at : tr.state === "started" ? tr.now() : null;
  const beat = r.where ? r.where.beat : (time !== null ? tr.getTicksAtTime(time) : tr.ticks) / ppq;
  let measured: number | null = null;
  if (r.where) {
    let t = Math.round(tr.getTicksAtTime(r.where.at));
    const ls = tr.toTicks(tr.loopStart), le = tr.toTicks(tr.loopEnd);
    if (tr.loop && t >= le - 0.5) t = ls + (t - le);
    measured = Math.round((((t / ppq) % 4) + 4) % 4 * 1000) / 1000;
  }
  const fold = (b: number) => Math.round((((b % 4) + 4) % 4) * 1000) / 1000;
  return recordLanding({ jobId: r.jobId, boundary: r.boundary, calledAt: r.calledAt, landedAt: performance.now(), landsAtBar: Math.floor(beat / 4) + 1, landsAtTime: time, beatInBar: fold(beat), partsChanged: r.applied.partsChanged, voicesRebuilt: r.applied.voicesRebuilt, notReady: [...r.notReady, ...r.applied.held], measuredBeatInBar: measured, firstHits: {} });
}

/** The first hit of a part laid anew, in beats after its landing's boundary (never negative when it is on time). */
export function noteFirstHit(row: LandingRow | null, key: string, time: number, bpm: number) {
  if (!row || row.landsAtTime === null || !row.partsChanged.includes(key) || !row.firstHits || key in row.firstHits) return;
  row.firstHits[key] = Math.round(((time - row.landsAtTime) * bpm / 60) * 1000) / 1000;
}
