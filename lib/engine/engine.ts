// The live studio transport: play/pause/stop, a change applied to the rig while it
// plays, loop regions, jump to a section, the visible playhead, and the rig's health.
import * as Tone from "tone";
import type { Song } from "../song/types";
import { Rig, type Clips, type Health, type Applied, type LandAt } from "./rig";
import { locate, loopBounds, type SectionSpan, type Schedule } from "./schedule";
import { boundaryFor, onlyMuteSolo, type Boundary } from "./boundary";
import { Lander, moveClock, sectionSpans, landingRow, noteFirstHit, type Landing } from "./landing";
import { loadClipsFor, clipKeysFor } from "./clips";
import { getKit, kitIdFor, type Kit } from "./kits";
import { onAsset, pin } from "./assets";
import { Latest, wrapToBar } from "./steady";
import { ensureStudioContext } from "./context";
import { yieldThread, drain } from "./offline";
import { ledgerSources, assetDue, type LandingRow } from "./ledger";
import { levelsOf, type Levels } from "./levels";
import { previewThrough } from "./preview";
import { routeVoice } from "../audio/voiceBus";
export type { Levels, Landing };
export type Position = { section: string; sectionId: string; index: number; barInSection: number; beatInBar: number; absBar: number; beat: number };
// What a DAW shows in its corner: dropouts, and how many rigs are actually alive on the transport (one is right;
// more than one means an older build of the record is still playing underneath the current one).
export type EngineHealth = { graphsAlive: number; events: number; late: number; minMarginMs: number; rebuilds: number; lastRebuildMs: number };

// Every rig alive on the live transport, so a leak (one that was never torn down) is countable.
const liveRigs = new Set<Rig>();
const STOP_FADE_SEC = 0.04;   // stop fades the desk down this long before the rig comes down
const probing = () => typeof window !== "undefined" && /[?&](e2e|trace)=1/.test(window.location.search);   // a probe reads the meters

/** Decode the clips a record names and render its drum kit, before anyone presses anything: the first press
 *  finds them ready. Safe to call as often as you like. */
export const warmFor = (song: Song): Promise<unknown> => Promise.all([getKit(song.lane, song.kit, song.bpm), loadClipsFor(clipKeysFor(song), "warm", "T0")]);

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
  private rebuilds = 0; private lastRebuildMs = 0;
  private folded: Health = { events: 0, late: 0, minMarginMs: Infinity };   // counts from rigs already torn down
  private lastSection = -1;
  private laidSong: Song | null = null;   // what is on the rig now: a change's boundary is read against it
  private lastLanding: LandingRow | null = null;
  private armed: Song | null = null;       // the record laid on the stopped transport before the press
  private meters = probing();
  // The one change waiting for its boundary, and the one jump waiting for its phrase (each latest wins).
  private lander: Lander; private jumps: Lander;
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
    if (!song || !this.rig || !clipKeysFor(song).includes(key) || (this.clips.has(key) && !replaced)) return;
    this.clips.delete(key);
    void this.update(song, { jobId: `arrived:${key}`, boundary: "bar" });
  }

  private get transport() { return Tone.getTransport(); }

  /** Before the press: load the record, build its voices a step at a time (the thread goes back to the
   *  page between them), and lay it onto the stopped transport, so the press only resumes and starts. */
  async arm(song: Song): Promise<boolean> {
    if (this.playing || this.transport.state === "started") return false;
    const ticket = this.latest.take(song);
    await this.prepare(song, ticket);
    const alive = () => this.latest.current(ticket) && !this.playing;
    if (!alive()) return false;
    if (!this.rig) { this.newRig(); await yieldThread(); if (!alive()) return false; }
    if (!(await drain(this.rig!.stage(song, this.clips, this.kit ?? undefined, this.kitId), alive))) return false;
    this.lay(song, "arm", performance.now(), "now");
    return true;
  }

  /** The press: resume the context and start the transport at audio time `at` (a mark the caller also
   *  starts the greeting against), so the order of the first sounds is the same every time. A record
   *  that was armed starts at once; anything else is loaded and laid first. */
  async start(song: Song, opts?: { at?: number }) {
    const stops = this.stops;
    this.latest.take(song);
    await Tone.start();
    if (!(this.rig && this.armed === song && this.transport.state !== "started")) {
      // A change that arrives while the session is starting is the record that starts.
      const newest = await this.latest.settle((s, ticket) => this.prepare(s, ticket));
      if (stops !== this.stops) return;   // stopped while it was loading: the stop wins
      // A rig armed for another record comes down first: two rigs on one transport is the record twice.
      this.teardown();
      this.lay(newest ?? song, "start", performance.now(), "now");
    }
    if (stops !== this.stops) return;
    const ctx = Tone.getContext();
    const at = Math.max(ctx.currentTime + 0.02, opts?.at ?? ctx.now());
    this.transport.start(at);
    // The mark is where the transport's first tick is heard, in page time.
    performance.mark("producer:transport", { startTime: performance.now() + (at - ctx.currentTime) * 1000 });
    this.playing = true; this.armed = null;
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
    this.transport.stop(); this.transport.cancel(); this.playing = false; this.lander.cancel(); this.jumps.cancel();
    const r = this.detach(); if (!r) return;
    r.board.fadeOut(STOP_FADE_SEC);
    window.setTimeout(() => r.dispose(), Math.ceil(STOP_FADE_SEC * 1000) + 30);
  }

  /** A change, landed on its boundary (boundary.ts): content on the next bar, structure on the next
   *  phrase, the mixer on the next beat, mute and solo at once. Resolves once it is loaded and scheduled;
   *  `landed` settles when it is in the audio. Before the session opens this only remembers the record. */
  async update(song: Song, opts?: { jobId?: string; boundary?: Boundary; fromTop?: boolean }): Promise<Landing | null> {
    const calledAt = performance.now();
    const ticket = this.latest.take(song);
    await this.prepare(song, ticket);
    if (!this.latest.current(ticket) || !this.rig) return null;
    // The voices this change needs are built now, a step at a time, before its boundary: the landing only swaps them in.
    if (!(await drain(this.rig.stage(song, this.clips, this.kit ?? undefined, this.kitId), () => this.latest.current(ticket) && !!this.rig))) return null;
    // Another record altogether is swapped on the next bar and starts from its top.
    const other = !!this.laidSong && !!song.id && song.id !== this.laidSong.id;
    const b = opts?.boundary ?? (other ? "bar" : onlyMuteSolo(this.laidSong, song) ? "now" : boundaryFor(this.laidSong, song));
    return this.lander.land(b, () => this.latest.current(ticket) && !!this.rig, (land) => this.lay(song, opts?.jobId, calledAt, b, land, opts?.fromTop ?? other));
  }

  /** Jump to a section, on the next phrase (at once when stopped). Loops sound from the jump at their phase. */
  goto(sectionIdOrName: string): boolean {
    const s = this.sections.find((x) => x.id === sectionIdOrName || x.name.toLowerCase() === sectionIdOrName.toLowerCase());
    if (s) this.jumpTo(s.startBeat);
    return !!s;
  }
  gotoBar(absBar: number) {
    const beat = Math.max(0, (absBar - 1) * 4);
    if (beat < this.totalBeats) this.jumpTo(beat);
    return beat < this.totalBeats;
  }

  private jumpTo(beat: number) {
    const tr = this.transport; const target = Math.round(beat * tr.PPQ);
    if (tr.state !== "started") { tr.ticks = target; return; }
    const calledAt = performance.now();
    void this.jumps.land("phrase", () => !!this.rig, (land) => {
      if (!land) { tr.ticks = target; return { landsAtBar: Math.floor(beat / 4) + 1, landsAtTime: null }; }
      moveClock(tr, target, land.at);
      if (this.rig && this.laidSong) this.rig.catchUp(this.laidSong, beat, land.at);
      const row = landingRow(tr, { jobId: "goto", calledAt, boundary: "phrase", applied: { partsChanged: [], voicesRebuilt: [], held: [] }, notReady: [], where: land });
      return { landsAtBar: row.landsAtBar, landsAtTime: row.landsAtTime };
    });
  }

  getBeat(): number | null {
    if (this.sections.length === 0) return null;
    // Where the ear is, not where the scheduler is: the transport's own ticks run a lookahead (0.2 s) ahead.
    return this.transport.getTicksAtTime(Tone.immediate()) / this.transport.PPQ;
  }

  getPosition(): Position | null {
    const beat = this.getBeat(); const l = beat === null ? null : locate(this.sections, beat);
    return l && beat !== null ? { ...l, beat } : null;
  }
  /** Live meters in dB (about -100 silent, 0 full) and the master spectrum (dB per bin). Null before the rig exists. */
  getLevels(): Levels | null { return this.rig ? levelsOf(this.rig.analysis) : null; }

  /** Dropouts and leaks, summed over every rig alive on the transport. */
  health(): EngineHealth {
    let { events, late, minMarginMs } = this.folded;
    for (const r of liveRigs) { events += r.health.events; late += r.health.late; if (r.health.minMarginMs < minMarginMs) minMarginMs = r.health.minMarginMs; }
    return { graphsAlive: liveRigs.size, events, late, minMarginMs, rebuilds: this.rebuilds, lastRebuildMs: this.lastRebuildMs };
  }

  /** Audition one clip, once, through the master chain (preview.ts): the producer's "listen to this". */
  previewClip(clipId: string, gainDb = -3): Promise<boolean> { return previewThrough(this.rig?.board.buses.master ?? null, clipId, gainDb); }

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
  private lay(song: Song, jobId: string | undefined, calledAt: number, boundary: Boundary, land?: LandAt, fromTop = false) {
    const t0 = performance.now();
    if (!this.rig) this.newRig();
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
    if (fromTop) pos = start;
    tr.loop = true; tr.loopStart = `${start}i`; tr.loopEnd = `${end}i`;
    // A shorter record or a new loop moves the playhead by whole bars, on the same beat of the bar.
    const at = wrapToBar(pos, start, end, 4 * ppq);
    const from = land ? Math.round(land.beat * ppq) : tr.ticks;
    if (at !== from) { if (land) moveClock(tr, at, land.at); else tr.ticks = at; }
    const where: LandAt | undefined = land ? { at: land.at, beat: at / ppq } : undefined;
    const applied = this.rig!.apply(song, this.clips, this.kit ?? undefined, this.kitId, where);
    if (where && at !== from) this.rig!.catchUp(song, at / ppq, where.at);
    this.laidSong = song; if (tr.state !== "started") this.armed = song;   // laid on a stopped transport: armed
    this.rebuilds++; this.lastRebuildMs = Math.round(performance.now() - t0);
    if (!this.watch) this.watch = window.setInterval(() => this.tellSection(), 200);
    return this.landed(jobId, calledAt, boundary, applied, notReady, where);
  }

  // Where this change is first heard, measured (landing.ts), and the first hit of every part laid anew.
  private landed(jobId: string | undefined, calledAt: number, boundary: Boundary, applied: Applied, notReady: string[], where?: LandAt) {
    this.lastLanding = landingRow(this.transport, { jobId, calledAt, boundary, applied, notReady, where });
    return { landsAtBar: this.lastLanding.landsAtBar, landsAtTime: this.lastLanding.landsAtTime };
  }
  private firstFire(key: string, time: number) { noteFirstHit(this.lastLanding, key, time, this.transport.bpm.getValueAtTime(time)); }

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
    this.rig = null; this.laidSong = null; routeVoice(null);
    this.lastSection = -1;
    return r;
  }

  // Before a session starts nothing is sounding, so a rig left by a load comes down at once.
  private teardown() { this.detach()?.dispose(); }

  private newRig() {
    const r = new Rig(this.transport); this.rig = r; liveRigs.add(r);
    if (this.talking) r.board.talk(true, true);
    r.onFirstFire = (k, t) => this.firstFire(k, t);
    r.metering(this.meters); routeVoice(r.board.voiceIn);   // the voice joins the desk before its limiter
  }
  /** Meters exist only while something shows them (the board on screen, a probe). */
  setMetering(on: boolean) { this.meters = on || probing(); this.rig?.metering(this.meters); }
}


