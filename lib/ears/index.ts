// The producer's ears. Pure TypeScript music perception: audio -> MusicFacts.
export { hear } from "./facts";
export type { MusicFacts, HearOptions, BandShares, SectionFacts, SectionLabel, GrooveTemplate } from "./facts";
export { extractGroove, grooveTemplateLine } from "./groove";
export { describe, mmss } from "./describe";
export { compare } from "./compare";
export type { Comparison } from "./compare";
export { keyFromCamelot, NOTE_NAMES } from "./tonal";
export { hearBuffer, decodeFile, factsForBrain } from "./browser";
