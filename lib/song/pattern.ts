// Which notes a track plays in a section: the named variant, else pattern "A".
import type { Track, Section, Note } from "./types";

export function patternFor(track: Track, sec: Section): Note[] {
  const name = sec.variants?.[track.id];
  if (name && name !== "A" && track.patterns?.[name]) return track.patterns[name];
  return track.notes;
}
