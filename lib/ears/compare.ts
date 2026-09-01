// Render versus reference: the deltas a mix engineer would call out.
import type { MusicFacts } from "./facts";
import type { BandShares } from "./spectrum";
import { NOTE_INDEX } from "./tonal";

export type Comparison = {
  text: string;
  deltas: { lufs: number; bands: BandShares; tempoRatio: number; sameKey: boolean; relativeKey: boolean; pump: number; swing: number };
};

function relative(a: MusicFacts["key"], b: MusicFacts["key"]): boolean {
  if (a.mode === b.mode) return false;
  const minor = a.mode === "minor" ? a : b, major = a.mode === "minor" ? b : a;
  return (NOTE_INDEX(minor.tonic) + 3) % 12 === NOTE_INDEX(major.tonic);
}

export function compare(render: MusicFacts, reference: MusicFacts): Comparison {
  const r = (v: number, d = 3) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
  const rb = render.spectrum.bands, fb = reference.spectrum.bands;
  const bands: BandShares = {
    sub: r(rb.sub - fb.sub), low: r(rb.low - fb.low), lowMid: r(rb.lowMid - fb.lowMid),
    mid: r(rb.mid - fb.mid), highMid: r(rb.highMid - fb.highMid), air: r(rb.air - fb.air),
  };
  const lufs = r(render.loudness.integrated - reference.loudness.integrated, 1);
  const tempoRatio = r(render.tempo.bpm / reference.tempo.bpm);
  const sameKey = render.key.name === reference.key.name;
  const relativeKey = !sameKey && relative(render.key, reference.key);
  const pump = r(render.groove.pump - reference.groove.pump);
  const swing = r(render.groove.swing - reference.groove.swing);
  const lines: string[] = [];
  const lowDelta = Math.round(((rb.sub + rb.low) - (fb.sub + fb.low)) * 100);
  if (Math.abs(lowDelta) >= 4) lines.push(`Your low end is ${Math.abs(lowDelta)} percent ${lowDelta < 0 ? "under" : "over"} the reference.`);
  else lines.push("Your low end sits where the reference sits.");
  const midDelta = Math.round(((rb.lowMid + rb.mid) - (fb.lowMid + fb.mid)) * 100);
  if (Math.abs(midDelta) >= 5) lines.push(`Your mids are ${Math.abs(midDelta)} percent ${midDelta < 0 ? "thinner" : "thicker"} than the reference.`);
  const topDelta = Math.round(((rb.highMid + rb.air) - (fb.highMid + fb.air)) * 100);
  if (Math.abs(topDelta) >= 4) lines.push(`Your top end is ${Math.abs(topDelta)} percent ${topDelta < 0 ? "darker" : "brighter"} than the reference.`);
  if (Number.isFinite(lufs) && Math.abs(lufs) >= 1) lines.push(`The reference is ${Math.abs(lufs).toFixed(1)} dB ${lufs < 0 ? "louder" : "quieter"} than you.`);
  else lines.push("Loudness matches the reference.");
  if (Math.abs(tempoRatio - 1) < 0.015) lines.push("Tempo matches.");
  else if (Math.abs(tempoRatio - 0.5) < 0.02 || Math.abs(tempoRatio - 2) < 0.04) lines.push("Tempo is an octave off the reference.");
  else lines.push(`You are at ${Math.round(render.tempo.bpm)} BPM, the reference is at ${Math.round(reference.tempo.bpm)}.`);
  if (sameKey) lines.push("Keys match.");
  else if (relativeKey) lines.push(`Keys are relatives (${render.key.name} against ${reference.key.name}).`);
  else lines.push(`Keys differ: you are in ${render.key.name}, the reference is in ${reference.key.name}.`);
  if (pump <= -0.15) lines.push("The reference pumps harder than you.");
  else if (pump >= 0.15) lines.push("You pump harder than the reference.");
  if (swing >= 0.03) lines.push("Your groove swings looser than the reference.");
  else if (swing <= -0.03) lines.push("Your groove is straighter than the reference.");
  return { text: lines.join(" "), deltas: { lufs, bands, tempoRatio, sameKey, relativeKey, pump, swing } };
}
