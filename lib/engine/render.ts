// Offline: render the arrangement to audio, to WAV, and through the ears.
import * as Tone from "tone";
import type { Song } from "../song/types";
import { buildGraph, type Clips } from "./graph";
import { scheduleEvents } from "./schedule";
import { loadClipsFor } from "./clips";
import { getKit } from "./kits";
import { hear, describe, type MusicFacts, type HearOptions, type SectionFacts } from "../ears";
import { parseKey, keyName, chordsForSection, condense } from "../song/harmony";
import { audibleTracks } from "./schedule";
import { songSwing } from "../song/groove";

type Transport = ReturnType<typeof Tone.getTransport>;

async function clipsFor(song: Song): Promise<Clips> {
  const ids = song.tracks.map((t) => t.clip?.clipId).filter((x): x is string => !!x);
  return ids.length ? loadClipsFor(ids) : new Map();
}

async function renderOffline(song: Song, secs: number, clips: Clips, sampleRate?: number): Promise<AudioBuffer> {
  const kit = await getKit(song.lane);
  const buffer = await Tone.Offline(({ transport }) => {
    buildGraph(song, transport as unknown as Transport, clips, kit);
    transport.start(0);
  }, secs, 2, sampleRate);
  return buffer.get() as AudioBuffer;
}

export async function renderSong(song: Song, maxSeconds?: number): Promise<AudioBuffer> {
  const { totalBeats } = scheduleEvents(song);
  const secs = Math.min(maxSeconds ?? 600, (totalBeats * 60) / song.bpm + 1.5);
  return renderOffline(song, secs, await clipsFor(song));
}

export type HearSongOptions = HearOptions & { barsPerSection?: number; sampleRate?: number; sections?: string[]; force?: boolean };

// Section excerpt cache across calls: only what changed is re-rendered.
const sectionCache = new Map<string, MusicFacts>();
const CACHE_MAX = 96;
function cacheGet(key: string) { const v = sectionCache.get(key); if (v) { sectionCache.delete(key); sectionCache.set(key, v); } return v; }
function cacheSet(key: string, v: MusicFacts) { sectionCache.set(key, v); if (sectionCache.size > CACHE_MAX) sectionCache.delete(sectionCache.keys().next().value as string); }
export function sectionCacheKey(song: Song, secId: string, bars: number): string {
  const sec = song.sections.find((x) => x.id === secId);
  const audible = audibleTracks(song);
  const active = song.tracks.filter((t) => sec?.active.includes(t.id) && audible.has(t.id));
  return JSON.stringify({ sec, bars, bpm: song.bpm, h: song.humanize, g: song.groove ?? null, m: song.master, active });
}

// Which sections would re-render for this song right now (everything else is cached).
export function staleSections(song: Song, barsPerSection = 4): string[] {
  return song.arrangement.filter((id) => { const sec = song.sections.find((x) => x.id === id); return sec ? !sectionCache.has(sectionCacheKey(song, id, Math.max(1, Math.min(sec.bars, barsPerSection)))) : false; });
}

// The producer's ears on its own work. Offline rendering cost grows faster
// than linearly with duration, and every section is a loop anyway, so we hear
// each distinct section as a short excerpt (up to 8 bars) and stitch the facts
// back onto the real arrangement. Every section is heard; positions are exact.
export async function hearSong(song: Song, opts?: HearSongOptions): Promise<MusicFacts> {
  const beatSec = 60 / song.bpm;
  const maxBars = opts?.barsPerSection ?? 4;
  const sr = opts?.sampleRate ?? 22050;
  const { sectionStarts, totalBeats } = scheduleEvents(song);
  const secById = new Map(song.sections.map((s) => [s.id, s]));
  const clips = await clipsFor(song);
  const heard: { span: (typeof sectionStarts)[number]; facts: MusicFacts }[] = [];
  const stripped = { ...song, loop: null as null };
  for (const span of sectionStarts) {
    const sec = secById.get(span.id);
    if (!sec) continue;
    const bars = Math.max(1, Math.min(sec.bars, maxBars));
    const key = sectionCacheKey(song, sec.id, bars);
    let f = opts?.force ? undefined : cacheGet(key);
    if (!f) {
      const mini: Song = { ...stripped, sections: [{ ...sec, bars }], arrangement: [sec.id] };
      const buf = await renderOffline(mini, bars * 4 * beatSec + 0.4, clips, sr);
      const ch = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
      f = hear(ch, buf.sampleRate, { bpmHint: song.bpm, keyHint: song.key, label: sec.name, maxSeconds: opts?.maxSeconds });
      cacheSet(key, f);
    }
    heard.push({ span, facts: f });
  }
  if (heard.length === 0) throw new Error("nothing to hear");
  const main = heard.find((h) => /drop/i.test(h.span.name)) ?? heard.reduce((a, b) => (b.facts.loudness.integrated > a.facts.loudness.integrated ? b : a));
  const maxLufs = Math.max(...heard.map((h) => h.facts.loudness.integrated));
  const audible = audibleTracks(song);
  const kickIds = song.tracks.filter((t) => t.role === "kick" && audible.has(t.id)).map((t) => t.id);
  const sections: SectionFacts[] = heard.map((h) => ({
    start: h.span.startBeat * beatSec,
    end: (h.span.startBeat + h.span.beats) * beatSec,
    label: labelOf(h.span.name),
    lufs: h.facts.loudness.integrated,
    energy: Math.max(0, Math.min(1, Math.pow(10, (h.facts.loudness.integrated - maxLufs) / 20))),
    bands: h.facts.spectrum.bands,
    hasKick: kickIds.some((id) => secById.get(h.span.id)?.active.includes(id)),
    chords: condense(chordsForSection(song, secById.get(h.span.id)!)),
    centroidHz: Math.round(h.facts.spectrum.centroidHz),
    pump: h.facts.groove.pump,
    kickDensity: kickIds.some((id) => secById.get(h.span.id)?.active.includes(id)) ? h.facts.groove.kickDensity : 0,
    peak: h.facts.loudness.peak,
  }));
  const energy: number[] = [];
  for (const s of sections) for (let b = 0; b < Math.round((s.end - s.start) / beatSec / 4); b++) energy.push(s.energy);
  // The song knows its own notes: key, chords and swing are exact, the audio measurements stay measured.
  const k = parseKey(song.key);
  const mainSec = secById.get(main.span.id)!;
  const perBar = chordsForSection(song, mainSec);
  const minLufs = Math.min(...sections.filter((s) => s.lufs > -60).map((s) => s.lufs));
  const facts: MusicFacts = {
    ...main.facts,
    loudness: { ...main.facts.loudness, range: Math.round((maxLufs - minLufs) * 10) / 10 },
    key: k ? { name: keyName(k), tonic: k.tonic, mode: k.mode, confidence: 1, alt: main.facts.key.name } : main.facts.key,
    chords: { perBar, progression: condense(perBar) },
    groove: { ...main.facts.groove, swing: songSwing(song), kickDensity: kickIds.some((id) => mainSec.active.includes(id)) ? main.facts.groove.kickDensity : 0 },
    duration: totalBeats * beatSec,
    structure: { sections, energy, dropAt: sections.find((s) => s.label === "drop")?.start ?? null, barsTotal: Math.round(totalBeats / 4) },
    read: "",
  };
  facts.read = describe(facts);
  return facts;
}

const labelOf = (name: string): SectionFacts["label"] => {
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
