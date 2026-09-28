// The form of a draft: the source's own section order when it was heard or the store has it, else the lane's,
// normalized to something that plays as a record (an intro, a build before each drop, an outro) and kept to
// a draft's length. Which parts sound in each section follows the section's role, so a drop is the fullest place.
import type { Section, Track, Automation } from "../types";
import type { DraftDna } from "./types";
import type { Recipe } from "./recipes";
import { chance, pick, type Rng } from "./choose";

type Code = "I" | "V" | "B" | "D" | "K" | "O";
const FOLD: Record<string, Code> = { I: "I", V: "V", X: "V", S: "V", B: "B", U: "B", P: "B", D: "D", C: "D", K: "K", O: "O" };

function codesFromNames(recipe: Recipe): Code[] {
  return recipe.arrangement.map((s) => {
    const n = s.name.toLowerCase();
    if (/intro/.test(n) && !/mid/.test(n)) return "I";
    if (/outro/.test(n)) return "O";
    if (/breakdown|bridge/.test(n)) return "K";
    if (/drop|chorus|climax/.test(n)) return "D";
    if (/build|pre|break|up/.test(n)) return "B";
    return "V";
  });
}

/** A playable form: an intro, a build into every drop, at most three drops and nine sections, an outro. */
export function normalizeCodes(raw: Code[], verseChorus: boolean): Code[] {
  let c = raw.filter((x, i) => i === 0 || x !== raw[i - 1]);
  if (c[0] !== "I") c = ["I", ...c];
  if (!c.includes("D")) c = ["I", "V", "B", "D", "K", "B", "D", "O"];
  const out: Code[] = [];
  let drops = 0;
  for (const x of c) {
    if (x === "D") { if (drops >= 3) continue; drops++; const prev = out[out.length - 1]; if (!verseChorus && prev !== "B") { if (prev === "K" || prev === "V" || prev === "I") out.push("B"); } }
    if (x === "O") break;
    if (out[out.length - 1] !== x) out.push(x);
  }
  while (out.length > 8) { const i = out.lastIndexOf("V"); if (i > 0) out.splice(i, 1); else out.splice(out.length - 1, 1); }
  if (out[out.length - 1] !== "O") out.push("O");
  return out;
}

const BARS: Record<Code, number> = { I: 8, V: 8, B: 8, D: 16, K: 8, O: 8 };
const ENERGY: Record<Code, number> = { I: 0.3, V: 0.55, B: 0.72, D: 1, K: 0.35, O: 0.4 };
const DANCE: Record<Code, string> = { I: "Intro", V: "Groove", B: "Build", D: "Drop", K: "Breakdown", O: "Outro" };
const SONG: Record<Code, string> = { I: "Intro", V: "Verse", B: "Pre", D: "Chorus", K: "Bridge", O: "Outro" };

/** The parts that sound in a section of each role, by track id, from what the draft has. */
function activeFor(code: Code, nth: number, has: (id: string) => boolean, verseChorus: boolean, rng: Rng): string[] {
  const pick1 = (...ids: string[]) => ids.filter(has);
  const back = pick1("clap", "snare");
  const keys = pick1("stab", "chords");
  switch (code) {
    case "I": return [...pick1("kick", "hat"), ...(verseChorus ? pick1("chords", "pad") : pick1("pad")), ...(chance(0.5, rng) ? pick1("perc") : [])];
    case "V": return [...pick1("kick", "hat", "perc", "bass", "sub"), ...back, ...(verseChorus ? keys : []), ...(chance(0.35, rng) ? pick1("arp") : [])];
    case "B": return [...pick1("kick", "hat", "pad"), ...back, ...keys, ...(chance(0.5, rng) ? pick1("hook") : [])];
    case "D": return [...pick1("kick", "hat", "openhat", "perc", "ghost", "bass", "sub", "hook", "arp"), ...back, ...keys, ...(nth > 0 ? pick1("pad") : [])];
    case "K": return [...pick1("pad", "hook", "arp"), ...(chance(0.6, rng) ? back : []), ...pick1("hat")];
    case "O": return pick1("kick", "hat", "bass", "pad");
  }
}

export function buildForm(dna: DraftDna, recipe: Recipe, tracks: Track[], r: (k: string) => Rng): { sections: Section[]; arrangement: string[]; codes: string } {
  const raw = (dna.structure ?? "").split(/\s+/).map((x) => FOLD[x]).filter((x): x is Code => !!x);
  const codes = normalizeCodes(raw.length >= 3 ? raw : codesFromNames(recipe), recipe.verseChorus);
  const ids = new Set(tracks.map((t) => t.id));
  const has = (id: string) => ids.has(id);
  const names = recipe.verseChorus ? SONG : DANCE;
  const seen: Partial<Record<Code, number>> = {};
  const rng = r("form");
  const lastB = codes.lastIndexOf("B");
  const sections: Section[] = codes.map((code, i) => {
    const nth = seen[code] ?? 0; seen[code] = nth + 1;
    const name = nth ? `${names[code]} ${nth + 1}` : names[code];
    const id = name.toLowerCase().replace(/\s+/g, "");
    const nextIsDrop = codes[i + 1] === "D";
    const bars = code === "B" && i === lastB && i > 3 && chance(0.5, rng) ? 4 : code === "V" && recipe.verseChorus ? 16 : BARS[code];
    const fill: Section["fill"] = code === "B" ? (nextIsDrop ? pick(["cut", "cut", "riser"] as const, rng) : "riser") : code === "K" || (code === "V" && nextIsDrop) ? "roll" : "none";
    const automation: Automation[] = [];
    if (code === "I") automation.push({ track: has("pad") ? "pad" : "master", param: "filter.cutoff", from: 400, to: has("pad") ? 1600 : 18000, curve: "exp" });
    if (code === "B" && nextIsDrop) automation.push(chance(0.5, rng) ? { track: "master", param: "filter.cutoff", from: 700, to: 18000, curve: "exp" } : { track: "pad", param: "filter.cutoff", from: 900, to: 5000, curve: "exp" });
    if (code === "K" && has("hook")) automation.push({ track: "hook", param: "filter.cutoff", from: 1200, to: 5000, curve: "exp" });
    if (code === "O") automation.push({ track: "master", param: "volume", from: 0, to: -18 });
    const variants: Record<string, string> = {};
    if (code === "I" || code === "K" || code === "O") variants.hat = "sparse";
    if (code === "I") variants.kick = "plain";
    if (code === "D" && nth > 0 && tracks.find((t) => t.id === "bass")?.patterns?.alt) variants.bass = "alt";
    const energy = Math.round(Math.min(1, ENERGY[code] * (code === "D" && typeof dna.energy === "number" ? 0.85 + 0.15 * dna.energy : 1)) * 100) / 100;
    return { id, name, bars, active: activeFor(code, nth, has, recipe.verseChorus, rng), fill, energy, ...(Object.keys(variants).length ? { variants } : {}), ...(automation.length ? { automation } : {}) };
  });
  return { sections, arrangement: sections.map((s) => s.id), codes: codes.join(" ") };
}
