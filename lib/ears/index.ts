// The producer's ears. Pure TypeScript music perception: audio -> MusicFacts.
export { hear } from "./facts";
export type { MusicFacts, HearOptions, BandShares, SectionFacts, SectionLabel } from "./facts";
export { describe, mmss } from "./describe";
export { compare } from "./compare";
export type { Comparison } from "./compare";
export { keyFromCamelot, NOTE_NAMES } from "./tonal";
export { hearBuffer, decodeFile, factsForBrain } from "./browser";
