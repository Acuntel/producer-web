// SongDoc v3: a radically simplified Ableton project the brain writes and the
// engine plays. Everything Ableton can do that matters for a dance record is
// representable here: instrument + audio tracks, mixer, insert FX, sends,
// per-section pattern variants, automation ramps, arrangement, loop region.
// Notes are written on the STRAIGHT grid; the engine humanizes from `humanize`.

export type Role =
  | "kick" | "clap" | "snare" | "hat" | "openhat" | "perc"
  | "bass" | "sub" | "chords" | "stab" | "pad" | "lead" | "pluck" | "arp" | "fx"
  | "audio";

// [midi, startBeat, durBeats, velocity 1-127, chance 0-1?]. For audio one-shots midi = semitone offset (60 = unpitched).
// chance (Live 11 style) is the probability the hit plays on each repetition; absent = 1. Seeded, so a render never changes between plays.
export type Note = [number, number, number, number, number?];

export type Wave = "sawtooth" | "square" | "triangle" | "sine" | "fatsawtooth" | "fatsquare" | "fattriangle" | "pwm" | "epiano" | "organ";

export type SynthParams = {
  wave?: Wave;
  detune?: number;     // cents
  unison?: number;     // 1-4 voices (fat oscillators)
  spread?: number;     // cents between unison voices
  attack?: number;     // seconds
  decay?: number;
  sustain?: number;    // 0-1
  release?: number;
  cutoff?: number;     // Hz, voice filter
  resonance?: number;  // Q 0.1-12
  envAmount?: number;  // filter envelope octaves 0-5
  glide?: number;      // portamento seconds (mono voices)
  octave?: number;     // -2..2 shift applied to every note
  drumTune?: number;   // semitones for kick body, decay scale for drums
  drumDecay?: number;  // 0.05..1.5 seconds
};

export type Fx = {
  filter?: { type: "lowpass" | "highpass" | "bandpass"; cutoff: number; q?: number };
  drive?: number;                  // 0-1 saturation
  crush?: number;                  // 0 = off, else bits 4-12
  delay?: { time: "4n" | "8n" | "8n." | "16n" | "8t"; feedback: number; wet: number };
  reverb?: number;                 // send amount 0-1 (overrides the role default)
  eq?: { low: number; mid: number; high: number }; // dB, +-12
  comp?: { threshold: number; ratio: number };      // dB, 1-20
  width?: number;                  // 0 mono .. 1 wide
  pan?: number;                    // -1 left .. 1 right
  gate?: number;                   // 0 = off, else trance-gate rate in 16ths (1,2,4)
};

export type AudioClip = {
  clipId: string;      // key in the browser clip store (IndexedDB)
  name: string;
  bpm?: number;        // native tempo (measured by the ears); warps to the song when set
  warp?: boolean;      // time-stretch to the song tempo (default true when bpm known)
  semitones?: number;  // transpose
  startSec?: number;   // clip start offset
  lengthBeats?: number;// loop length in song beats when looping
  gainDb?: number;
  reverse?: boolean;
  oneShot?: boolean;   // trigger from `notes` instead of looping
  durationSec?: number;
};

// Groove Pool: a 16-slot timing and accent map over one bar of 16ths (Ableton, MPC, 909).
export type GrooveName = "straight" | "swing16" | "swing8" | "mpc16" | "mpc8" | "909" | "sp1200" | "garage-skip" | "custom";
export type Groove = {
  name: GrooveName;
  amount: number;      // 0-1.3, Ableton's global amount; 1 = the template as written
  velocity?: number;   // -1..1, how much the template's accents shape velocity (0 = timing only)
  random?: number;     // 0-12 ms of seeded per-hit timing jitter
  timing?: number[];   // 16 slots, beats of shift at amount 1 (custom / extracted from a reference)
  accents?: number[];  // 16 slots, -1..1 accent at velocity 1
};

export type Track = {
  id: string;
  name: string;
  role: Role;
  volume: number;      // dB, 0 unity
  duck?: boolean;      // sidechained to the kick
  mute?: boolean;
  solo?: boolean;
  loopBeats: number;   // pattern length; tiles across each section
  notes: Note[];       // pattern "A"
  patterns?: Record<string, Note[]>; // named alternates chosen per section via variants
  synth?: SynthParams;
  fx?: Fx;
  clip?: AudioClip;    // role "audio"
  transpose?: number;  // semitones applied to every note
  groove?: Groove | null; // per-track groove; null = straight; absent = the song groove (kick, clap, sub stay straight)
  velDev?: number;     // 0-40 velocity steps of seeded per-hit deviation (Live 11 Velocity Deviation)
  chance?: number;     // 0-1 track-wide default chance for notes without their own
  color?: string;
};

export type AutoParam =
  | "filter.cutoff" | "filter.q" | "volume" | "reverb" | "delay.wet" | "pan" | "width" | "drive";

export type Automation = {
  track: string | "master";
  param: AutoParam;
  from: number;
  to: number;
  curve?: "linear" | "exp";
  startBeat?: number;  // within the section, default 0
  endBeat?: number;    // within the section, default section end
};

// Pattern playlists per section (Follow Actions): a plain name, a sequence of
// names, a fill pattern every N bars, or a seeded pick from a list.
export type VariantPlan =
  | string
  | { sequence: string[]; barsEach?: number }                       // A B A C, each for barsEach bars (default 8)
  | { every: number; pattern: string; bars?: number; base?: string } // the pattern in the last `bars` of every `every` bars, base elsewhere
  | { any: string[]; barsEach?: number };                            // seeded random pick per block

export type Section = {
  id: string;
  name: string;
  bars: number;
  active: string[];                    // track ids sounding
  fill?: "cut" | "roll" | "none" | "riser";
  variants?: Record<string, VariantPlan>; // trackId -> pattern name or playlist plan
  automation?: Automation[];
  energy?: number;                     // 0-1 intent, for the brain and the visuals
  note?: string;                       // producer note ("euphoric break, pads swell")
};

export type Master = {
  volume?: number;        // dB
  eq?: { low: number; mid: number; high: number };
  compThreshold?: number; // dB
  limiter?: number;       // dB ceiling
  makeup?: number;        // dB after the compressor, default +6
  sidechainDb?: number;   // pump depth on ducked tracks, 0-14 dB, default 6
  sidechainReleaseMs?: number; // 60-400, default 120
  filter?: { type: "lowpass" | "highpass"; cutoff: number };
  width?: number;
};

export type LoopRegion = { section?: string; startBar?: number; endBar?: number } | null;

export type Humanize = {
  swing: number;       // 0.50 straight .. 0.67 triplet, on offbeat 16ths (legacy dial; song.groove is the full Groove Pool)
  velVar: number;      // 0-0.3 velocity looseness
  clapLateMs: number;  // pocket
  seed: number;        // same seed = same feel forever
  pocketMs?: number;   // global push (+) or drag (-) of non-kick elements
};

// Any lane id: the shipped "tech-house" and "hard-house", the researched lanes in knowledge/lanes/lanes.json, or "custom".
export type Lane = string;

export type Song = {
  version: 3;
  title: string;
  bpm: number;
  key: string;
  lane: Lane;
  humanize: Humanize;
  groove?: Groove | null; // the song groove; absent = swing16 derived from humanize.swing, null = straight
  tracks: Track[];
  sections: Section[];
  arrangement: string[];
  master?: Master;
  loop?: LoopRegion;
  notes?: string;      // the producer's running notes on this song
};

export const MELODIC_ROLES: Role[] = ["bass", "sub", "chords", "stab", "pad", "lead", "pluck", "arp"];
export const DRUM_ROLES: Role[] = ["kick", "clap", "snare", "hat", "openhat", "perc"];
export const isMelodic = (r: Role) => MELODIC_ROLES.includes(r);
export const isDrum = (r: Role) => DRUM_ROLES.includes(r);
