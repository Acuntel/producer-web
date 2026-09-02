// Browser glue: decode a file, hear an AudioBuffer, compact facts for the brain prompt.
import { hear, type HearOptions, type MusicFacts } from "./facts";
import { mmss } from "./describe";
import { grooveTemplateLine } from "./groove";

export async function decodeFile(file: Blob): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer();
  const ctx = new OfflineAudioContext(2, 44100, 44100);
  return ctx.decodeAudioData(bytes);
}

export async function hearBuffer(buf: AudioBuffer, opts?: HearOptions): Promise<MusicFacts> {
  await new Promise((r) => setTimeout(r, 0)); // let the UI paint before the crunch
  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) channels.push(buf.getChannelData(c));
  return hear(channels, buf.sampleRate, opts);
}

const pc = (v: number) => Math.round(v * 100);

// Compact, rounded view of the facts (about 1 KB) for the text-only brain.
export function factsForBrain(f: MusicFacts): object {
  const b = f.spectrum.bands;
  return {
    bpm: Math.round(f.tempo.bpm * 10) / 10, bpmConfidence: f.tempo.confidence, bpmAlt: Math.round(f.tempo.alt),
    key: f.key.name, keyConfidence: f.key.confidence, keyAlt: f.key.alt,
    lufs: f.loudness.integrated, loudnessRange: f.loudness.range, crestDb: f.loudness.crest, peakDb: f.loudness.peak,
    bandsPercent: { sub: pc(b.sub), low: pc(b.low), lowMid: pc(b.lowMid), mid: pc(b.mid), highMid: pc(b.highMid), air: pc(b.air) },
    centroidHz: f.spectrum.centroidHz, mud: f.spectrum.mud, harshness: f.spectrum.harshness, stereoWidth: f.spectrum.width,
    swing: f.groove.swing, pump: f.groove.pump, kicksPerBar: f.groove.kickDensity, transientsPerBeat: f.groove.transientsPerBeat,
    grooveMap: f.groove.template ? grooveTemplateLine(f.groove.template, f.tempo.bpm) : undefined,
    chords: f.chords.progression,
    dropAt: f.structure.dropAt === null ? null : mmss(f.structure.dropAt),
    bars: f.structure.barsTotal,
    sections: f.structure.sections.slice(0, 8).map((s) => ({ at: mmss(s.start), label: s.label, lufs: s.lufs, kick: s.hasKick, chords: s.chords.slice(0, 4) })),
    read: f.read,
  };
}
