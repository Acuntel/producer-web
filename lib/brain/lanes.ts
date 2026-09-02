// Lane recipes researched into knowledge/lanes/lanes.json, read from disk once
// when the server module loads (fs, like dna.ts). laneRecipe(id) is the block
// the brain gets for a lane, capped at 2.5 KB. Recommendations only: the user
// decides every move; nothing here applies itself.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LANE_INDEX } from "./laneNames";

export type LaneArrangement = { name: string; bars: number; fill?: string; energy?: number };
export type LaneRecipe = {
  id: string; name: string; bpm: number[]; keys?: string[]; swing?: number[]; laws?: string;
  drums: Record<string, string>; bass?: Record<string, unknown>; harmony?: Record<string, unknown>;
  arrangement: LaneArrangement[]; mix: Record<string, unknown>; references?: string[]; feelWords?: Record<string, string>;
};
export type LaneSummary = { id: string; name: string; home: number; lo: number; hi: number; blurb: string };

export const RECIPE_MAX_CHARS = 2500;

const isRecipe = (x: unknown): x is LaneRecipe => {
  const r = x as LaneRecipe;
  return !!r && typeof r.id === "string" && Array.isArray(r.bpm) && r.bpm.length >= 2 && !!r.drums && typeof r.drums === "object" && Array.isArray(r.arrangement) && !!r.mix && typeof r.mix === "object";
};

function load(): LaneRecipe[] {
  try {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "knowledge", "lanes", "lanes.json"), "utf8")) as { lanes?: unknown[] };
    return (Array.isArray(raw.lanes) ? raw.lanes : []).filter(isRecipe);
  } catch { return []; }
}

const RECIPES: LaneRecipe[] = load();

export const laneRecipeData = (id: string): LaneRecipe | null => RECIPES.find((r) => r.id === id) ?? null;

// Every lane the brain may pick: the shipped two from the index, the researched ones from lanes.json.
export function laneList(): LaneSummary[] {
  const out: LaneSummary[] = LANE_INDEX.map((l) => {
    const r = laneRecipeData(l.id);
    return { id: l.id, name: l.name, home: r ? r.bpm[1] : l.home, lo: r ? r.bpm[0] : l.range[0], hi: r ? r.bpm[r.bpm.length - 1] : l.range[1], blurb: l.blurb };
  });
  for (const r of RECIPES) if (!out.some((o) => o.id === r.id)) out.push({ id: r.id, name: r.name, home: r.bpm[1], lo: r.bpm[0], hi: r.bpm[r.bpm.length - 1], blurb: r.name });
  return out;
}

const isPair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === "number");
const fmt = (v: unknown): string => {
  if (isPair(v)) return `${v[0]} to ${v[1]}`;
  if (Array.isArray(v)) return v.map(fmt).join(" / ");
  if (v && typeof v === "object") return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k} ${fmt(x)}`).join(", ");
  return String(v);
};
const kv = (o?: Record<string, unknown>) => (o ? Object.entries(o).map(([k, v]) => `${k}: ${fmt(v)}`).join("; ") : "");
const arr = (a: LaneArrangement[]) => a.map((s) => `${s.name} ${s.bars}${s.fill && s.fill !== "none" ? ` ${s.fill}` : ""} (${s.energy ?? "?"})`).join(" > ");

// The prompt block for one lane. Sections in priority order; the tail is dropped first when the cap is hit.
export function laneRecipe(id: string, why?: string): string | null {
  const r = laneRecipeData(id);
  if (!r) return null;
  const home = r.bpm[1], lo = r.bpm[0], hi = r.bpm[r.bpm.length - 1];
  const sw = r.swing && r.swing.length >= 2 ? `; swing ${r.swing[0]}-${r.swing[r.swing.length - 1]} (home ${r.swing[1] ?? r.swing[0]})` : "";
  const head = `LANE RECIPE "${r.id}" (${r.name}; researched numbers, a starting point, the user decides every move${why ? `; ${why}` : ""}): ${lo}-${hi} BPM, home ${home}${r.keys?.length ? `; keys ${r.keys.join(", ")}` : ""}${sw}.`;
  const lines = [
    head,
    r.laws ? `LAWS: ${r.laws}` : "",
    `DRUMS (16 steps = 1 bar; X 120 x 92 g 45 o 88, digits = velocity tenths): ${Object.entries(r.drums).map(([k, v]) => `${k} ${v}`).join(" | ")}`,
    r.bass ? `BASS: ${kv(r.bass)}` : "",
    r.harmony ? `HARMONY: ${kv(r.harmony)}` : "",
    `ARRANGEMENT (bars, fill, energy): ${arr(r.arrangement)}`,
    `MIX TARGETS: ${kv(r.mix)}`,
    r.feelWords ? `FEEL WORDS: ${Object.entries(r.feelWords).map(([k, v]) => `${k} = ${v}`).join("; ")}` : "",
    r.references?.length ? `REFERENCES: ${r.references.join(" | ")}` : "",
  ].filter(Boolean);
  let text = lines.join("\n");
  while (text.length > RECIPE_MAX_CHARS && lines.length > 3) { lines.pop(); text = lines.join("\n"); }
  return text.length > RECIPE_MAX_CHARS ? text.slice(0, RECIPE_MAX_CHARS) : text;
}
