// The lane recipes as the compiler reads them: the researched ones in knowledge/lanes/lanes.json and the two
// shipped lanes written from their seeds. Drum strings, bass patterns and synth numbers are kept as data; the
// prose in a recipe (a "hint", a "laws" line) is left for the brain.
import lanesJson from "../../../knowledge/lanes/lanes.json";
import type { SynthParams, Fx, Wave } from "../types";

export type DrumRole = "kick" | "clap" | "snare" | "hat" | "openhat" | "perc";
export type PartDesc = { synth: SynthParams; volume?: number; fx?: Fx };
export type Section0 = { name: string; bars: number; fill: string; energy: number };
export type Recipe = {
  id: string; bpm: [number, number, number]; keys: string[]; swing: number[];
  drums: Partial<Record<DrumRole, string[]>>;
  bass: { synth: SynthParams; drive: number; duck: boolean; patterns: string[] };
  progressions: string[];
  parts: Partial<Record<"pad" | "stab" | "chords" | "arp" | "lead" | "pluck", PartDesc>>;
  arrangement: Section0[]; sidechainDb: number; sidechainReleaseMs: number; verseChorus: boolean;
};

type Raw = { id: string; bpm: number[]; keys?: string[]; swing?: number[]; drums: Record<string, string>; bass?: Record<string, unknown>; harmony?: Record<string, unknown>; arrangement: Section0[]; mix?: Record<string, unknown> };

const TECH_HOUSE: Raw = {
  id: "tech-house", bpm: [124, 126, 130], keys: ["D minor", "A minor", "G minor", "F minor", "C minor"], swing: [0.54, 0.56, 0.58],
  drums: { kick: "X...X...X...X...", clap: "....X.......X...", hat: "4363436343634363", hat2: "..x...x...x...x.", openhat: "..o...o...o...o.", perc: "......x.......x.", perc2: "...x..x....x..x." },
  bass: { wave: "fatsawtooth", unison: 2, spread: 18, cutoff: 900, resonance: 3, envAmount: 2.6, decay: 0.14, sustain: 0.35, drive: 0.25,
    patterns: { rolling: "..x...x...x..xxx|..x...x...x.x.xx", offbeat: "..x...x...x...x.", bounce: "..x..x..x.x...x." } },
  harmony: { progressions: ["i", "i-bVII", "i-bVI-bVII-i", "i-iv"], stab: "fatsawtooth unison 2 cutoff 2600 decay 0.18 delay 8n. wet 0.18 -7 dB", pad: "sawtooth cutoff 1800 attack 0.4 release 0.9 width 0.8 -10 dB" },
  arrangement: [{ name: "Intro", bars: 8, fill: "none", energy: 0.3 }, { name: "Groove", bars: 8, fill: "roll", energy: 0.55 }, { name: "Build", bars: 8, fill: "cut", energy: 0.7 }, { name: "Drop", bars: 16, fill: "none", energy: 1 }, { name: "Breakdown", bars: 8, fill: "roll", energy: 0.35 }, { name: "Build 2", bars: 4, fill: "cut", energy: 0.75 }, { name: "Drop 2", bars: 16, fill: "none", energy: 1 }, { name: "Outro", bars: 8, fill: "none", energy: 0.4 }],
  mix: { sidechainDb: 6, sidechainReleaseMs: 120 },
};
const HARD_HOUSE: Raw = {
  id: "hard-house", bpm: [140, 142, 145], keys: ["F minor", "G minor", "A minor", "E minor"], swing: [0.55, 0.57, 0.58],
  drums: { kick: "X...X...X...X...", clap: "....X.......X...", ghost: "...g...g..g..g..", hat: ".x.x.x.x.x.x.x.x", openhat: "..o...o...o...o.", perc: "..x...x...x...x." },
  bass: { wave: "fatsawtooth", unison: 3, spread: 30, cutoff: 700, resonance: 4, envAmount: 3, decay: 0.2, sustain: 0.5, drive: 0.45,
    patterns: { warp: "..X...x...X...X.|..X...x...X...X.", gallop: "..x..xx...x..xx." } },
  harmony: { progressions: ["i-bVI", "i-bVII", "i", "i-iv-bVI-bVII"], stab: "fatsawtooth unison 3 spread 40 decay 0.15 delay 16n wet 0.12 -6 dB", pad: "sawtooth cutoff 1400 attack 0.5 width 0.9 -13 dB" },
  arrangement: [{ name: "Intro", bars: 8, fill: "none", energy: 0.3 }, { name: "Groove", bars: 8, fill: "roll", energy: 0.6 }, { name: "Build", bars: 8, fill: "cut", energy: 0.7 }, { name: "Drop", bars: 16, fill: "none", energy: 1 }, { name: "Breakdown", bars: 8, fill: "roll", energy: 0.3 }, { name: "Build 2", bars: 4, fill: "cut", energy: 0.8 }, { name: "Drop 2", bars: 16, fill: "none", energy: 1 }, { name: "Outro", bars: 8, fill: "none", energy: 0.4 }],
  mix: { sidechainDb: 9, sidechainReleaseMs: 220 },
};

const WAVES: Wave[] = ["fatsawtooth", "fatsquare", "fattriangle", "sawtooth", "square", "triangle", "sine", "pwm", "epiano", "organ"];
const num = (s: string, re: RegExp) => { const m = re.exec(s); return m ? Number(m[1]) : undefined; };

/** A recipe's prose part ("fatsawtooth unison 3 spread 26 cutoff 1200-2400 attack 0.6 width 0.9 -12 dB") as synth numbers. */
export function parsePart(desc: unknown): PartDesc | null {
  if (typeof desc !== "string" || /^\s*none\b/i.test(desc)) return null;
  const d = desc.toLowerCase();
  const wave = WAVES.find((w) => new RegExp(`\\b${w}\\b`).test(d)) ?? (/rhodes|piano|epiano/.test(d) ? "epiano" : /organ/.test(d) ? "organ" : /supersaw/.test(d) ? "fatsawtooth" : /flute|bell|sine/.test(d) ? "sine" : undefined);
  const synth: SynthParams = { wave };
  const set = (k: keyof SynthParams, re: RegExp) => { const v = num(d, re); if (v !== undefined && Number.isFinite(v)) (synth as Record<string, number>)[k] = v; };
  set("unison", /unison (\d+)/); set("spread", /spread (\d+)/); set("cutoff", /cutoff (\d+)/); set("attack", /attack ([\d.]+)/);
  set("decay", /decay ([\d.]+)/); set("release", /release ([\d.]+)/); set("resonance", /res(?:onance)? ([\d.]+)/);
  if (/supersaw/.test(d)) { synth.unison ??= 4; synth.spread ??= 30; }
  const fx: Fx = {};
  const width = num(d, /width ([\d.]+)/); if (width !== undefined) fx.width = Math.min(1, width);
  const reverb = num(d, /reverb (?:send )?([\d.]+)/); if (reverb !== undefined) fx.reverb = Math.min(1, reverb);
  const dl = /delay (4n|8n\.|8n|16n|8t)/.exec(d);
  if (dl) fx.delay = { time: dl[1] as "4n", feedback: num(d, /feedback ([\d.]+)/) ?? 0.3, wet: Math.min(0.5, num(d, /wet ([\d.]+)/) ?? 0.2) };
  const vol = num(d, /(-\d+) db/);
  return { synth, ...(vol !== undefined ? { volume: vol } : {}), ...(Object.keys(fx).length ? { fx } : {}) };
}

const PATTERN = /^[Xxgo.0-9|]+$/;
export const isPattern = (s: unknown): s is string => typeof s === "string" && PATTERN.test(s) && s.replace(/\|/g, "").length % 16 === 0 && s.replace(/\|/g, "").length > 0;
function drumRole(name: string): DrumRole | null {
  if (/roll|32|trip|fill/i.test(name)) return null;
  if (/^kick/.test(name)) return "kick";
  if (/^clap/.test(name)) return "clap";
  if (/^(snare|ghost|rim)/.test(name)) return "snare";
  if (/^openhat/.test(name)) return "openhat";
  if (/^(hat|ride)/.test(name)) return "hat";
  if (/^(perc|shaker|tom|squeak|afro|crash|cowbell)/.test(name)) return "perc";
  return null;
}

function normalize(r: Raw): Recipe {
  const drums: Recipe["drums"] = {};
  for (const [name, steps] of Object.entries(r.drums ?? {})) { const role = drumRole(name); if (role && isPattern(steps)) (drums[role] ??= []).push(steps); }
  const b = (r.bass ?? {}) as Record<string, unknown>;
  const synth: SynthParams = {};
  for (const k of ["wave", "unison", "spread", "cutoff", "resonance", "envAmount", "attack", "decay", "sustain", "release", "glide"] as const) if (b[k] !== undefined) (synth as Record<string, unknown>)[k] = b[k];
  const patterns = Object.values((b.patterns ?? {}) as Record<string, unknown>).filter(isPattern);
  const h = (r.harmony ?? {}) as Record<string, unknown>;
  const parts: Recipe["parts"] = {};
  const put = (k: keyof Recipe["parts"], v: unknown) => { const p = parsePart(v); if (p && !parts[k]) parts[k] = p; };
  put("pad", h.pad); put("stab", h.stab ?? h.stabs); put("chords", h.chords ?? h.pianoHouse); put("arp", h.arp ?? h.acid); put("lead", h.lead ?? h.bells); put("pluck", h.pluck);
  const mix = (r.mix ?? {}) as Record<string, unknown>;
  const names = r.arrangement.map((s) => s.name.toLowerCase()).join(" ");
  return {
    id: r.id, bpm: [r.bpm[0], r.bpm[1] ?? r.bpm[0], r.bpm[r.bpm.length - 1]], keys: r.keys?.length ? r.keys : ["A minor"], swing: r.swing?.length ? r.swing : [0.54],
    drums, bass: { synth, drive: typeof b.drive === "number" ? b.drive : 0.2, duck: b.duck !== false, patterns: patterns.length ? patterns : ["..x...x...x...x."] },
    progressions: Array.isArray(h.progressions) ? (h.progressions as unknown[]).filter((x): x is string => typeof x === "string") : ["i"],
    parts, arrangement: r.arrangement.map((s) => ({ name: s.name, bars: s.bars, fill: s.fill ?? "none", energy: s.energy ?? 0.6 })),
    sidechainDb: typeof mix.sidechainDb === "number" ? mix.sidechainDb : 6, sidechainReleaseMs: typeof mix.sidechainReleaseMs === "number" ? mix.sidechainReleaseMs : 120,
    verseChorus: /verse|chorus/.test(names),
  };
}

const RECIPES = new Map<string, Recipe>();
for (const r of [TECH_HOUSE, HARD_HOUSE, ...(((lanesJson as unknown as { lanes?: Raw[] }).lanes) ?? [])]) if (r && typeof r.id === "string" && Array.isArray(r.arrangement)) RECIPES.set(r.id, normalize(r));

/** A lane's recipe; an unknown lane gets tech house, the home lane. */
export const recipeFor = (lane: string): Recipe => RECIPES.get(lane) ?? RECIPES.get("tech-house")!;
export const recipeIds = () => [...RECIPES.keys()];
