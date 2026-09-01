// SongDoc v2 — sections, arrangement, lanes, deterministic humanization.
// The brain writes STRAIGHT grid notes; the engine applies swing/pocket/velocity
// feel from `humanize` (seeded, reproducible). Notes: [midi, startBeat, durBeats, vel1-127].
export type Role =
  | "kick" | "clap" | "snare" | "hat" | "openhat"
  | "bass" | "sub" | "chords" | "stab" | "pad" | "lead" | "pluck";

export type Track = {
  id: string;
  name: string;
  role: Role;
  volume: number;      // dB, 0 = unity
  duck?: boolean;      // sidechained to the kick (the pump)
  mute?: boolean;
  loopBeats: number;   // pattern length; tiles across each section
  notes: [number, number, number, number][];
};

export type Section = {
  id: string;
  name: string;        // "Intro", "Build", "Drop"...
  bars: number;
  active: string[];    // track ids sounding in this section
  fill?: "cut" | "roll" | "none"; // last-2-beats treatment into the next section
};

export type Humanize = {
  swing: number;       // 0.50 straight .. 0.62 heavy; applied to offbeat 16ths (hats/bass/perc)
  velVar: number;      // 0..0.2 velocity looseness on hats/perc
  clapLateMs: number;  // deep-house pocket
  seed: number;        // same seed = same feel, forever
};

export type Song = {
  title: string;
  bpm: number;
  key: string;
  lane: "tech-house" | "hard-house";
  humanize: Humanize;
  tracks: Track[];
  sections: Section[];
  arrangement: string[]; // section ids in play order
};

const rep = (n: number, f: (b: number) => [number, number, number, number][]) =>
  Array.from({ length: n }, (_, b) => f(b)).flat() as [number, number, number, number][];

// ---- Seed 1: GLOW — the John Summit / tech-house lane, 126 BPM D minor ----
export const SEED_TECH_HOUSE: Song = {
  title: "GLOW",
  bpm: 126,
  key: "D minor",
  lane: "tech-house",
  humanize: { swing: 0.56, velVar: 0.08, clapLateMs: 8, seed: 42 },
  tracks: [
    { id: "kick", name: "Kick", role: "kick", volume: 0, loopBeats: 4,
      notes: [...rep(4, (b) => [[36, b, 0.2, 124]] as [number, number, number, number][]), [36, 3.75, 0.1, 55]] },
    { id: "clap", name: "Clap", role: "clap", volume: -4, loopBeats: 4,
      notes: [[39, 1, 0.15, 112], [39, 3, 0.15, 112]] },
    { id: "hat", name: "Hats", role: "hat", volume: -13, duck: true, loopBeats: 4,
      notes: rep(4, (b) => [[42, b, 0.08, 50], [42, b + 0.25, 0.08, 34], [42, b + 0.5, 0.08, 80], [42, b + 0.75, 0.08, 40]]) },
    { id: "openhat", name: "Open Hat", role: "openhat", volume: -11, duck: true, loopBeats: 8,
      notes: [[46, 7.5, 0.4, 78]] },
    { id: "tamb", name: "Tambourine", role: "openhat", volume: -14, duck: true, loopBeats: 4,
      notes: [[46, 1.5, 0.12, 78], [46, 3.5, 0.12, 70]] },
    { id: "bass", name: "Bass Hook", role: "bass", volume: -2, duck: true, loopBeats: 8,
      notes: [
        [38, 0.5, 0.26, 108], [38, 1.5, 0.26, 82], [38, 2.5, 0.26, 104], [38, 3.25, 0.12, 45],
        [38, 3.5, 0.26, 86], [41, 3.75, 0.15, 70], [38, 4.5, 0.26, 108], [38, 5.5, 0.26, 82],
        [36, 6.5, 0.26, 100], [50, 7.0, 0.2, 96], [38, 7.5, 0.24, 90], [36, 7.75, 0.18, 76],
      ] },
    { id: "sub", name: "Sub", role: "sub", volume: -6, duck: true, loopBeats: 8,
      notes: [[26, 0.5, 0.4, 100], [26, 2.5, 0.4, 96], [26, 4.5, 0.4, 100], [26, 6.5, 0.4, 96]] },
    { id: "stab", name: "Stabs", role: "stab", volume: -9, duck: true, loopBeats: 8,
      notes: [
        [62, 1.5, 0.18, 84], [65, 1.5, 0.18, 84], [69, 1.5, 0.18, 84],
        [62, 5.5, 0.18, 80], [65, 5.5, 0.18, 80], [70, 5.5, 0.18, 80],
      ] },
    { id: "pad", name: "Pad", role: "pad", volume: -10, duck: true, loopBeats: 32,
      notes: [
        [62, 0, 17, 64], [65, 0, 17, 60], [69, 0, 17, 62], [76, 0, 17, 56],
        [65, 16, 17, 62], [70, 16, 17, 58], [74, 16, 17, 60], [77, 16, 17, 54],
      ] },
  ],
  sections: [
    { id: "intro", name: "Intro", bars: 8, active: ["kick", "hat", "pad"], fill: "none" },
    { id: "groove", name: "Groove", bars: 8, active: ["kick", "clap", "hat", "tamb", "bass"], fill: "roll" },
    { id: "build", name: "Build", bars: 8, active: ["kick", "clap", "hat", "stab", "pad"], fill: "cut" },
    { id: "drop", name: "Drop", bars: 16, active: ["kick", "clap", "hat", "tamb", "openhat", "bass", "sub", "stab"], fill: "none" },
    { id: "break", name: "Breakdown", bars: 8, active: ["pad", "clap", "hat"], fill: "roll" },
    { id: "build2", name: "Build 2", bars: 4, active: ["kick", "clap", "hat", "stab", "pad"], fill: "cut" },
    { id: "drop2", name: "Drop 2", bars: 16, active: ["kick", "clap", "hat", "tamb", "openhat", "bass", "sub", "stab", "pad"], fill: "none" },
    { id: "outro", name: "Outro", bars: 8, active: ["kick", "hat", "bass", "pad"], fill: "none" },
  ],
  arrangement: ["intro", "groove", "build", "drop", "break", "build2", "drop2", "outro"],
};

// ---- Seed 2: G-TOWN HEAT — the KETTAMA / hard-house lane, 142 BPM F minor ----
// Lane DNA from the research file: 140-145, flat minors, skippy garage snares,
// open hat every offbeat eighth, warp bass as the lead, euphoric breakdown.
export const SEED_HARD_HOUSE: Song = {
  title: "G-TOWN HEAT",
  bpm: 142,
  key: "F minor",
  lane: "hard-house",
  humanize: { swing: 0.57, velVar: 0.07, clapLateMs: 0, seed: 99 },
  tracks: [
    { id: "kick", name: "Kick", role: "kick", volume: 0, loopBeats: 4,
      notes: rep(4, (b) => [[36, b, 0.18, 127]]) },
    { id: "clap", name: "Clap", role: "clap", volume: -3, loopBeats: 4,
      notes: [[39, 1, 0.15, 118], [39, 3, 0.15, 118]] },
    { id: "gsnare", name: "Ghost Snares", role: "snare", volume: -12, duck: true, loopBeats: 4,
      notes: [[38, 0.75, 0.08, 50], [38, 1.75, 0.08, 42], [38, 2.25, 0.08, 38], [38, 3.25, 0.08, 52]] },
    { id: "hat", name: "Hats", role: "hat", volume: -15, duck: true, loopBeats: 4,
      notes: rep(4, (b) => [[42, b + 0.25, 0.06, 40], [42, b + 0.75, 0.06, 46]]) },
    { id: "openhat", name: "Open Hat", role: "openhat", volume: -9, duck: true, loopBeats: 4,
      notes: rep(4, (b) => [[46, b + 0.5, 0.25, 88]]) },
    { id: "bass", name: "Warp Bass", role: "bass", volume: -1, duck: true, loopBeats: 8,
      notes: [
        [29, 0.5, 0.4, 118], [29, 1.5, 0.35, 104], [29, 2.5, 0.4, 114], [41, 3.5, 0.45, 110],
        [29, 4.5, 0.4, 118], [27, 5.5, 0.35, 100], [29, 6.5, 0.4, 112], [32, 7.5, 0.45, 108],
      ] },
    { id: "stab", name: "Hoover Stab", role: "stab", volume: -6, duck: true, loopBeats: 8,
      notes: [
        [65, 0.5, 0.15, 110], [68, 0.5, 0.15, 110], [72, 0.5, 0.15, 110],
        [65, 2.75, 0.15, 96], [68, 2.75, 0.15, 96], [72, 2.75, 0.15, 96],
        [65, 4.5, 0.15, 110], [68, 4.5, 0.15, 110], [72, 4.5, 0.15, 110],
        [63, 6.25, 0.15, 100], [67, 6.25, 0.15, 100], [70, 6.25, 0.15, 100],
      ] },
    { id: "sub", name: "Sub", role: "sub", volume: -5, duck: true, loopBeats: 4,
      notes: [[29, 0.5, 0.45, 104], [29, 2.5, 0.45, 104]] },
    { id: "pad", name: "Pad", role: "pad", volume: -13, duck: true, loopBeats: 32,
      notes: [[53, 0, 15, 60], [56, 0, 15, 58], [60, 0, 15, 60], [49, 16, 15, 60], [53, 16, 15, 58], [56, 16, 15, 60]] },
  ],
  sections: [
    { id: "intro", name: "Intro", bars: 8, active: ["kick", "openhat"], fill: "none" },
    { id: "groove", name: "Groove", bars: 8, active: ["kick", "clap", "gsnare", "openhat", "bass"], fill: "roll" },
    { id: "build", name: "Build", bars: 8, active: ["kick", "clap", "hat", "stab", "pad"], fill: "cut" },
    { id: "drop", name: "Drop", bars: 16, active: ["kick", "clap", "gsnare", "hat", "openhat", "bass", "sub", "stab"], fill: "none" },
    { id: "break", name: "Breakdown", bars: 8, active: ["pad", "clap"], fill: "roll" },
    { id: "build2", name: "Build 2", bars: 4, active: ["kick", "clap", "hat", "stab"], fill: "cut" },
    { id: "drop2", name: "Drop 2", bars: 16, active: ["kick", "clap", "gsnare", "hat", "openhat", "bass", "sub", "stab", "pad"], fill: "none" },
    { id: "outro", name: "Outro", bars: 8, active: ["kick", "openhat", "bass"], fill: "none" },
  ],
  arrangement: ["intro", "groove", "build", "drop", "break", "build2", "drop2", "outro"],
};

export const SEED_SONG = SEED_TECH_HOUSE;
