// The live studio transport: play/pause/stop, a change applied to the rig while it
// plays, loop regions, jump to a section, the visible playhead, and the rig's health.
import * as Tone from "tone";
import type { Song } from "../song/types";
import { Rig, type Clips, type Health } from "./rig";
import { locate, loopBounds, type SectionSpan, type Schedule } from "./schedule";
import { loadClipsFor, clipKeysFor } from "./clips";
import { getKit, kitStyleFor, type Kit } from "./kits";

export type Levels = { master: [number, number]; spectrum: Float32Array | null; tracks: Record<string, number> };
export type Position = { section: string; sectionId: string; index: number; barInSection: number; beatInBar: number; absBar: number; beat: number };
// What a DAW shows in its corner: dropouts, and how many rigs are actually alive on the transport (one is right;
// more than one means an older build of the record is still playing underneath the current one).
export type EngineHealth = { graphsAlive: number; events: number; late: number; minMarginMs: number; rebuilds: number; lastRebuildMs: number };

// Every rig alive on the live transport, so a leak (one that was never torn down) is countable.
const liveRigs = new Set<Rig>();

export class Engine {
  private rig: Rig | null = null;
  private watch: number | null = null;
  private clips: Clips = new Map();
  private kit: Kit | null = null;
  private kitId = "";
  private song: Song | null = null;
  private rebuilds = 0;
  private lastRebuildMs = 0;
  private folded: Health = { events: 0, late: 0, minMarginMs: Infinity };   // counts from rigs already torn down
  private lastSection = -1;
  playing = false;
  onSection: ((name: string, index: number, total: number) => void) | null = null;

  private get transport() { return Tone.getTransport(); }

  async start(song: Song) {
    await Tone.start();
    await this.prepare(song);
    // Whatever a load built before the session opened comes down first: two rigs on one
    // transport is the whole record playing twice, a beat apart.
    this.teardown();
    this.lay(song);
    this.transport.start();
    this.playing = true;
  }

  pause() { this.transport.pause(); this.playing = false; }
  resume() { this.transport.start(); this.playing = true; }
  stop() { this.transport.stop(); this.transport.cancel(); this.teardown(); this.playing = false; }

  /** A change, applied while it plays. Before the session opens this only remembers the record. */
  async update(song: Song) {
    this.song = song;
    await this.prepare(song);
    if (!this.rig) return;
    this.lay(song);
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
    return this.transport.ticks / this.transport.PPQ;
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
    return { master, spectrum: r.analysis.fft.getValue(), tracks };
  }

  /** Dropouts and leaks, summed over every rig alive on the transport. */
  health(): EngineHealth {
    let { events, late, minMarginMs } = this.folded;
    for (const r of liveRigs) { events += r.health.events; late += r.health.late; if (r.health.minMarginMs < minMarginMs) minMarginMs = r.health.minMarginMs; }
    return { graphsAlive: liveRigs.size, events, late, minMarginMs, rebuilds: this.rebuilds, lastRebuildMs: this.lastRebuildMs };
  }

  /** Audition one clip, once, through the master. The producer's "listen to this". */
  async previewClip(clipId: string, gainDb = -3): Promise<boolean> {
    const bufs = await loadClipsFor([clipId]); const buf = bufs.get(clipId); if (!buf) return false;
    const p = new Tone.Player(buf).toDestination(); p.volume.value = gainDb;
    p.start(); p.onstop = () => p.dispose();
    window.setTimeout(() => { try { p.dispose(); } catch {} }, Math.ceil(buf.duration * 1000) + 500);
    return true;
  }

  /** The music steps back while the producer speaks, and comes back after. */
  duck(on: boolean) { try { Tone.getDestination().volume.rampTo(on ? -7 : 0, on ? 0.12 : 0.35); } catch { /* no context yet */ } }

  /** A fader move while playing: the voice ramps, nothing is rebuilt. */
  setTrackVolume(id: string, db: number): boolean { const v = this.rig?.voiceById.get(id); if (!v) return false; v.setVolume(db); return true; }

  get totalBeats() { return this.rig?.schedule.totalBeats ?? 0; }
  get sections(): SectionSpan[] { return this.rig?.schedule.sectionStarts ?? []; }
  /** Exactly the hits the transport will fire, humanized timing and all, for the board to draw. */
  getSchedule(): Schedule | null { return this.rig?.schedule ?? null; }

  private async prepare(song: Song) {
    const ids = clipKeysFor(song);
    const missing = ids.filter((id) => !this.clips.has(id));
    if (missing.length) { const loaded = await loadClipsFor(missing); for (const [k, v] of loaded) this.clips.set(k, v); }
    // Only what this record references is held here; a voice still playing an old clip keeps its own reference.
    const want = new Set(ids);
    for (const k of [...this.clips.keys()]) if (!want.has(k)) this.clips.delete(k);
    const kitId = `${song.kit ?? "synth"}|${kitStyleFor(song.lane, song.bpm)}`;
    if (kitId !== this.kitId || !this.kit) { this.kit = await getKit(song.lane, song.kit, song.bpm); this.kitId = kitId; }
  }

  // One pass of the record onto the rig, keeping the groove position (clamped to the new length).
  private lay(song: Song) {
    const t0 = performance.now();
    if (!this.rig) { this.rig = new Rig(this.transport); liveRigs.add(this.rig); }
    const pos = this.transport.ticks;
    this.rig.apply(song, this.clips, this.kit ?? undefined, this.kitId);
    this.rebuilds++; this.lastRebuildMs = Math.round(performance.now() - t0);
    const end = Math.max(1, this.totalBeats * this.transport.PPQ);
    if (pos > end) this.transport.ticks = pos % end;
    const loop = loopBounds(song, this.sections, this.totalBeats);
    this.transport.loop = true;
    this.transport.loopStart = `${Math.round(loop.start * this.transport.PPQ)}i`;
    this.transport.loopEnd = `${Math.round(Math.max(loop.start + 1, loop.end) * this.transport.PPQ)}i`;
    const beat = this.transport.ticks / this.transport.PPQ;
    if (beat < loop.start || beat >= loop.end) this.transport.ticks = Math.round(loop.start * this.transport.PPQ);
    if (!this.watch) this.watch = window.setInterval(() => this.tellSection(), 200);
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

  private teardown() {
    if (this.watch) { window.clearInterval(this.watch); this.watch = null; }
    const r = this.rig;
    if (!r) return;
    this.folded.events += r.health.events; this.folded.late += r.health.late;
    if (r.health.minMarginMs < this.folded.minMarginMs) this.folded.minMarginMs = r.health.minMarginMs;
    r.dispose();
    liveRigs.delete(r);
    this.rig = null;
    this.lastSection = -1;
  }
}
