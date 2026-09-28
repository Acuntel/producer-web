// The live studio transport: play/pause/stop, a change applied to the rig while it
// plays, loop regions, jump to a section, the visible playhead, and the rig's health.
import * as Tone from "tone";
import type { Song } from "../song/types";
import { Rig, type Clips, type Health, type Applied } from "./rig";
import { locate, loopBounds, type SectionSpan, type Schedule } from "./schedule";
import { loadClipsFor, clipKeysFor } from "./clips";
import { getKit, kitStyleFor, type Kit } from "./kits";
import { Latest, wrapToBar } from "./steady";
import { ensureStudioContext } from "./context";
import { ledgerSources, recordLanding, assetDue } from "./ledger";

// master = the bars' smoothed level; peak = the loudest sample in the last frame, per channel, in dBFS.
export type Levels = { master: [number, number]; peak: [number, number]; spectrum: Float32Array | null; tracks: Record<string, number> };
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
  await Promise.all([getKit(song.lane, song.kit, song.bpm), loadClipsFor(clipKeysFor(song), "warm")]);
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
  playing = false;
  onSection: ((name: string, index: number, total: number) => void) | null = null;

  // The playback context before any transport or node exists (context.ts: why not the interactive one).
  constructor() {
    ensureStudioContext();
    ledgerSources({ health: () => this.health(), context: () => Tone.getContext().rawContext });
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
    this.lay(newest ?? song, "start", performance.now());
    this.transport.start();
    performance.mark("producer:transport");
    this.playing = true;
  }

  pause() { this.transport.pause(); this.playing = false; }
  resume() { this.transport.start(); this.playing = true; }
  /** Stop: no new notes, the desk fades down over 40 ms, and only then does the rig come down, so a
   *  ringing tail is faded rather than cut. The rig leaves the live count at once; nothing new plays on it. */
  stop() {
    this.stops++;
    this.transport.stop(); this.transport.cancel(); this.playing = false;
    const r = this.detach(); if (!r) return;
    r.board.fadeOut(STOP_FADE_SEC);
    window.setTimeout(() => r.dispose(), Math.ceil(STOP_FADE_SEC * 1000) + 30);
  }

  /** A change, applied while it plays. Before the session opens this only remembers the record.
   *  Latest wins: if a newer record arrives while this one is loading, this one is never laid. */
  async update(song: Song, opts?: { jobId?: string }) {
    const calledAt = performance.now();
    const ticket = this.latest.take(song);
    await this.prepare(song, ticket);
    if (!this.latest.current(ticket) || !this.rig) return;
    this.lay(song, opts?.jobId, calledAt);
  }

  goto(sectionIdOrName: string): boolean {
    const s = this.sections.find((x) => x.id === sectionIdOrName || x.name.toLowerCase() === sectionIdOrName.toLowerCase());
    if (!s) return false;
    this.transport.ticks = Math.round(s.startBeat * this.transport.PPQ);
    return true;
  }

  gotoBar(absBar: number) {
    const beat = Math.max(0, (absBar - 1) * 4);
    if (beat >= this.totalBeats) return false;
    this.transport.ticks = Math.round(beat * this.transport.PPQ);
    return true;
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
  getLevels(): Levels | null {
    const r = this.rig; if (!r) return null;
    const m = r.analysis.meter.getValue();
    const master: [number, number] = Array.isArray(m) ? [Number(m[0]), Number(m[1] ?? m[0])] : [Number(m), Number(m)];
    const tracks: Record<string, number> = {};
    for (const [id, tm] of r.analysis.tracks) { const v = tm.getValue(); tracks[id] = Array.isArray(v) ? Number(v[0]) : Number(v); }
    const pk = (a: Float32Array) => { let p = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > p) p = v; } return p > 0 ? 20 * Math.log10(p) : -100; };
    const w = r.analysis.wave?.getValue();
    const peak: [number, number] = Array.isArray(w) ? [pk(w[0]), pk(w[1] ?? w[0])] : w ? [pk(w), pk(w)] : master;
    return { master, peak, spectrum: r.analysis.fft.getValue(), tracks };
  }

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
    const missing = ids.filter((id) => !this.clips.has(id));
    if (missing.length) { const loaded = await loadClipsFor(missing, "prepare"); for (const [k, v] of loaded) this.clips.set(k, v); }
    const kitId = `${song.kit ?? "synth"}|${kitStyleFor(song.lane, song.bpm)}`;
    const kit = kitId !== this.kitId || !this.kit ? await getKit(song.lane, song.kit, song.bpm) : this.kit;
    if (!this.latest.current(ticket)) return;
    // Only what this record references is held here; a voice still playing an old clip keeps its own reference.
    const want = new Set(ids);
    for (const k of [...this.clips.keys()]) if (!want.has(k)) this.clips.delete(k);
    this.kit = kit; this.kitId = kitId;
  }

  // One pass of the record onto the rig, keeping the groove position (clamped to the new length).
  private lay(song: Song, jobId?: string, calledAt = performance.now()) {
    const t0 = performance.now();
    if (!this.rig) { this.rig = new Rig(this.transport); liveRigs.add(this.rig); if (this.talking) this.rig.board.talk(true, true); }
    const pos = this.transport.ticks;
    // Due now: every sound this record plays. One that is not ready is silence where it belongs.
    const keys = clipKeysFor(song); const notReady = keys.filter((k) => !this.clips.has(k));
    for (const k of keys) assetDue(k, this.clips.has(k));
    if (this.kitId) assetDue(`kit:${this.kitId}`, !!this.kit);
    const applied = this.rig.apply(song, this.clips, this.kit ?? undefined, this.kitId);
    this.rebuilds++; this.lastRebuildMs = Math.round(performance.now() - t0);
    const ppq = this.transport.PPQ;
    const loop = loopBounds(song, this.sections, this.totalBeats);
    const start = Math.round(loop.start * ppq), end = Math.round(Math.max(loop.start + 1, loop.end) * ppq);
    this.transport.loop = true;
    this.transport.loopStart = `${start}i`;
    this.transport.loopEnd = `${end}i`;
    // A shorter record or a new loop moves the playhead by whole bars, on the same beat of the bar.
    const at = wrapToBar(pos, start, end, 4 * ppq);
    if (at !== pos) this.transport.ticks = at;
    if (!this.watch) this.watch = window.setInterval(() => this.tellSection(), 200);
    this.landed(jobId, calledAt, applied, notReady);
  }

  // Where this change is first heard: the transport's position at the moment new parts start firing
  // (now() while playing, the playhead when stopped). Today that is wherever the playhead happens to be.
  private landed(jobId: string | undefined, calledAt: number, applied: Applied, notReady: string[]) {
    const tr = this.transport; const ppq = tr.PPQ;
    const time = tr.state === "started" ? tr.now() : null;
    const beat = (time !== null ? tr.getTicksAtTime(time) : tr.ticks) / ppq;
    recordLanding({ jobId, boundary: "now", calledAt, landedAt: performance.now(), landsAtBar: Math.floor(beat / 4) + 1, landsAtTime: time, beatInBar: Math.round((beat % 4) * 1000) / 1000, partsChanged: applied.partsChanged, voicesRebuilt: applied.voicesRebuilt, notReady });
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
    this.rig = null;
    this.lastSection = -1;
    return r;
  }

  // Before a session starts nothing is sounding, so a rig left by a load comes down at once.
  private teardown() { this.detach()?.dispose(); }
}
