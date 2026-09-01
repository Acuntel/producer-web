// Offline: render the whole arrangement to audio, to WAV, and through the ears.
import * as Tone from "tone";
import type { Song } from "../song/types";
import { buildGraph, type Clips } from "./graph";
import { scheduleEvents } from "./schedule";
import { loadClipsFor } from "./clips";
import { hear, type MusicFacts, type HearOptions } from "../ears";

async function clipsFor(song: Song): Promise<Clips> {
  const ids = song.tracks.map((t) => t.clip?.clipId).filter((x): x is string => !!x);
  return ids.length ? loadClipsFor(ids) : new Map();
}

export async function renderSong(song: Song, maxSeconds?: number): Promise<AudioBuffer> {
  const { totalBeats } = scheduleEvents(song);
  const secs = Math.min(maxSeconds ?? 600, (totalBeats * 60) / song.bpm + 1.5);
  const clips = await clipsFor(song);
  const buffer = await Tone.Offline(({ transport }) => {
    buildGraph(song, transport as unknown as ReturnType<typeof Tone.getTransport>, clips);
    transport.start(0);
  }, secs);
  return buffer.get() as AudioBuffer;
}

// The producer's ears on its own work: the full render, heard like any track.
export async function hearSong(song: Song, opts?: HearOptions): Promise<MusicFacts> {
  const buf = await renderSong(song, opts?.maxSeconds);
  const channels = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const { sectionStarts } = scheduleEvents(song);
  const facts = hear(channels, buf.sampleRate, { bpmHint: song.bpm, keyHint: song.key, label: song.title, ...opts });
  // The engine knows its own sections exactly; label the heard structure with them.
  const beatSec = 60 / song.bpm;
  facts.structure.sections = facts.structure.sections.map((s) => {
    const mid = (s.start + s.end) / 2;
    const own = sectionStarts.find((x) => mid >= x.startBeat * beatSec && mid < (x.startBeat + x.beats) * beatSec);
    return own ? { ...s, label: labelOf(own.name) } : s;
  });
  return facts;
}

const labelOf = (name: string): MusicFacts["structure"]["sections"][number]["label"] => {
  const n = name.toLowerCase();
  if (n.includes("drop")) return "drop";
  if (n.includes("build")) return "build";
  if (n.includes("break")) return "break";
  if (n.includes("intro")) return "intro";
  if (n.includes("outro")) return "outro";
  if (n.includes("groove")) return "groove";
  return "section";
};

export async function renderWav(song: Song): Promise<Blob> {
  return audioBufferToWav(await renderSong(song));
}

export function audioBufferToWav(buf: AudioBuffer): Blob {
  const numCh = Math.min(2, buf.numberOfChannels);
  const length = buf.length * numCh * 2;
  const out = new DataView(new ArrayBuffer(44 + length));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); out.setUint32(4, 36 + length, true); w(8, "WAVE");
  w(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true);
  out.setUint16(22, numCh, true); out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * numCh * 2, true); out.setUint16(32, numCh * 2, true);
  out.setUint16(34, 16, true); w(36, "data"); out.setUint32(40, length, true);
  let off = 44;
  const chans = Array.from({ length: numCh }, (_, c) => buf.getChannelData(c));
  for (let i = 0; i < buf.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      out.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}
