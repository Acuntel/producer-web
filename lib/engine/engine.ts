// The live studio transport: play/pause/stop, hot-swap while playing, loop
// regions, jump to a section, the visible playhead.
import * as Tone from "tone";
import type { Song } from "../song/types";
import { buildGraph, type Clips, type Graph } from "./graph";
import { locate, loopBounds, type SectionSpan } from "./schedule";
import { loadClipsFor, clipKeysFor } from "./clips";
import { getKit, type Kit } from "./kits";

export type Levels = { master: [number, number]; spectrum: Float32Array | null; tracks: Record<string, number> };
export type Position = { section: string; sectionId: string; index: number; barInSection: number; beatInBar: number; absBar: number; beat: number };

export class Engine {
  private graph: Graph | null = null;
  private watch: number | null = null;
  private sectionStarts: SectionSpan[] = [];
  private builtBeats = 0;
  private clips: Clips = new Map();
  private kit: Kit | null = null;
  playing = false;
  onSection: ((name: string, index: number, total: number) => void) | null = null;

  private get transport() { return Tone.getTransport(); }

  async start(song: Song) {
    await Tone.start();
    await this.prepareClips(song);
    this.kit = await getKit(song.lane, song.kit, song.bpm);
    this.buildLive(song);
    this.transport.start();
    this.playing = true;
  }

  pause() { this.transport.pause(); this.playing = false; }
  resume() { this.transport.start(); this.playing = true; }
  stop() { this.transport.stop(); this.transport.cancel(); this.teardown(); this.playing = false; }

  // Rebuild playing OR paused, keeping the groove position (clamped to the new length).
  async update(song: Song) {
    await this.prepareClips(song);
    this.kit = await getKit(song.lane, song.kit, song.bpm);
    const pos = this.transport.ticks;
    this.teardown();
    this.buildLive(song);
    const end = Math.max(1, this.builtBeats * this.transport.PPQ);
    this.transport.ticks = pos % end;
  }

  goto(sectionIdOrName: string): boolean {
    const s = this.sectionStarts.find((x) => x.id === sectionIdOrName || x.name.toLowerCase() === sectionIdOrName.toLowerCase());
    if (!s) return false;
    this.transport.ticks = Math.round(s.startBeat * this.transport.PPQ);
    return true;
  }

  gotoBar(absBar: number) {
    const beat = Math.max(0, (absBar - 1) * 4);
    if (beat >= this.builtBeats) return false;
    this.transport.ticks = Math.round(beat * this.transport.PPQ);
    return true;
  }

  getBeat(): number | null {
    if (this.sectionStarts.length === 0) return null;
    return this.transport.ticks / this.transport.PPQ;
  }

  getPosition(): Position | null {
    const beat = this.getBeat();
    if (beat === null) return null;
    const l = locate(this.sectionStarts, beat);
    return l ? { ...l, beat } : null;
  }

  /** Live meters in dB (about -100 silent, 0 full) and the master spectrum (dB per bin). Null before the graph exists. */
  getLevels(): Levels | null {
    const g = this.graph; if (!g) return null;
    const m = g.analysis.meter.getValue();
    const master: [number, number] = Array.isArray(m) ? [Number(m[0]), Number(m[1] ?? m[0])] : [Number(m), Number(m)];
    const tracks: Record<string, number> = {};
    for (const [id, tm] of g.analysis.tracks) { const v = tm.getValue(); tracks[id] = Array.isArray(v) ? Number(v[0]) : Number(v); }
    return { master, spectrum: g.analysis.fft.getValue(), tracks };
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
  setTrackVolume(id: string, db: number): boolean { const v = this.graph?.voiceById.get(id); if (!v) return false; v.setVolume(db); return true; }

  get totalBeats() { return this.builtBeats; }
  get sections() { return this.sectionStarts; }

  private async prepareClips(song: Song) {
    const ids = clipKeysFor(song);
    if (ids.length === 0) return;
    const missing = ids.filter((id) => !this.clips.has(id));
    if (missing.length === 0) return;
    const loaded = await loadClipsFor(missing);
    for (const [k, v] of loaded) this.clips.set(k, v);
  }

  private buildLive(song: Song) {
    const g = buildGraph(song, this.transport, this.clips, this.kit ?? undefined);
    this.graph = g;
    this.sectionStarts = g.schedule.sectionStarts;
    this.builtBeats = g.schedule.totalBeats;
    const loop = loopBounds(song, this.sectionStarts, this.builtBeats);
    this.transport.loop = true;
    this.transport.loopStart = `${Math.round(loop.start * this.transport.PPQ)}i`;
    this.transport.loopEnd = `${Math.round(Math.max(loop.start + 1, loop.end) * this.transport.PPQ)}i`;
    const beat = this.transport.ticks / this.transport.PPQ;
    if (beat < loop.start || beat >= loop.end) this.transport.ticks = Math.round(loop.start * this.transport.PPQ);
    if (this.watch) window.clearInterval(this.watch);
    this.watch = window.setInterval(() => {
      if (!this.playing || !this.onSection) return;
      const b = this.transport.ticks / this.transport.PPQ;
      const idx = g.schedule.sectionStarts.findIndex((s) => b >= s.startBeat && b < s.startBeat + s.beats);
      if (idx >= 0) this.onSection(g.schedule.sectionStarts[idx].name, idx, g.schedule.sectionStarts.length);
    }, 250);
  }

  private teardown() {
    if (this.watch) { window.clearInterval(this.watch); this.watch = null; }
    const g = this.graph;
    if (!g) return;
    g.parts.forEach((p) => { p.stop(); p.dispose(); });
    g.voices.forEach((v) => v.dispose());
    g.nodes.forEach((n) => n.dispose());
    this.graph = null;
  }
}
