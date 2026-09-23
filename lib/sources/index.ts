// The candidate stream the ritual's "next" draws from once the records it heard are used up: every lane in order,
// the owned library first, then any lane that is switched on. Pure: the manifest is handed in.
import type { Manifest } from "../samples/manifest";
import type { Song } from "../song/types";
import { LOW_CONFIDENCE } from "../ritual/source";
import { nextFrom, type Candidate, type Lane } from "./lane";
import { ownedLane } from "./owned";
import { spliceLane } from "./splice";

export * from "./lane";
export { ownedLane, candidateOf, OWNED_LICENSES, SEED_ROLES } from "./owned";
export { spliceLane, spliceOn, staysOnDevice, deviceOnlyTracks, SPLICE_FLAG } from "./splice";

export const lanesFor = (m: Manifest, spliceFlag?: string): Lane[] => [ownedLane(m), spliceLane(spliceFlag)];

/** The next sound for the seed on this record's grid, from the lanes, never one already played. */
export function laneNext(song: Song, played: ReadonlySet<string>, m: Manifest, spliceFlag?: string): Promise<Candidate | null> {
  return nextFrom(lanesFor(m, spliceFlag), { bpm: song.source?.bpm ?? song.bpm, key: song.source?.key ?? song.key, played });
}

const spokenKey = (key: string) => key.replace(/b\b/, " flat").replace(/#/, " sharp");

/** What the producer says as the sound lands: where it came from, how far it was bent, and whose it is. No dashes. */
export function candidateLine(c: Candidate, grid: number, gridKey?: string | null): string {
  const parts = [`Next one, from the library: ${c.name}.`];
  if (c.bpm && c.playsAt && Math.round(c.playsAt) !== Math.round(grid)) parts.push(`It was cut at ${Math.round(c.bpm)} and I moved it to ${Math.round(grid)}.`);
  if (c.bpm && c.tempoConfidence < LOW_CONFIDENCE) parts.push("I am not sure of its tempo, so tell me if it drags.");
  if (c.semitones) parts.push(`I moved it ${Math.abs(c.semitones)} ${Math.abs(c.semitones) === 1 ? "semitone" : "semitones"} ${c.semitones > 0 ? "up" : "down"}${gridKey ? ` to sit in ${spokenKey(gridKey)}` : ""}.`);
  parts.push(c.license.holder === "product" ? `It is ours to use, under ${c.license.name}.` : "It is licensed to you, through your own account.");
  if (c.license.credit) parts.push(`It needs a credit when the record goes out: ${c.license.credit}`);
  return parts.join(" ");
}
