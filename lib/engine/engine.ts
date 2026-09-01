// The live studio transport: play/pause/stop, hot-swap while playing, loop
// regions, jump to a section, the visible playhead.
import * as Tone from "tone";
import type { Song } from "../song/types";
import { buildGraph, type Clips, type Graph } from "./graph";
import { locate, loopBounds, type SectionSpan } from "./schedule";
import { loadClipsFor } from "./clips";
import { getKit, type Kit } from "./kits";

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
    this.kit = await getKit(song.lane);
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
    this.kit = await getKit(song.lane);
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

  get totalBeats() { return this.builtBeats; }
  get sections() { return this.sectionStarts; }

  private async prepareClips(song: Song) {
    const ids = song.tracks.map((t) => t.clip?.clipId).filter((x): x is string => !!x);
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
