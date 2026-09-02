// DAW ops: the Groove Pool, pattern playlists (fills, sequences), note chance
// and velocity deviation. Pure edits on the SongDoc; the scheduler does the rest.
import type { Song, Track, Section, Groove, GrooveName, VariantPlan, Note } from "./types";
import { isDrum } from "./types";
import { cleanGroove, swingOf, STRAIGHT_ROLES } from "./groove";
import { isPlan } from "./pattern";

export type DawOp =
  | { op: "groove"; track?: string; name: GrooveName; amount?: number; velocity?: number; random?: number; timing?: number[]; accents?: number[]; from?: "reference" }
  | { op: "variant"; section: string; track: string; pattern: VariantPlan | null }
  | { op: "fill"; section: string; track: string; every: number; pattern: string; bars?: number; base?: string }
  | { op: "chance"; track: string; value: number; pattern?: string }
  | { op: "velDev"; track: string; steps: number };

export const findTrack = (s: Song, id: string) => s.tracks.find((t) => t.id === id || t.name.toLowerCase() === id.toLowerCase());
export const findSection = (s: Song, id: string) => s.sections.find((x) => x.id === id || x.name.toLowerCase() === id.toLowerCase());
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Which tracks a groove op addresses: one id, "drums" (the swung drums: hats, open hats, perc, ghosts), or "all" (the song groove).
function grooveTargets(s: Song, track: string | undefined): Track[] | "song" {
  if (!track || track === "all" || track === "song") return "song";
  if (track === "drums") return s.tracks.filter((t) => isDrum(t.role) && !STRAIGHT_ROLES.includes(t.role));
  const t = findTrack(s, track);
  return t ? [t] : [];
}

export function applyDawOp(s: Song, o: DawOp): boolean {
  switch (o.op) {
    case "groove": {
      if (o.from === "reference" && !o.timing) return false; // the studio fills in the reference groove; without one there is nothing to apply
      const g: Groove | null = o.name === "straight" ? null : cleanGroove({ name: o.name, amount: o.amount ?? 1, velocity: o.velocity, random: o.random, timing: o.timing, accents: o.accents });
      if (o.name !== "straight" && !g) return false;
      const targets = grooveTargets(s, o.track);
      if (targets === "song") {
        s.groove = g;
        s.humanize.swing = swingOf(g);
        for (const t of s.tracks) if (t.groove !== undefined && !STRAIGHT_ROLES.includes(t.role)) delete t.groove; // the song groove is now the law again
        return true;
      }
      if (targets.length === 0) return false;
      for (const t of targets) t.groove = g;
      return true;
    }
    case "variant": {
      const sec = findSection(s, o.section); const t = findTrack(s, o.track);
      if (!sec || !t) return false;
      sec.variants ??= {};
      if (o.pattern === null || o.pattern === "A") delete sec.variants[t.id];
      else if (isPlan(o.pattern)) sec.variants[t.id] = o.pattern;
      else return false;
      return true;
    }
    case "fill": {
      const sec = findSection(s, o.section); const t = findTrack(s, o.track);
      if (!sec || !t || typeof o.pattern !== "string" || typeof o.every !== "number" || o.every < 1) return false;
      (sec.variants ??= {})[t.id] = { every: Math.round(o.every), pattern: o.pattern, bars: o.bars, base: o.base };
      if (!sec.active.includes(t.id)) sec.active.push(t.id);
      return true;
    }
    case "chance": {
      const t = findTrack(s, o.track);
      if (!t || typeof o.value !== "number" || !Number.isFinite(o.value)) return false;
      const value = clamp(o.value, 0, 1);
      if (!o.pattern) { if (value >= 1) delete t.chance; else t.chance = value; return true; }
      const list = o.pattern === "A" ? t.notes : t.patterns?.[o.pattern];
      if (!list) return false;
      for (const n of list) setChance(n, value);
      return true;
    }
    case "velDev": {
      const t = findTrack(s, o.track);
      if (!t || typeof o.steps !== "number" || !Number.isFinite(o.steps)) return false;
      const steps = Math.round(clamp(o.steps, 0, 40));
      if (steps <= 0) delete t.velDev; else t.velDev = steps;
      return true;
    }
    default: return false;
  }
}

export function setChance(n: Note, value: number) {
  if (value >= 1) { n.length = 4; return; }
  n[4] = clamp(value, 0, 1);
}

// Section helper shared with grid/sectionNotes: the per-section pattern name.
export const sectionPatternName = (sec: Section) => `sec:${sec.id}`;
