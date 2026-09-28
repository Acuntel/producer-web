// What the meters read: the master's smoothed level and its true sample peak per channel, each track's
// level, and the master spectrum. The peak is the loudest raw sample in the last frame, not a held level.
import type { Analysis } from "./board";

// master = the bars' smoothed level; peak = the loudest sample in the last frame, per channel, in dBFS.
export type Levels = { master: [number, number]; peak: [number, number]; spectrum: Float32Array | null; tracks: Record<string, number> };

export function levelsOf(a: Analysis): Levels | null {
  if (!a.master) return null;   // nothing is showing the meters, so there are none
  const m = a.master.read();
  const tracks: Record<string, number> = {};
  for (const [id, tm] of a.tracks) tracks[id] = tm.getValue();
  return { master: m.master, peak: m.peak, spectrum: m.spectrum, tracks };
}
