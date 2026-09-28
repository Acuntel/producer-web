// Offline: render the arrangement to audio, to WAV, and through the ears.
import * as Tone from "tone";
import type { Song } from "../song/types";
import { buildGraphInSteps, type Clips } from "./graph";
import { renderInSteps } from "./offline";
import { scheduleEvents } from "./schedule";
import { loadClipsFor, clipKeysFor } from "./clips";
import { getKit } from "./kits";
import { describe, type MusicFacts, type HearOptions, type SectionFacts } from "../ears";
import { hearOffThread, workerAlive } from "../ears/offthread";
import { parseKey, keyName, chordsForSection, condense } from "../song/harmony";
import { audibleTracks } from "./schedule";
import { songSwing } from "../song/groove";
import { ensureStudioContext } from "./context";

type Transport = ReturnType<typeof Tone.getTransport>;

async function clipsFor(song: Song): Promise<Clips> {
  const ids = clipKeysFor(song);
  return ids.length ? loadClipsFor(ids, "listen") : new Map();
}

// Built and clocked in steps of a few milliseconds (offline.ts), so a listen never holds the thread
// the live scheduler needs: the record keeps playing while the studio hears itself.
async function renderOffline(song: Song, secs: number, clips: Clips, sampleRate?: number): Promise<AudioBuffer> {
  const kit = await getKit(song.lane, song.kit, song.bpm);
  ensureStudioContext();   // a listen can come before the stage opens; it renders at the studio's own rate
  return renderInSteps(secs, 2, sampleRate ?? Tone.getContext().sampleRate, function* (transport: Transport) {
    yield* buildGraphInSteps(song, transport, clips, kit);
    transport.start(0);
  });
}

export async function renderSong(song: Song, maxSeconds?: number): Promise<AudioBuffer> {
  const { totalBeats } = scheduleEvents(song);
  const secs = Math.min(maxSeconds ?? 600, (totalBeats * 60) / song.bpm + 1.5);
  return renderOffline(song, secs, await clipsFor(song));
}

export type HearSongOptions = HearOptions & { barsPerSection?: number; sampleRate?: number; sections?: string[]; force?: boolean };

// Where a listen actually spends its time, so "why is it stuttering" is a measurement.
export const hearTiming = { renderMs: 0, hearMs: 0, sections: 0, cached: 0, worker: false };

// One listen, cached by the whole record: the same record heard twice is measured once.
const listenCache = new Map<string, Map<string, MusicFacts>>();
const CACHE_MAX = 16;
function cacheGet(key: string) { const v = listenCache.get(key); if (v) { listenCache.delete(key); listenCache.set(key, v); } return v; }
function cacheSet(key: string, v: Map<string, MusicFacts>) { listenCache.set(key, v); if (listenCache.size > CACHE_MAX) listenCache.delete(listenCache.keys().next().value as string); }

// The producer's ears on its own work. Offline rendering cost grows faster
// than linearly with duration, and every section is a loop anyway, so we hear
// each distinct section as a short excerpt (up to 8 bars) and stitch the facts
// back onto the real arrangement. Every section is heard; positions are exact.
export async function hearSong(song: Song, opts?: HearSongOptions): Promise<MusicFacts> {
  const beatSec = 60 / song.bpm;
  // Two bars is a loop, and a loop is what these records are: it measures the same as four and the
  // render is a cooperative one, so its length is time the producer waits to know what it just made.
  const maxBars = opts?.barsPerSection ?? 2;
  const sr = opts?.sampleRate ?? 22050;
  const { sectionStarts, totalBeats } = scheduleEvents(song);
  const secById = new Map(song.sections.map((s) => [s.id, s]));
  const clips = await clipsFor(song);
  const barsOf = (id: string) => Math.max(1, Math.min(secById.get(id)?.bars ?? 1, maxBars));
  // Every distinct section, a few bars each, played end to end and rendered ONCE. Eight offline
  // contexts per listen was what made a move stutter: the contexts cost more than the audio.
  // Two sections built from the same tracks and the same variants sound the same, so they are
  // rendered once and both read the same measurement.
  const audibleNow = audibleTracks(song);
  const sigOf = (id: string) => { const s = secById.get(id)!; return JSON.stringify([s.active.filter((t) => audibleNow.has(t)), s.variants ?? null, s.fill ?? null, barsOf(id)]); };
  const stand = new Map<string, string>();   // audio signature -> the section id that stands for it
  const standsFor = new Map<string, string>();
  for (const id of new Set(song.arrangement.filter((x) => secById.has(x)))) {
    const sig = sigOf(id);
    if (!stand.has(sig)) stand.set(sig, id);
    standsFor.set(id, stand.get(sig)!);
  }
  const uniq = [...stand.values()];
  if (uniq.length === 0) throw new Error("nothing to hear");
  const mini: Song = { ...song, loop: null, sections: song.sections.map((s) => ({ ...s, bars: barsOf(s.id) })), arrangement: uniq };
  const key = JSON.stringify({ mini, sr, maxSeconds: opts?.maxSeconds });
  let byId = opts?.force ? undefined : cacheGet(key);
  if (!byId) {
    byId = new Map<string, MusicFacts>();
    const miniBeats = uniq.reduce((a, id) => a + barsOf(id) * 4, 0);
    const t0 = performance.now();
    const buf = await renderOffline(mini, miniBeats * beatSec + 0.5, clips, sr);
    const t1 = performance.now();
    hearTiming.renderMs += Math.round(t1 - t0); hearTiming.sections++;
    let cursor = 0;
    for (const id of uniq) {
      const bars = barsOf(id);
      const s0 = Math.floor(cursor * beatSec * buf.sampleRate);
      const s1 = Math.min(buf.length, Math.ceil((cursor + bars * 4) * beatSec * buf.sampleRate));
      cursor += bars * 4;
      const ch = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c).subarray(s0, s1));
      byId.set(id, await hearOffThread(ch, buf.sampleRate, { bpmHint: song.bpm, keyHint: song.key, label: secById.get(id)?.name, maxSeconds: opts?.maxSeconds }));
    }
    hearTiming.hearMs += Math.round(performance.now() - t1); hearTiming.worker = workerAlive();
    cacheSet(key, byId);
  } else hearTiming.cached++;
  const heard = sectionStarts.filter((s) => byId!.has(standsFor.get(s.id) ?? s.id)).map((span) => ({ span, facts: byId!.get(standsFor.get(span.id) ?? span.id)! }));
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

// Our own stems: the same record rendered four times with one group of roles audible each
// time, plus the mix, so the worker's ears can hear our render the way they hear a record.
const GROUPS: Record<string, string[]> = { drums: ["kick", "clap", "snare", "hat", "openhat", "perc"], bass: ["bass", "sub"], vocals: ["audio"], other: ["chords", "stab", "pad", "lead", "pluck", "arp", "fx"] };
export async function renderStemGroups(song: Song, sectionId?: string, bars = 8, sampleRate = 22050): Promise<Record<string, Blob>> {
  const sec = song.sections.find((x) => x.id === sectionId) ?? song.sections.find((x) => /drop/i.test(x.name)) ?? song.sections[0];
  if (!sec) return {};
  const excerpt: Song = { ...song, sections: [{ ...sec, bars: Math.max(1, Math.min(sec.bars, bars)) }], arrangement: [sec.id], loop: null };
  const secs = (excerpt.sections[0].bars * 4 * 60) / song.bpm + 0.5;
  const clips = await clipsFor(song);
  const out: Record<string, Blob> = {};
  out.mix = audioBufferToWav(await renderOffline(excerpt, secs, clips, sampleRate));
  for (const [name, roles] of Object.entries(GROUPS)) {
    const only: Song = { ...excerpt, tracks: excerpt.tracks.map((t) => ({ ...t, mute: !roles.includes(t.role), solo: false })) };
    if (!only.tracks.some((t) => !t.mute && sec.active.includes(t.id))) continue;
    out[name] = audioBufferToWav(await renderOffline(only, secs, clips, sampleRate));
  }
  return out;
}
