// What the draft compiler is given: a named source's DNA, numbers only. It comes from the heard record
// when the worker has heard it, else the artist's records in the store and their Galton bin, else a lane's
// recipe. The compiler turns it into notes; nothing here is a sentence for a model to transcribe.
export type DraftTier = "heard" | "artist" | "lane";

export type DraftDna = {
  v: 1;
  name: string;               // what the producer calls the source out loud ("Chris Lake", "Stumblin' In by CYRIL")
  key: string;                // the normalized ask the DNA was resolved from
  tier: DraftTier;
  lane: string;               // the lane recipe the palette and the form come from
  family: string | null;
  bpm: number;
  tempoConfidence: number;
  keys: [string, number][];   // candidate keys with their counts, best first ("A minor", 5)
  energy: number | null;      // 0..1
  valence: number | null;     // 0..1
  grids?: { kick?: string | null; snare?: string | null; hat?: string | null };   // 16 steps, X and .
  bass?: string | null;       // the bass line's 16-step rhythm
  progressions: [string, number][];   // roman numerals in the key, with counts
  contour: string | null;     // the hook's shape: rise, fall, arch, wave, flat
  structure: string | null;   // section codes: I intro, V verse or groove, B build, U up, D drop, K break, C chorus, X other, O outro
  energyContour: number[] | null;     // per 8 bars, 0..1
  palette: string[];          // sound words from the hearing or the lane ("punchy", "organic")
  voice: "vocal" | "instrumental" | null;
  from: string[];             // where each part of it came from, for the ledger and the producer's line
};

/** A reason given against the last draft ("too busy", "darker"), carried into the next seed. */
export type Steer = { busy?: number; dark?: number; energy?: number };

/** What a record remembers about its draft: enough to compile it again, or the next one on the same DNA. */
export type DraftInfo = { name: string; key: string; take: number; seed: number; tier: DraftTier; lane: string; steer?: Steer; dna: DraftDna; lock?: { bpm: number; key: string | null } };
