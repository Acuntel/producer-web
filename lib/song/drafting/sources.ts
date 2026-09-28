// DNA the browser can make itself: a lane's recipe when nothing knows the name, and a heard record's DNA straight
// from the worker's hearing when it lands (the upgrade on the next phrase). The resolver's cache lives here too,
// so the same name gives the same DNA on every reload of the page.
import type { DraftDna } from "./types";
import { recipeFor } from "./recipes";
import { laneInfo } from "../../brain/laneNames";
import { heardRow, type JobResult } from "../../dna/heard";
import { norm } from "../../brain/norm";

export function laneDna(lane: string, name?: string): DraftDna {
  const r = recipeFor(lane);
  return { v: 1, name: laneInfo(lane)?.name ?? lane, key: norm(name ?? lane), tier: "lane", lane: r.id, family: null, bpm: r.bpm[1], tempoConfidence: 0.5,
    keys: r.keys.map((k, i) => [k, r.keys.length - i] as [string, number]), energy: null, valence: null, progressions: [], contour: null, structure: null, energyContour: null, palette: [], voice: null, from: [`the ${r.id} recipe`] };
}

/** The worker's hearing of a record as DNA, kept under the ask it was pulled in for. */
export function hearingDna(res: JobResult, ask: DraftDna): DraftDna | null {
  const bpm = res?.facts?.bpm; if (!bpm) return null;
  const { dna, title, artist } = heardRow(res, ask.key);
  return { ...ask, v: 1, tier: "heard", name: `${title ?? ask.name}${artist ? ` by ${artist}` : ""}`, bpm: Math.round(bpm), tempoConfidence: 0.8,
    keys: res?.facts?.key ? [[res.facts.key, 5]] : ask.keys, grids: { kick: dna.kick_grid, snare: dna.snare_grid, hat: dna.hat_grid }, bass: dna.bass_rhythm,
    progressions: dna.progression ? [[dna.progression, 4]] : ask.progressions, structure: dna.structure ?? ask.structure,
    energyContour: Array.isArray(res?.facts?.blocks) ? res!.facts!.blocks!.map((b) => b.energy) : ask.energyContour,
    palette: (dna.descriptors ?? "").split(/,\s*/).filter(Boolean), from: [...ask.from, "heard by the studio just now"] };
}

const KEY = "producer.dna.v1";
type Cache = Record<string, { dna: DraftDna; at: number }>;
const read = (): Cache => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Cache; } catch { return {}; } };
export function cachedDna(name: string): DraftDna | null { const c = read()[norm(name)]; return c?.dna?.v === 1 ? c.dna : null; }
export function keepDna(name: string, dna: DraftDna) {
  try {
    const c = read(); c[norm(name)] = { dna, at: Date.now() };
    const keys = Object.keys(c).sort((a, b) => c[b].at - c[a].at);
    for (const k of keys.slice(60)) delete c[k];
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch { /* private window: the next ask resolves again */ }
}
