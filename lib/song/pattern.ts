// Which notes a track plays in a section, bar by bar: a named variant, a
// sequence of variants, a fill every N bars, or a seeded pick (Follow Actions).
import type { Track, Section, Note, VariantPlan } from "./types";
import { streamFor } from "./prng";

const MAIN = "A";

// The pattern name a plan resolves to at a given bar of the section (0-based).
export function resolvePlan(plan: VariantPlan | undefined, bar: number, seed: number, key: string): string {
  if (!plan) return MAIN;
  if (typeof plan === "string") return plan;
  if ("sequence" in plan && Array.isArray(plan.sequence) && plan.sequence.length) {
    const each = Math.max(1, Math.round(plan.barsEach ?? 8));
    return plan.sequence[Math.floor(bar / each) % plan.sequence.length];
  }
  if ("every" in plan && typeof plan.every === "number" && plan.every >= 1) {
    const every = Math.max(1, Math.round(plan.every));
    const bars = Math.max(1, Math.min(every, Math.round(plan.bars ?? 1)));
    return bar % every >= every - bars ? plan.pattern : plan.base ?? MAIN;
  }
  if ("any" in plan && Array.isArray(plan.any) && plan.any.length) {
    const each = Math.max(1, Math.round(plan.barsEach ?? 1));
    const block = Math.floor(bar / each);
    const rng = streamFor(seed, `any:${key}`);
    let pick = 0;
    for (let i = 0; i <= block; i++) pick = Math.floor(rng() * plan.any.length);
    return plan.any[pick];
  }
  return MAIN;
}

export const isPlan = (v: unknown): v is VariantPlan => typeof v === "string" || (!!v && typeof v === "object" && ("sequence" in v || "every" in v || "any" in v));

// Every pattern name a plan can name (for summaries and validation).
export function planNames(plan: VariantPlan | undefined): string[] {
  if (!plan) return [MAIN];
  if (typeof plan === "string") return [plan];
  if ("sequence" in plan) return plan.sequence;
  if ("every" in plan) return [plan.base ?? MAIN, plan.pattern];
  if ("any" in plan) return plan.any;
  return [MAIN];
}

export function planLabel(plan: VariantPlan | undefined): string {
  if (!plan) return "";
  if (typeof plan === "string") return plan;
  if ("sequence" in plan) return plan.sequence.join(" ");
  if ("every" in plan) return `${plan.pattern} every ${plan.every}`;
  if ("any" in plan) return `any of ${plan.any.join(" ")}`;
  return "";
}

const notesNamed = (track: Track, name: string): Note[] => (name === MAIN ? track.notes : track.patterns?.[name] ?? track.notes);

export function patternFor(track: Track, sec: Section, bar = 0, seed = 0): Note[] {
  return notesNamed(track, resolvePlan(sec.variants?.[track.id], bar, seed, `${sec.id}:${track.id}`));
}

// True when the track's pattern changes bar to bar in this section (the scheduler then tiles per bar).
export const isPlaylist = (track: Track, sec: Section) => { const p = sec.variants?.[track.id]; return !!p && typeof p !== "string"; };
