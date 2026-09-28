// A reference from what the worker already measured, with no audio in the browser. The worker heard the
// whole record (tempo, key, the bar energies and blocks, the drop, the chords); the browser used to decode
// every stem and sum them on the page's thread to hear it again, a second or more with the record playing.
// What the worker did not measure (loudness, the spectrum, the pump) is left unknown (NaN), and the
// comparison says nothing about it rather than something wrong.
import type { MusicFacts, SectionFacts } from "./facts";

type WorkerFacts = { bpm: number; tempoConfidence?: number; tempoAlt?: number | null; beatOffsetSec?: number; key: string; keyConfidence?: number; durationSec: number; bars: number; barEnergy?: number[]; blocks?: { bar: number; at: number; energy: number }[]; dropAt: number | null };
type WorkerHearing = { chords?: string[]; report?: string } | undefined;

const U = NaN;
const unknownBands = { sub: U, low: U, lowMid: U, mid: U, highMid: U, air: U };

function labelFor(energy: number, isDrop: boolean, first: boolean): SectionFacts["label"] {
  if (isDrop) return "drop"; if (first) return "intro";
  return energy >= 0.75 ? "drop" : energy >= 0.5 ? "groove" : energy >= 0.3 ? "build" : "break";
}

export function referenceFromWorker(f: WorkerFacts, hearing: WorkerHearing, name: string): MusicFacts {
  const [tonic, modeWord] = f.key.trim().split(/\s+/);
  const mode = /min/i.test(modeWord ?? "") ? "minor" : "major";
  const beat = 60 / Math.max(1, f.bpm);
  const blocks = (f.blocks ?? []).slice().sort((a, b) => a.at - b.at);
  const sections: SectionFacts[] = blocks.map((b, i) => ({
    start: b.at, end: blocks[i + 1]?.at ?? f.durationSec, label: labelFor(b.energy, f.dropAt !== null && Math.abs(b.at - f.dropAt) < beat * 2, i === 0),
    lufs: U, energy: b.energy, bands: unknownBands, hasKick: b.energy >= 0.5, chords: [],
  }));
  const chords = hearing?.chords ?? [];
  return {
    duration: f.durationSec, sampleRate: 0,
    tempo: { bpm: f.bpm, confidence: f.tempoConfidence ?? 0.5, alt: f.tempoAlt ?? f.bpm, beatOffset: f.beatOffsetSec ?? 0 },
    groove: { swing: U, transientsPerBeat: U, pump: U, kickDensity: U },
    key: { name: f.key, tonic: tonic ?? f.key, mode, confidence: f.keyConfidence ?? 0.5, alt: f.key },
    chords: { perBar: chords, progression: chords.slice(0, 8) },
    loudness: { integrated: U, shortTermMax: U, range: U, crest: U, peak: U },
    spectrum: { bands: unknownBands, centroidHz: U, mud: U, harshness: U, width: U },
    structure: { sections, energy: f.barEnergy ?? [], dropAt: f.dropAt, barsTotal: f.bars },
    read: `${name}: ${Math.round(f.bpm)} BPM, ${f.key}, as the worker heard it${hearing?.report ? `. ${hearing.report.slice(0, 240)}` : ""}.`,
  };
}
