// The live studio transport: play/pause/stop, a change applied to the rig while it
// plays, loop regions, jump to a section, the visible playhead, and the rig's health.
import * as Tone from "tone";
import type { Song } from "../song/types";
import { Rig, type Clips, type Health, type Applied, type LandAt } from "./rig";
import { locate, loopBounds, type SectionSpan, type Schedule } from "./schedule";
import { boundaryFor, onlyMuteSolo, type Boundary } from "./boundary";
import { Lander, moveClock, sectionSpans, type Landing } from "./landing";
export type { Landing };
import { loadClipsFor, clipKeysFor } from "./clips";
import { getKit, kitIdFor, type Kit } from "./kits";
import { onAsset, pin } from "./assets";
import { Latest, wrapToBar } from "./steady";
import { ensureStudioContext } from "./context";
import { ledgerSources, recordLanding, assetDue, type LandingRow } from "./ledger";

import { levelsOf, type Levels } from "./levels";
export type { Levels };
export type Position = { section: string; sectionId: string; index: number; barInSection: number; beatInBar: number; absBar: number; beat: number };
// What a DAW shows in its corner: dropouts, and how many rigs are actually alive on the transport (one is right;
// more than one means an older build of the record is still playing underneath the current one).
export type EngineHealth = { graphsAlive: number; events: number; late: number; minMarginMs: number; rebuilds: number; lastRebuildMs: number };

// Every rig alive on the live transport, so a leak (one that was never torn down) is countable.
const liveRigs = new Set<Rig>();
const STOP_FADE_SEC = 0.04;   // stop fades the desk down this long before the rig comes down

/** Decode the clips a record names and render its drum kit, before anyone presses anything. Both land in
 *  the caches the engine reads, so the first press finds them ready. Safe to call as often as you like. */
export async function warmFor(song: Song): Promise<void> {
  await Promise.all([getKit(song.lane, song.kit, song.bpm), loadClipsFor(clipKeysFor(song), "warm", "T0")]);
}

export class Engine {
  private rig: Rig | null = null;
  private watch: number | null = null;
  private clips: Clips = new Map();
  private kit: Kit | null = null;
  private kitId = "";
  // Latest wins: two quick changes load at once, and only the newer one is ever laid.
  private latest = new Latest<Song>();
  private stops = 0;
  private talking = false;
  private rebuilds = 0;
  private lastRebuildMs = 0;
  private folded: Health = { events: 0, late: 0, minMarginMs: Infinity };   // counts from rigs already torn down
  private lastSection = -1;
  private laidSong: Song | null = null;   // what is on the rig now: a change's boundary is read against it
  private lastLanding: LandingRow | null = null;
  private lander: Lander;                  // the one change waiting for its boundary (latest wins)
  private jumps: Lander;                   // the one jump waiting for its phrase (latest wins, apart from changes)
  playing = false;
  onSection: ((name: string, index: number, total: number) => void) | null = null;

  // The playback context before any transport or node exists (context.ts: why not the interactive one).
  constructor() {
    ensureStudioContext();
    ledgerSources({ health: () => this.health(), context: () => Tone.getContext().rawContext });
    // A sound the record names arrives (a restore, a cut, a late decode): the record is laid again and
    // only the tracks that play it change. A new sound under the same key replaces the old one.
    onAsset((e) => this.arrived(e.key, e.type === "clip-replaced"));
    this.lander = new Lander(this.transport); this.jumps = new Lander(this.transport);
  }

  private arrived(key: string, replaced: boolean) {
    const song = this.latest.newest;
    if (!song || !this.rig || !clipKeysFor(song).includes(key)) return;
    if (this.clips.has(key) && !replaced) return;
    this.clips.delete(key);
    void this.update(song, { jobId: `arrived:${key}`, boundary: "bar" });
  }

  private get transport() { return Tone.getTransport(); }

  async start(song: Song) {
    const stops = this.stops;
    this.latest.take(song);
    await Tone.start();
    // A change that arrives while the session is starting is the record that starts.
    const newest = await this.latest.settle((s, ticket) => this.prepare(s, ticket));
    if (stops !== this.stops) return;   // stopped while it was loading: the stop wins
    // Whatever a load built before the session opened comes down first: two rigs on one
    // transport is the whole record playing twice, a beat apart.
    this.teardown();
    this.lay(newest ?? song, "start", performance.now(), "now");
    this.transport.start();
    performance.mark("producer:transport");
    this.playing = true;
  }

  /** Pause at once. The loops stop with it (a GrainPlayer does not follow the transport). */
  pause() { const t = this.transport.context.now(); this.transport.pause(t); this.rig?.pauseLoops(t); this.playing = false; }
  /** Resume where it paused, and every loop that should be sounding there starts at its phase. */
  resume() {
    const t = this.transport.context.now();
    const beat = this.transport.ticks / this.transport.PPQ;
    this.transport.start(t);
    if (this.rig && this.laidSong) this.rig.catchUp(this.laidSong, beat, t);
    this.playing = true;
  }
  /** Stop: no new notes, the desk fades down over 40 ms, and only then does the rig come down, so a
   *  ringing tail is faded rather than cut. The rig leaves the live count at once; nothing new plays on it. */
  stop() {
    this.stops++;
    this.transport.stop(); this.transport.cancel(); this.playing = false;
    this.lander.cancel(); this.jumps.cancel();
    const r = this.detach(); if (!r) return;
    r.board.fadeOut(STOP_FADE_SEC);
    window.setTimeout(() => r.dispose(), Math.ceil(STOP_FADE_SEC * 1000) + 30);
  }

  /** A change, landed on its boundary (boundary.ts): content on the next bar, structure on the next
   *  phrase, the mixer on the next beat, mute and solo at once. Resolves once it is loaded and scheduled;
   *  `landed` settles when it is in the audio. Before the session opens this only remembers the record. */
  async update(song: Song, opts?: { jobId?: string; boundary?: Boundary }): Promise<Landing | null> {
    const calledAt = performance.now();
    const ticket = this.latest.take(song);
    await this.prepare(song, ticket);
    if (!this.latest.current(ticket) || !this.rig) return null;
    // The voices this change needs are built now, before its boundary, so the landing only swaps them in.
    for (const _ of this.rig.stage(song, this.clips, this.kit ?? undefined, this.kitId)) { /* built */ }
    const b = opts?.boundary ?? (onlyMuteSolo(this.laidSong, song) ? "now" : boundaryFor(this.laidSong, song));
    return this.lander.land(b, () => this.latest.current(ticket) && !!this.rig, (land) => this.lay(song, opts?.jobId, calledAt, b, land));
  }

  /** Jump to a section, on the next phrase (at once when stopped). Loops sound from the jump at their phase. */
  goto(sectionIdOrName: string): boolean {
    const s = this.sections.find((x) => x.id === sectionIdOrName || x.name.toLowerCase() === sectionIdOrName.toLowerCase());
    if (!s) return false;
    this.jumpTo(s.startBeat);
    return true;
  }

  gotoBar(absBar: number) {
    const beat = Math.max(0, (absBar - 1) * 4);
    if (beat >= this.totalBeats) return false;
    this.jumpTo(beat);
    return true;
  }

  private jumpTo(beat: number) {
    const tr = this.transport; const target = Math.round(beat * tr.PPQ);
    if (tr.state !== "started") { tr.ticks = target; return; }
    const calledAt = performance.now();
    void this.jumps.land("phrase", () => !!this.rig, (land) => {
      if (!land) { tr.ticks = target; return { landsAtBar: Math.floor(beat / 4) + 1, landsAtTime: null }; }
      moveClock(tr, target, land.at);
      if (this.rig && this.laidSong) this.rig.catchUp(this.laidSong, beat, land.at);
      recordLanding({ jobId: "goto", boundary: "phrase", calledAt, landedAt: performance.now(), landsAtBar: Math.floor(land.beat / 4) + 1, landsAtTime: land.at, beatInBar: Math.round((land.beat % 4) * 1000) / 1000, partsChanged: [], voicesRebuilt: [], notReady: [] });
      return { landsAtBar: Math.floor(land.beat / 4) + 1, landsAtTime: land.at };
    });
  }

  getBeat(): number | null {
    if (this.sections.length === 0) return null;
    // Where the ear is, not where the scheduler is: the transport's own ticks run a lookahead (0.2 s) ahead.
    return this.transport.getTicksAtTime(Tone.immediate()) / this.transport.PPQ;
  }

  getPosition(): Position | null {
    const beat = this.getBeat();
    if (beat === null) return null;
    const l = locate(this.sections, beat);
    return l ? { ...l, beat } : null;
  }

  /** Live meters in dB (about -100 silent, 0 full) and the master spectrum (dB per bin). Null before the rig exists. */
  getLevels(): Levels | null { return this.rig ? levelsOf(this.rig.analysis) : null; }

  /** Dropouts and leaks, summed over every rig alive on the transport. */
  health(): EngineHealth {
    let { events, late, minMarginMs } = this.folded;
    for (const r of liveRigs) { events += r.health.events; late += r.health.late; if (r.health.minMarginMs < minMarginMs) minMarginMs = r.health.minMarginMs; }
    return { graphsAlive: liveRigs.size, events, late, minMarginMs, rebuilds: this.rebuilds, lastRebuildMs: this.lastRebuildMs };
  }

  /** Audition one clip, once, through the master chain (so it is compressed, limited and clipped like the
   *  record and can never come out louder than it), with a 5 ms attack so it does not click in. The
   *  producer's "listen to this". Before a session exists there is no desk, and nothing else is playing. */
  async previewClip(clipId: string, gainDb = -3): Promise<boolean> {
    const bufs = await loadClipsFor([clipId], "preview"); const buf = bufs.get(clipId); if (!buf) return false;
    const p = new Tone.Player(buf); p.fadeIn = 0.005; p.fadeOut = 0.005; p.volume.value = gainDb;
    const into = this.rig?.board.buses.master; if (into) p.connect(into); else p.toDestination();
    p.start(); p.onstop = () => p.dispose();
    window.setTimeout(() => { try { p.dispose(); } catch {} }, Math.ceil(buf.duration * 1000) + 500);
    return true;
  }

  /** The record steps back while the producer speaks, and comes back after. Only the record: the duck
   *  rides the desk's music bus, not the whole destination, so an audition is not ducked with it. */
  duck(on: boolean) { this.talking = on; try { this.rig?.board.talk(on); } catch { /* no desk yet */ } }

  /** A fader move while playing: the voice ramps, nothing is rebuilt. */
  setTrackVolume(id: string, db: number): boolean { const v = this.rig?.voiceById.get(id); if (!v) return false; v.setVolume(db); return true; }

  get totalBeats() { return this.rig?.schedule.totalBeats ?? 0; }
  get sections(): SectionSpan[] { return this.rig?.schedule.sectionStarts ?? []; }
  /** Exactly the hits the transport will fire, humanized timing and all, for the board to draw. */
  getSchedule(): Schedule | null { return this.rig?.schedule ?? null; }

  // Loads what a record needs. Only the newest ticket may prune the held clips or swap the kit, so an
  // older load finishing late cannot take away what the newer record is about to play.
  private async prepare(song: Song, ticket: number) {
    const ids = clipKeysFor(song);
    pin(ids);
    const missing = ids.filter((id) => !this.clips.has(id));
    if (missing.length) { const loaded = await loadClipsFor(missing, "prepare", "T1"); for (const [k, v] of loaded) this.clips.set(k, v); }
    const kitId = kitIdFor(song.lane, song.kit, song.bpm);
    const kit = kitId !== this.kitId || !this.kit ? await getKit(song.lane, song.kit, song.bpm) : this.kit;
    if (!this.latest.current(ticket)) return;
    // Only what this record references is held here; a voice still playing an old clip keeps its own reference.
    const want = new Set(ids);
    for (const k of [...this.clips.keys()]) if (!want.has(k)) this.clips.delete(k);
    this.kit = kit; this.kitId = kitId;
  }

  // One pass of the record onto the rig, keeping the groove position (clamped to the new length). With
  // `land`, it is inside the boundary's callback: everything happens at that audio time.
  private lay(song: Song, jobId: string | undefined, calledAt: number, boundary: Boundary, land?: LandAt) {
    const t0 = performance.now();
    if (!this.rig) { this.rig = new Rig(this.transport); liveRigs.add(this.rig); if (this.talking) this.rig.board.talk(true, true); this.rig.onFirstFire = (k, t) => this.firstFire(k, t); }
    const tr = this.transport; const ppq = tr.PPQ;
    // Due now: every sound this record plays. One that is not ready is held back until it arrives.
    const keys = clipKeysFor(song); const notReady = keys.filter((k) => !this.clips.has(k));
    for (const k of keys) assetDue(k, this.clips.has(k));
    if (this.kitId) assetDue(`kit:${this.kitId}`, !!this.kit);
    // The loop region first, so the tick the transport processes next is read against it.
    const spans = sectionSpans(song);
    const loop = loopBounds(song, spans.starts, spans.total);
    const start = Math.round(loop.start * ppq), end = Math.round(Math.max(loop.start + 1, loop.end) * ppq);
    // At a wrap, the transport goes on to the old loop's end tick and wraps there only if the new loop ends by then.
    let pos = land ? Math.round(land.beat * ppq) : tr.ticks;
    if (land?.wrapNext !== undefined) pos = land.wrapNext >= end ? start : land.wrapNext;
    tr.loop = true; tr.loopStart = `${start}i`; tr.loopEnd = `${end}i`;
    // A shorter record or a new loop moves the playhead by whole bars, on the same beat of the bar.
    const at = wrapToBar(pos, start, end, 4 * ppq);
    if (at !== pos) { if (land) moveClock(tr, at, land.at); else tr.ticks = at; }
    const where: LandAt | undefined = land ? { at: land.at, beat: at / ppq } : undefined;
    const applied = this.rig.apply(song, this.clips, this.kit ?? undefined, this.kitId, where);
    if (where && at !== pos) this.rig.catchUp(song, at / ppq, where.at);
    this.laidSong = song;
    this.rebuilds++; this.lastRebuildMs = Math.round(performance.now() - t0);
    if (!this.watch) this.watch = window.setInterval(() => this.tellSection(), 200);
    return this.landed(jobId, calledAt, boundary, applied, notReady, where);
  }

  // Where this change is first heard: the boundary's audio time, and where that time sits on the
  // transport's grid (measured from the transport, not assumed). At once: now() while playing, the playhead when stopped.
  private landed(jobId: string | undefined, calledAt: number, boundary: Boundary, applied: Applied, notReady: string[], where?: LandAt) {
    const tr = this.transport; const ppq = tr.PPQ;
    const time = where ? where.at : tr.state === "started" ? tr.now() : null;
    const beat = where ? where.beat : (time !== null ? tr.getTicksAtTime(time) : tr.ticks) / ppq;
    const landsAtBar = Math.floor(beat / 4) + 1;
    // Read back: the tick the transport maps the boundary's time to (folded into the loop when it wraps there).
    let measured: number | null = null;
    if (where) {
      let t = Math.round(tr.getTicksAtTime(where.at));
      const ls = tr.toTicks(tr.loopStart), le = tr.toTicks(tr.loopEnd);
      if (tr.loop && t >= le - 0.5) t = ls + (t - le);
      measured = Math.round((((t / ppq) % 4) + 4) % 4 * 1000) / 1000;
    }
    this.lastLanding = recordLanding({ jobId, boundary, calledAt, landedAt: performance.now(), landsAtBar, landsAtTime: time, beatInBar: Math.round((((beat % 4) + 4) % 4) * 1000) / 1000, partsChanged: applied.partsChanged, voicesRebuilt: applied.voicesRebuilt, notReady: [...notReady, ...applied.held], measuredBeatInBar: measured, firstHits: {} });
    return { landsAtBar, landsAtTime: time };
  }

  // The first hit of a part laid anew, in beats after its landing's boundary.
  private firstFire(key: string, time: number) {
    const row = this.lastLanding;
    if (!row || row.landsAtTime === null || !row.partsChanged.includes(key) || !row.firstHits || key in row.firstHits) return;
    row.firstHits[key] = Math.round(((time - row.landsAtTime) * this.transport.bpm.getValueAtTime(time) / 60) * 1000) / 1000;
  }

  private tellSection() {
    if (!this.playing || !this.onSection || !this.rig) return;
    const b = this.transport.ticks / this.transport.PPQ;
    const starts = this.sections;
    const idx = starts.findIndex((s) => b >= s.startBeat && b < s.startBeat + s.beats);
    if (idx < 0 || idx === this.lastSection) return;
    this.lastSection = idx;
    this.onSection(starts[idx].name, idx, starts.length);
  }

  // Takes the rig off the transport and out of the live count, keeping its counts; the caller disposes it.
  private detach(): Rig | null {
    if (this.watch) { window.clearInterval(this.watch); this.watch = null; }
    const r = this.rig;
    if (!r) return null;
    this.folded.events += r.health.events; this.folded.late += r.health.late;
    if (r.health.minMarginMs < this.folded.minMarginMs) this.folded.minMarginMs = r.health.minMarginMs;
    liveRigs.delete(r);
    this.rig = null; this.laidSong = null;
    this.lastSection = -1;
    return r;
  }

  // Before a session starts nothing is sounding, so a rig left by a load comes down at once.
  private teardown() { this.detach()?.dispose(); }
}

