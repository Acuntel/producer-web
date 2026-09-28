// The rules that keep the transport steady through a change, with no audio in them, so a
// test can hold them: which of two overlapping loads is allowed to land, where the
// playhead goes when the record or its loop no longer contains it, and what a track's
// hits are addressed by, so a change that does not touch them leaves them where they are.
import type { Ev } from "./schedule";

// A cheap content address for a set of hits, so an unchanged track keeps the schedule it already has.
export function hashEvents(evs: Ev[]): string {
  let h = 2166136261;
  for (const e of evs) {
    h = Math.imul(h ^ Math.round(e.beat * 960), 16777619);
    // Pitch, velocity and length, the length at 960 PPQ like the start: a note shortened by a 64th is a change.
    h = Math.imul(h ^ (e.note[0] * 1024 + e.note[3]), 16777619);
    h = Math.imul(h ^ Math.round(e.note[2] * 960), 16777619);
  }
  return `${evs.length}.${(h >>> 0).toString(36)}`;
}

/** The address of a track's hits part: its voice and its hits, in beats. Not the tempo: the part
 *  reads the tempo where each note plays, so a tempo move rides the transport and relays nothing. */
export function hitsAddress(voiceSig: string, evs: Ev[]): string {
  return `${voiceSig}|${hashEvents(evs)}`;
}

/** Latest wins. Every load takes a ticket; only the newest ticket may land, so an older
 *  record that finishes loading after a newer one can never be laid over it. The same
 *  rule the listening path keeps (hearNow): the newest version is the only one that counts. */
export class Latest<T> {
  private seq = 0;
  private value: T | null = null;
  /** A new record: it is now the newest, and every ticket taken before this one is stale. */
  take(value: T): number { this.value = value; return ++this.seq; }
  /** Whether this ticket is still the newest. */
  current(ticket: number): boolean { return ticket === this.seq; }
  get newest(): T | null { return this.value; }
  /** Prepare the newest record; when a newer one arrives meanwhile, prepare that instead.
   *  Resolves with the record that was prepared last and is still the newest. */
  async settle(prepare: (value: T, ticket: number) => Promise<void>): Promise<T | null> {
    for (;;) {
      const ticket = this.seq; const value = this.value;
      if (value === null) return null;
      await prepare(value, ticket);
      if (ticket === this.seq) return value;
    }
  }
}

/** Where the playhead lands when it is outside [start, end): inside the region, on the same
 *  point of the bar it was on, so the downbeat stays on the downbeat. Past the end it wraps
 *  by whole bars (a shortened record keeps its place in the phrase); before the start it
 *  enters the region's first bar. A region shorter than one bar starts from its top.
 *  All values in ticks; `bar` is the ticks in one bar, and region edges sit on bar lines. */
export function wrapToBar(pos: number, start: number, end: number, bar: number): number {
  if (pos >= start && pos < end) return pos;
  if (end - start < bar || bar <= 0) return start;
  const phase = ((pos % bar) + bar) % bar;
  if (pos < start) return start + phase;
  const bars = Math.floor((end - start) / bar);
  const k = Math.floor((pos - start) / bar) % bars;
  const t = start + k * bar + phase;
  return t < end ? t : start + phase;
}
