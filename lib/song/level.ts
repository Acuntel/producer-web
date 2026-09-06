// The leveler: a deterministic gain move after the ears hear a render. When the
// drop is crushed against the limiter the brain's mix moves cannot be judged, so
// the studio pulls the master back toward the target before anyone listens.
import type { Song } from "./types";
import type { MusicFacts } from "../ears";
import type { Op } from "./ops";

export const LEVEL_TARGET_LUFS = -8;
const TOO_LOUD = -6.2;     // above this the limiter is pinned and everything flattens
const MIN_MASTER = -18, MAX_MASTER = 3;

function dropLufs(f: MusicFacts): number | null {
  const d = f.structure.sections.find((s) => s.label === "drop");
  if (d && Number.isFinite(d.lufs)) return d.lufs;
  return Number.isFinite(f.loudness.integrated) ? f.loudness.integrated : null;
}

/** Ops that bring a crushed master back toward the target, or null when the level is acceptable. */
export function levelOps(song: Song, facts: MusicFacts | null, target = LEVEL_TARGET_LUFS): { ops: Op[]; from: number; delta: number } | null {
  if (!facts) return null;
  const lufs = dropLufs(facts);
  if (lufs === null || lufs <= TOO_LOUD) return null;
  // The limiter is nonlinear: pull a little more than the raw difference so one pass usually lands.
  const delta = Math.max(-9, Math.min(-1, (target - lufs) * 1.15));
  const cur = song.master?.volume ?? 0;
  const value = Math.round(Math.max(MIN_MASTER, Math.min(MAX_MASTER, cur + delta)) * 2) / 2;
  if (Math.abs(value - cur) < 0.5) return null;
  return { ops: [{ op: "set", track: "master", path: "volume", value }], from: lufs, delta: value - cur };
}

export const levelLine = (r: { from: number; delta: number }) => `Leveled: the drop read ${r.from.toFixed(1)} LUFS, master ${r.delta > 0 ? "+" : ""}${r.delta.toFixed(1)} dB.`;
