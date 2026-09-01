// Measured lane DNA from Brady's own library (data/dna.json) and a name index
// of every measured track (data/reference-index.json). Missing files = empty.
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Json = Record<string, unknown>;
let dnaCache: Json | null | undefined;
let indexCache: Json[] | undefined;

function readJson<T>(rel: string): T | null {
  try { return JSON.parse(readFileSync(join(process.cwd(), rel), "utf8")) as T; } catch { return null; }
}

export function laneDna(lane: string): Json | null {
  if (dnaCache === undefined) dnaCache = readJson<Json>("data/dna.json");
  if (!dnaCache) return null;
  const lanes = (dnaCache.lanes ?? dnaCache) as Record<string, Json>;
  return lanes[lane] ?? lanes[lane === "custom" ? "all" : "all"] ?? null;
}

// Compact the DNA for a prompt: a producer needs ranges, not a spreadsheet.
export function dnaForBrain(lane: string): string | null {
  const d = laneDna(lane);
  if (!d) return null;
  const pick = (o: unknown, keys: string[]) => { if (!o || typeof o !== "object") return o; const r: Json = {}; for (const k of keys) if (k in (o as Json)) r[k] = (o as Json)[k]; return r; };
  const compact: Json = {
    lane, n: d.n,
    tempo: d.tempo, minorShare: d.minorShare ?? d.minor_share, keys: Array.isArray(d.keys) ? (d.keys as unknown[]).slice(0, 5) : d.keys,
    lufs: d.loudness ?? d.lufs, lra: d.range ?? d.lra, bands: d.bands, centroidHz: d.centroidHz ?? d.centroid,
    swing: d.swing, pump: d.pump, kicksPerBar: d.kickDensity, dropAtSec: d.dropAtSec ?? d.dropAt, dropFraction: d.dropFraction, dropBars: d.dropBars, sections: d.sections ?? d.sectionCount,
    energy16: Array.isArray(d.energy) ? (d.energy as unknown[]).map((v) => (typeof v === "number" ? Math.round(v * 100) / 100 : pick(v, ["p50"]))) : d.energyContour,
    progressions: Array.isArray(d.progressions) ? (d.progressions as unknown[]).slice(0, 6) : undefined,
  };
  const s = JSON.stringify(compact);
  return s.length > 2200 ? s.slice(0, 2200) : s;
}

export function findReference(text: string): Json[] {
  if (indexCache === undefined) indexCache = readJson<Json[]>("data/reference-index.json") ?? [];
  const t = text.toLowerCase();
  if (t.length < 4) return [];
  const hits = indexCache.filter((r) => { const n = String(r.name ?? "").toLowerCase(); const a = String(r.artist ?? "").toLowerCase(); return (n.length > 3 && t.includes(n)) || (a.length > 3 && t.includes(a)); });
  return hits.slice(0, 3);
}
