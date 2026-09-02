// Measured lane DNA from Brady's own library (data/dna.json) and a name index
// of every measured track (data/reference-index.json). Missing files = null.
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Json = Record<string, unknown>;
type Q = { p10?: number; p25?: number; p50?: number; p75?: number; p90?: number };
let dnaCache: Json | null | undefined;
let indexCache: Json[] | undefined;

function readJson<T>(rel: string): T | null {
  try { return JSON.parse(readFileSync(join(process.cwd(), rel), "utf8")) as T; } catch { return null; }
}

export function laneDna(lane: string): Json | null {
  if (dnaCache === undefined) dnaCache = readJson<Json>("data/dna.json");
  if (!dnaCache) return null;
  const lanes = (dnaCache.lanes ?? {}) as Record<string, Json>;
  return lanes[lane] ?? (dnaCache.all as Json) ?? null;
}

const r2 = (v: unknown) => (typeof v === "number" ? Math.round(v * 100) / 100 : v);
const q = (o: unknown): Q | undefined => { if (!o || typeof o !== "object") return undefined; const x = o as Q; const out: Q = {}; for (const k of ["p10", "p25", "p50", "p75", "p90"] as const) if (typeof x[k] === "number") out[k] = r2(x[k]) as number; return out; };

// Compact the DNA for a prompt: ranges a producer can aim at, about 1.5 KB.
export function dnaForBrain(lane: string): string | null {
  const d = laneDna(lane);
  if (!d) return null;
  const sp = (d.spectrum ?? {}) as Json, gr = (d.groove ?? {}) as Json, st = (d.structure ?? {}) as Json, lo = (d.loudness ?? {}) as Json, ke = (d.keys ?? {}) as Json, ec = (d.energyContour ?? {}) as Json, pr = (d.progressions ?? {}) as Json;
  const bands = (sp.bands ?? {}) as Record<string, unknown>;
  const compact = {
    lane, tracksMeasured: d.n,
    tempoBpm: q(d.tempo),
    keysTop: Array.isArray(ke.top) ? (ke.top as Json[]).slice(0, 5).map((k) => `${k.key} ${Math.round(((k.share as number) ?? 0) * 100)}%`) : undefined,
    minorShare: r2(ke.minorShare),
    lufs: q(lo.integrated), loudnessRangeLU: q(lo.range), crestDb: q(lo.crest),
    bands: Object.fromEntries(Object.entries(bands).map(([k, v]) => [k, q(v)])),
    subPlusLow: q(sp.subPlusLow), centroidHz: q(sp.centroidHz), mud: q(sp.mud), harshness: q(sp.harshness),
    swing: q(gr.swing), pump: q(gr.pump), kicksPerBar: q(gr.kickDensity), fourOnFloorShare: r2(gr.fourOnFloorShare),
    firstDropAtSec: q(st.dropAtSec), firstDropFractionOfTrack: q(st.dropFraction), firstDropBars: q(st.firstDropBars), sectionsPerTrack: q(st.sections), durationSec: q(st.durationSec),
    energyContour16: Array.isArray(ec.mean) ? (ec.mean as number[]).map((v) => Math.round(v * 100) / 100) : undefined,
    topProgressions: Array.isArray(pr.top) ? (pr.top as Json[]).slice(0, 6).map((p) => `${p.progression} (${p.n})`) : undefined,
    commonMoves: Array.isArray(pr.pairs) ? (pr.pairs as Json[]).slice(0, 8).map((p) => `${p.pair ?? p.move ?? p.progression} (${p.n})`) : undefined,
  };
  const s = JSON.stringify(compact);
  return s.length > 2600 ? s.slice(0, 2600) : s;
}

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export function findReference(text: string): Json[] {
  if (indexCache === undefined) indexCache = readJson<Json[]>("data/reference-index.json") ?? [];
  const t = norm(text);
  if (t.length < 4) return [];
  const hits = indexCache.filter((r) => {
    const title = norm(r.title ?? r.name), artist = norm(r.artist);
    return (title.length > 4 && t.includes(title)) || (artist.length > 4 && t.includes(artist));
  });
  return hits.slice(0, 3).map((r) => ({ name: r.name, artist: r.artist, title: r.title, bpm: r.bpm, key: r.key, lufs: r.lufs, dropAt: r.dropAt, lane: r.lane, subPlusLow: r.subPlusLow, pump: r.pump, swing: r.swing }));
}

// Per-artist medians computed on the fly from the reference index when the user names an artist.
export function artistDna(text: string): Json | null {
  if (indexCache === undefined) indexCache = readJson<Json[]>("data/reference-index.json") ?? [];
  const t = norm(text);
  if (t.length < 4) return null;
  const artists = new Map<string, Json[]>();
  for (const r of indexCache) { const a = norm(r.artist); if (a.length > 4 && t.includes(a)) (artists.get(a) ?? artists.set(a, []).get(a)!).push(r); }
  if (artists.size === 0) return null;
  const [name, rows] = [...artists.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const med = (k: string) => { const xs = rows.map((r) => r[k]).filter((v): v is number => typeof v === "number").sort((a, b) => a - b); return xs.length ? Math.round(xs[Math.floor(xs.length / 2)] * 100) / 100 : undefined; };
  const keys = new Map<string, number>(); for (const r of rows) if (typeof r.key === "string") keys.set(r.key, (keys.get(r.key) ?? 0) + 1);
  return { artist: rows[0].artist ?? name, tracksMeasured: rows.length, bpm: med("bpm"), lufs: med("lufs"), dropAtSec: med("dropAt"), subPlusLow: med("subPlusLow"), pump: med("pump"), swing: med("swing"), keys: [...keys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} x${n}`), titles: rows.slice(0, 5).map((r) => r.title ?? r.name) };
}
