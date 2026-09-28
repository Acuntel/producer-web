// hear(): audio in, MusicFacts out. One pipeline for renders, references and hums.
import { computeFrames, decimate, fineEnvelopes, mixMono } from "./dsp";
import { fillChroma } from "./chroma";
import { analyzeLoudness } from "./loudness";
import { analyzeRhythm } from "./rhythm";
import { chordsPerBar, findKey, meanChroma, progressionOf } from "./tonal";
import { analyzeSpectrum, type BandShares } from "./spectrum";
import { analyzeStructure, type SectionFacts, type SectionLabel } from "./structure";
import { describe } from "./describe";
import { extractGroove, type GrooveTemplate } from "./groove";
import type { VocalFacts } from "./vocalFacts";

export type { BandShares, SectionFacts, SectionLabel, GrooveTemplate };

export type MusicFacts = {
  duration: number; sampleRate: number;
  tempo: { bpm: number; confidence: number; alt: number; beatOffset: number };
  groove: { swing: number; transientsPerBeat: number; pump: number; kickDensity: number; template?: GrooveTemplate };
  key: { name: string; tonic: string; mode: "major" | "minor"; confidence: number; alt: string };
  chords: { perBar: string[]; progression: string[] };
  loudness: { integrated: number; shortTermMax: number; range: number; crest: number; peak: number };
  spectrum: { bands: BandShares; centroidHz: number; mud: number; harshness: number; width: number };
  structure: { sections: SectionFacts[]; energy: number[]; dropAt: number | null; barsTotal: number };
  read: string;
  /** The voice placed in this record, as its own check measured it (vocalCheck.ts), while it is still in the song. */
  vocal?: VocalFacts;
};

export type HearOptions = { bpmHint?: number; keyHint?: string; label?: string; maxSeconds?: number };

const r1 = (v: number) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : v);

export function hear(channels: Float32Array[], sampleRate: number, opts: HearOptions = {}): MusicFacts {
  if (channels.length === 0 || channels[0].length === 0) throw new Error("hear: no audio");
  const maxSec = opts.maxSeconds ?? 240;
  const maxLen = Math.min(channels[0].length, Math.floor(maxSec * sampleRate));
  const chans = channels.map((c) => (c.length > maxLen ? c.subarray(0, maxLen) : c));
  const duration = maxLen / sampleRate;
  const loud = analyzeLoudness(chans, sampleRate);
  const { y: mono, sr } = decimate(mixMono(chans), sampleRate);
  const fr = computeFrames(mono, sr);
  fillChroma(fr, mono, sr);
  const fine = fineEnvelopes(mono, sr);
  const rhythm = analyzeRhythm(fr, fine, duration, opts.bpmHint);
  const key = findKey(meanChroma(fr), meanChroma(fr, 0, fr.count, fr.chromaSal));
  const perBar = chordsPerBar(fr, rhythm.barSec, rhythm.downbeatOffset, duration, key);
  const spectrum = analyzeSpectrum(fr, chans.length >= 2 ? chans : undefined);
  const structure = analyzeStructure(fr, loud, rhythm.barSec, rhythm.downbeatOffset, duration, perBar);
  // The groove map: where the hats and the top of the claps (onsets above 4 kHz, where the swing lives) land in each 16th slot.
  const template = extractGroove(fine.onsetHi, fine.fps, rhythm.bpm, rhythm.downbeatOffset);
  const facts: MusicFacts = {
    duration: Math.round(duration * 100) / 100, sampleRate,
    tempo: { bpm: rhythm.bpm, confidence: rhythm.confidence, alt: rhythm.alt, beatOffset: rhythm.beatOffset },
    groove: { swing: rhythm.swing, transientsPerBeat: rhythm.transientsPerBeat, pump: rhythm.pump, kickDensity: rhythm.kickDensity, template },
    key: { name: key.name, tonic: key.tonic, mode: key.mode, confidence: key.confidence, alt: key.alt },
    chords: { perBar, progression: progressionOf(perBar) },
    loudness: { integrated: r1(loud.integrated), shortTermMax: r1(loud.shortTermMax), range: r1(loud.range), crest: r1(loud.crest), peak: r1(loud.peak) },
    spectrum,
    structure,
    read: "",
  };
  facts.read = describe(facts);
  return facts;
}
