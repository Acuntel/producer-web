// What the meters read: the master's smoothed level and its true sample peak per channel, each track's
// level, and the master spectrum. The peak is the loudest raw sample in the last frame, not a held level.
import type { Analysis } from "./board";

// master = the bars' smoothed level; peak = the loudest sample in the last frame, per channel, in dBFS.
export type Levels = { master: [number, number]; peak: [number, number]; spectrum: Float32Array | null; tracks: Record<string, number> };

const pk = (a: Float32Array) => { let p = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > p) p = v; } return p > 0 ? 20 * Math.log10(p) : -100; };

export function levelsOf(a: Analysis): Levels {
  const m = a.meter.getValue();
  const master: [number, number] = Array.isArray(m) ? [Number(m[0]), Number(m[1] ?? m[0])] : [Number(m), Number(m)];
  const tracks: Record<string, number> = {};
  for (const [id, tm] of a.tracks) { const v = tm.getValue(); tracks[id] = Array.isArray(v) ? Number(v[0]) : Number(v); }
  const w = a.wave?.getValue();
  const peak: [number, number] = Array.isArray(w) ? [pk(w[0]), pk(w[1] ?? w[0])] : w ? [pk(w), pk(w)] : master;
  return { master, peak, spectrum: a.fft.getValue(), tracks };
}
