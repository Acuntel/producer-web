// Two more seeds, written straight from knowledge/lanes/melodic-house.md and
// deep-house.md: the grids, synth numbers, voicings and section shapes are the
// researched ones, compressed to the studio's default 8/8/8/16 arc.
import type { Song, Note } from "./types";

const VEL: Record<string, number> = { X: 120, x: 92, g: 45, o: 88, O: 112 };
// Step notation to notes (same reading as the "grid" op): 16 chars = 1 bar of 16ths.
const grid = (steps: string, midi: number, vel: Record<string, number> = {}): Note[] => {
  const v = { ...VEL, ...vel }; const out: Note[] = [];
  [...steps.replace(/[\s|]/g, "")].forEach((ch, i) => { if (ch !== "." && v[ch]) out.push([midi, i * 0.25, ch === "o" || ch === "O" ? 0.4 : 0.125, v[ch]]); });
  return out;
};
type Cell = [number, number, number];   // [startBeat in the bar, dur, vel]
// One chord root per bar, sounding on a per-bar rhythm of cells; shape picks the pitch from the root, the cell and the bar.
const perBar = (roots: number[], cells: Cell[], shape: (r: number, cell: Cell, bar: number) => number = (r) => r): Note[] =>
  roots.flatMap((r, bar) => cells.map((c) => [shape(r, c, bar), bar * 4 + c[0], c[1], c[2]] as Note));

// ---- Seed 3: NORTHERN LIGHTS. Melodic house lane, 124 BPM F minor, i-bVI-bIII-bVII over 8 bars ----
const MEL_ROOTS = [41, 41, 37, 37, 44, 44, 39, 39];                  // F2 F2 Db2 Db2 Ab2 Ab2 Eb2 Eb2 (bars 0-1 minor, the rest major)
const MEL_CHORDS: [number, number][][] = [[[53, 0], [60, 0], [65, 0], [67, 0]], [[49, 8], [56, 8], [61, 8], [63, 8]], [[56, 16], [63, 16], [68, 16], [70, 16]], [[51, 24], [58, 24], [63, 24], [65, 24]]];
const ARP_CELLS: Cell[] = [[0, 0.2, 96], [0.5, 0.2, 80], [1, 0.2, 90], [1.5, 0.2, 76], [2, 0.2, 96], [2.5, 0.2, 80], [3, 0.2, 90], [3.5, 0.2, 76]];
const ROLL_CELLS: Cell[] = [[0.25, 0.18, 110], [0.5, 0.18, 80], [0.75, 0.18, 95], [1.25, 0.18, 110], [1.5, 0.18, 80], [1.75, 0.18, 95], [2.25, 0.18, 110], [2.5, 0.18, 80], [2.75, 0.18, 95], [3.25, 0.18, 110], [3.5, 0.18, 80], [3.75, 0.18, 70]];
export const SEED_MELODIC_HOUSE: Song = {
  version: 3,
  title: "NORTHERN LIGHTS",
  bpm: 124,
  key: "F minor",
  lane: "melodic-house",
  humanize: { swing: 0.54, velVar: 0.08, clapLateMs: 6, seed: 124 },
  master: { compThreshold: -18, limiter: -1, sidechainDb: 8, sidechainReleaseMs: 150 },
  tracks: [
    { id: "kick", name: "Kick", role: "kick", volume: 0, loopBeats: 4, synth: { drumDecay: 0.3 }, notes: grid("X...X...X...X...", 36, { X: 122 }) },
    { id: "clap", name: "Clap", role: "clap", volume: -4, loopBeats: 4, fx: { reverb: 0.18 }, notes: grid("....X.......X...", 39, { X: 104 }) },
    { id: "hat", name: "Hats", role: "hat", volume: -10, duck: true, loopBeats: 4, fx: { pan: 0.1 },
      notes: grid("x.g.x.ggx.g.x.gx", 42), patterns: { sparse: grid("..x...x...x...x.", 42, { x: 78 }) } },
    { id: "openhat", name: "Open Hat", role: "openhat", volume: -9, duck: true, loopBeats: 8, fx: { pan: -0.1 }, notes: grid("................|..o...o...o...o.", 46) },
    { id: "perc", name: "Shaker", role: "perc", volume: -12, duck: true, loopBeats: 4, fx: { pan: 0.3 }, notes: grid("...xx.....x.xxx.", 46, { x: 74 }) },
    { id: "bass", name: "Bass", role: "bass", volume: -2, duck: true, loopBeats: 32,
      synth: { wave: "sawtooth", unison: 1, cutoff: 220, resonance: 2, envAmount: 1.8, decay: 0.18, sustain: 0.4, release: 0.06, glide: 0.02 }, fx: { drive: 0.2 },
      notes: perBar(MEL_ROOTS, [[0.5, 0.3, 104], [1.5, 0.3, 96], [2.5, 0.3, 104], [3.5, 0.3, 96]]),
      patterns: { roll: perBar(MEL_ROOTS, ROLL_CELLS) } },
    { id: "sub", name: "Sub", role: "sub", volume: -6, duck: true, loopBeats: 32, notes: perBar(MEL_ROOTS, [[0, 3.5, 100]], (r) => r - 12) },
    { id: "pad", name: "Pad", role: "pad", volume: -12, duck: true, loopBeats: 32, fx: { reverb: 0.35, width: 0.9, eq: { low: -6, mid: 0, high: 0 } },
      synth: { wave: "fatsawtooth", unison: 3, spread: 26, cutoff: 1200, attack: 0.6, release: 1.2 },
      notes: MEL_CHORDS.flatMap((c) => c.map(([m, at]) => [m, at, 8, 62] as Note)) },
    { id: "arp", name: "Arp", role: "arp", volume: -9, duck: true, loopBeats: 32, fx: { delay: { time: "8n.", feedback: 0.35, wet: 0.25 }, reverb: 0.3, eq: { low: -6, mid: 0, high: 0 } },
      synth: { wave: "sawtooth", decay: 0.12, sustain: 0.1 },
      // 1-5-8-10 on each chord root, octave 4-5; the tenth is minor on the i chord and major on bVI, bIII, bVII.
      notes: perBar(MEL_ROOTS, ARP_CELLS, (r, c, bar) => r + 24 + [0, 7, 12, bar < 2 ? 15 : 16][Math.round(c[0] * 2) % 4]) },
    { id: "lead", name: "Lead", role: "lead", volume: -6, duck: true, loopBeats: 32, fx: { delay: { time: "8n", feedback: 0.4, wet: 0.25 }, reverb: 0.3, width: 0.9, eq: { low: -6, mid: 0, high: 0 } },
      synth: { wave: "fatsawtooth", unison: 4, spread: 30, cutoff: 3500, attack: 0.05, decay: 0.3, sustain: 0.6, release: 0.4, glide: 0.06 },
      // Long notes on the 9th and the 5th; the raised 7th (E) leans into the tonic at bar 8.
      notes: [[79, 0.5, 6, 100], [72, 8.5, 6, 94], [80, 16, 3, 98], [79, 20, 3, 92], [75, 24, 2, 90], [72, 26, 2, 88], [76, 28, 1.5, 96], [77, 29.5, 2.5, 104]] },
  ],
  sections: [
    { id: "intro", name: "Intro", bars: 8, active: ["kick", "hat", "perc", "pad"], fill: "none", energy: 0.3, variants: { hat: "sparse" },
      automation: [{ track: "pad", param: "filter.cutoff", from: 400, to: 1400, curve: "exp" }] },
    { id: "groove", name: "Groove", bars: 8, active: ["kick", "clap", "hat", "perc", "bass", "sub", "arp"], fill: "riser", energy: 0.55,
      automation: [{ track: "arp", param: "filter.cutoff", from: 600, to: 2500, curve: "exp" }] },
    { id: "break1", name: "Break", bars: 8, active: ["pad", "lead", "arp"], fill: "cut", energy: 0.4,
      automation: [{ track: "pad", param: "filter.cutoff", from: 900, to: 5000, curve: "exp" }] },
    { id: "drop", name: "Drop", bars: 16, active: ["kick", "clap", "hat", "openhat", "perc", "bass", "sub", "arp", "lead", "pad"], fill: "none", energy: 1 },
    { id: "break", name: "Breakdown", bars: 16, active: ["pad", "lead", "arp", "clap", "hat"], fill: "roll", energy: 0.35, variants: { hat: "sparse" },
      automation: [{ track: "lead", param: "filter.cutoff", from: 1500, to: 6000, curve: "exp" }] },
    { id: "build2", name: "Build 2", bars: 4, active: ["kick", "hat", "pad", "arp"], fill: "cut", energy: 0.75,
      automation: [{ track: "master", param: "filter.cutoff", from: 500, to: 18000, curve: "exp" }] },
    { id: "drop2", name: "Drop 2", bars: 16, active: ["kick", "clap", "hat", "openhat", "perc", "bass", "sub", "arp", "lead", "pad"], fill: "none", energy: 1, variants: { bass: "roll" } },
    { id: "outro", name: "Outro", bars: 8, active: ["kick", "hat", "bass", "pad"], fill: "none", energy: 0.4, variants: { hat: "sparse" },
      automation: [{ track: "master", param: "volume", from: 0, to: -18 }] },
  ],
  arrangement: ["intro", "groove", "break1", "drop", "break", "build2", "drop2", "outro"],
  loop: null,
  notes: "Melodic house: the lead is the drop, one chord every 2 bars (Fm Db Ab Eb), pads breathe on an 8 dB sidechain, the bass rolls in drop 2.",
};

// ---- Seed 4: AFTER HOURS. Deep house lane, 123 BPM C minor, Cm9 (2 bars) Ebmaj9 Gm7 (the MAW shape) ----
const DEEP_ROOTS = [36, 36, 39, 43];                                   // C2 C2 Eb2 G2
const DEEP_VOICINGS: [number[], number, number][] = [[[63, 67, 70, 74], 0, 8], [[67, 70, 74, 77], 8, 4], [[70, 74, 77, 79], 12, 4]];   // rootless 3-5-7-9 in octave 4 (Gm7 keeps its root on top)
const STABS: [number, number][] = [[0.5, 96], [2.5, 84], [4.5, 96], [6.5, 84], [8.5, 96], [10.5, 84], [12.5, 96], [14.5, 84]];
const chordAt = (beat: number) => DEEP_VOICINGS.find(([, at, len]) => beat >= at && beat < at + len)![0];
// The deep walk: root on 1, root on the and-of-2, the 5th below on the and-of-3, the 7th below on the a-of-3 (major 7th under the Eb chord).
const walk = (r: number, c: Cell, bar: number) => (c[0] === 2.5 ? r - 5 : c[0] === 2.75 ? r - (bar === 2 ? 1 : 2) : r);
export const SEED_DEEP_HOUSE: Song = {
  version: 3,
  title: "AFTER HOURS",
  bpm: 123,
  key: "C minor",
  lane: "deep-house",
  humanize: { swing: 0.58, velVar: 0.1, clapLateMs: 10, seed: 123 },
  master: { compThreshold: -18, limiter: -1, sidechainDb: 5, sidechainReleaseMs: 120 },
  tracks: [
    { id: "kick", name: "Kick", role: "kick", volume: 0, loopBeats: 4, synth: { drumTune: -1, drumDecay: 0.3 }, notes: grid("X...X...X...X...", 36, { X: 116 }) },
    { id: "clap", name: "Clap", role: "clap", volume: -4, loopBeats: 4, fx: { reverb: 0.2 }, notes: grid("....X.......X...", 39, { X: 102 }) },
    { id: "openhat", name: "Open Hat", role: "openhat", volume: -9, duck: true, loopBeats: 4, fx: { pan: -0.12 }, notes: grid("..o...o...o...o.", 46, { o: 86 }) },
    { id: "hat", name: "Hats", role: "hat", volume: -10, duck: true, loopBeats: 4, fx: { pan: 0.12 },
      notes: grid("x.gxx.g.x.gxx.g.", 42), patterns: { sparse: grid("..x...x...x...x.", 42, { x: 78 }) } },
    { id: "shaker", name: "Shaker", role: "perc", volume: -13, duck: true, loopBeats: 4, synth: { drumDecay: 0.05 }, fx: { pan: 0.3 }, notes: grid("xgxgxgxgxgxgxgxg", 46, { x: 80, g: 50 }) },
    { id: "bass", name: "Deep Bass", role: "bass", volume: -2, duck: true, loopBeats: 16,
      synth: { wave: "triangle", unison: 1, cutoff: 400, resonance: 2, envAmount: 1.5, decay: 0.2, sustain: 0.3, release: 0.08 }, fx: { drive: 0.15 },
      notes: perBar(DEEP_ROOTS, [[0, 1.5, 108], [1.5, 0.5, 92], [2.5, 0.25, 84], [2.75, 0.25, 80]], walk),
      patterns: { bounce: perBar(DEEP_ROOTS, [[0.5, 0.22, 104], [1.5, 0.22, 100], [2, 0.22, 96], [2.5, 0.22, 96], [3.5, 0.22, 80], [3.75, 0.22, 84]]) } },
    { id: "sub", name: "Sub", role: "sub", volume: -6, duck: true, loopBeats: 16, notes: perBar(DEEP_ROOTS, [[0, 1.5, 100], [1.5, 0.5, 90]], (r) => r - 12) },
    { id: "stab", name: "Rhodes Stabs", role: "stab", volume: -8, duck: true, loopBeats: 16, synth: { wave: "epiano" },
      fx: { delay: { time: "8n.", feedback: 0.25, wet: 0.15 }, reverb: 0.22, eq: { low: -3, mid: 0, high: 0 }, pan: -0.15 },
      notes: STABS.flatMap(([at, vel]) => chordAt(at).map((m) => [m, at, 0.3, vel] as Note)) },
    { id: "chords", name: "Rhodes Chords", role: "chords", volume: -10, duck: true, loopBeats: 16, synth: { wave: "epiano", attack: 0.02, release: 0.6 },
      fx: { reverb: 0.2, width: 0.8, eq: { low: -3, mid: 0, high: 0 }, filter: { type: "lowpass", cutoff: 4000 } },
      notes: DEEP_VOICINGS.flatMap(([v, at, len]) => v.map((m) => [m, at, len - 0.25, 70] as Note)) },
    { id: "pad", name: "Pad", role: "pad", volume: -14, duck: true, loopBeats: 16, fx: { reverb: 0.3, width: 0.85 }, synth: { wave: "fatsawtooth", unison: 2, cutoff: 1400, attack: 0.5, release: 1 },
      notes: [[48, 0, 8, 56], [55, 0, 8, 54], [60, 0, 8, 52], [51, 8, 4, 56], [58, 8, 4, 54], [63, 8, 4, 52], [55, 12, 4, 56], [62, 12, 4, 54], [67, 12, 4, 52]] },
    { id: "pluck", name: "Piano Riff", role: "pluck", volume: -9, duck: true, loopBeats: 16, synth: { wave: "epiano", decay: 0.3 }, fx: { delay: { time: "8n", feedback: 0.3, wet: 0.2 }, reverb: 0.2, pan: 0.2 },
      notes: [[79, 1.5, 0.25, 92], [75, 1.75, 0.25, 84], [72, 2, 0.5, 96], [74, 5.5, 0.25, 90], [72, 5.75, 0.25, 84], [67, 6, 0.5, 94], [77, 9.5, 0.25, 92], [75, 9.75, 0.25, 84], [70, 10, 0.5, 96], [74, 13.5, 0.25, 90], [77, 13.75, 0.25, 84], [79, 14, 0.75, 96]] },
  ],
  sections: [
    { id: "intro", name: "Intro", bars: 8, active: ["kick", "hat", "shaker", "chords"], fill: "none", energy: 0.3, variants: { hat: "sparse" },
      automation: [{ track: "chords", param: "filter.cutoff", from: 400, to: 2500, curve: "exp" }] },
    { id: "groove", name: "Groove", bars: 8, active: ["kick", "clap", "openhat", "hat", "shaker", "bass", "sub", "stab"], fill: "riser", energy: 0.6 },
    { id: "break1", name: "Break", bars: 8, active: ["chords", "pad", "stab", "hat"], fill: "riser", energy: 0.4, variants: { hat: "sparse" },
      automation: [{ track: "chords", param: "filter.cutoff", from: 800, to: 4000, curve: "exp" }] },
    { id: "drop", name: "Drop", bars: 16, active: ["kick", "clap", "openhat", "hat", "shaker", "bass", "sub", "stab", "chords"], fill: "none", energy: 0.9 },
    { id: "break", name: "Breakdown", bars: 8, active: ["chords", "pad", "clap", "hat"], fill: "roll", energy: 0.35, variants: { hat: "sparse" },
      automation: [{ track: "pad", param: "reverb", from: 0.3, to: 0.5 }] },
    { id: "build2", name: "Build 2", bars: 4, active: ["kick", "hat", "chords", "pad"], fill: "cut", energy: 0.7,
      automation: [{ track: "master", param: "filter.cutoff", from: 700, to: 18000, curve: "exp" }] },
    { id: "drop2", name: "Drop 2", bars: 16, active: ["kick", "clap", "openhat", "hat", "shaker", "bass", "sub", "stab", "chords", "pad", "pluck"], fill: "none", energy: 1, variants: { bass: "bounce" } },
    { id: "outro", name: "Outro", bars: 8, active: ["kick", "hat", "bass", "chords"], fill: "none", energy: 0.4, variants: { hat: "sparse" },
      automation: [{ track: "master", param: "volume", from: 0, to: -18 }] },
  ],
  arrangement: ["intro", "groove", "break1", "drop", "break", "build2", "drop2", "outro"],
  loop: null,
  notes: "Deep house: round kick, m9 Rhodes stabs on the and-of-1 and and-of-3, a walking triangle bass, grooves not blasts (drop 1 at 0.9), the piano riff arrives in drop 2.",
};
