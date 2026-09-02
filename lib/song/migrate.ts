// Bring any stored song (v1 loop, v2 sections, v3) up to SongDoc v3.
import type { Song, Track, Section } from "./types";

type Loose = Record<string, unknown>;

export function migrateSong(input: unknown): Song | null {
  if (!input || typeof input !== "object") return null;
  const s = input as Loose;
  if (!Array.isArray(s.tracks)) return null;
  const tracks = (s.tracks as Loose[]).map(migrateTrack).filter((t): t is Track => t !== null);
  const hasSections = Array.isArray(s.sections) && (s.sections as unknown[]).length > 0;
  if (tracks.length === 0 && !hasSections) return null; // a skeleton (sections, no tracks yet) is allowed mid-build
  let sections = Array.isArray(s.sections) ? (s.sections as Loose[]).map(migrateSection).filter((x): x is Section => x !== null) : [];
  let arrangement = Array.isArray(s.arrangement) ? (s.arrangement as string[]).filter((id) => sections.some((x) => x.id === id)) : [];
  if (sections.length === 0) {
    // v1: one loop of everything.
    sections = [{ id: "loop", name: "Loop", bars: 8, active: tracks.map((t) => t.id), fill: "none" }];
    arrangement = ["loop"];
  } else if (arrangement.length === 0) arrangement = sections.map((x) => x.id);
  const h = (s.humanize as Loose) ?? {};
  return {
    version: 3,
    title: typeof s.title === "string" ? s.title : "Untitled",
    bpm: typeof s.bpm === "number" ? s.bpm : 126,
    key: typeof s.key === "string" ? s.key : "D minor",
    lane: typeof s.lane === "string" && s.lane.trim() ? s.lane.trim() : "tech-house",
    humanize: {
      swing: num(h.swing, 0.55), velVar: num(h.velVar, 0.06), clapLateMs: num(h.clapLateMs, 5), seed: num(h.seed, 42),
      pocketMs: typeof h.pocketMs === "number" ? h.pocketMs : undefined,
    },
    tracks, sections, arrangement,
    master: (s.master as Song["master"]) ?? undefined,
    loop: (s.loop as Song["loop"]) ?? null,
    notes: typeof s.notes === "string" ? s.notes : undefined,
  };
}

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

function migrateTrack(t: Loose): Track | null {
  if (!t || typeof t.id !== "string") return null;
  const notes = Array.isArray(t.notes) ? (t.notes as unknown[]).filter(isNote) : [];
  return {
    id: t.id,
    name: typeof t.name === "string" ? t.name : t.id,
    role: (typeof t.role === "string" ? t.role : "lead") as Track["role"],
    volume: num(t.volume, -6),
    duck: t.duck === true,
    mute: t.mute === true,
    solo: t.solo === true,
    loopBeats: Math.max(1, num(t.loopBeats, 4)),
    notes,
    patterns: t.patterns && typeof t.patterns === "object" ? cleanPatterns(t.patterns as Loose) : undefined,
    synth: (t.synth as Track["synth"]) ?? undefined,
    fx: (t.fx as Track["fx"]) ?? undefined,
    clip: (t.clip as Track["clip"]) ?? undefined,
    transpose: typeof t.transpose === "number" ? t.transpose : undefined,
  };
}

function cleanPatterns(p: Loose): Record<string, Track["notes"]> {
  const out: Record<string, Track["notes"]> = {};
  for (const [k, v] of Object.entries(p)) if (Array.isArray(v)) out[k] = (v as unknown[]).filter(isNote);
  return out;
}

function migrateSection(s: Loose): Section | null {
  if (!s || typeof s.id !== "string") return null;
  return {
    id: s.id,
    name: typeof s.name === "string" ? s.name : s.id,
    bars: Math.max(1, Math.round(num(s.bars, 8))),
    active: Array.isArray(s.active) ? (s.active as unknown[]).filter((x): x is string => typeof x === "string") : [],
    fill: (s.fill as Section["fill"]) ?? "none",
    variants: (s.variants as Section["variants"]) ?? undefined,
    automation: Array.isArray(s.automation) ? (s.automation as Section["automation"]) : undefined,
    energy: typeof s.energy === "number" ? s.energy : undefined,
    note: typeof s.note === "string" ? s.note : undefined,
  };
}

export function isNote(n: unknown): n is Track["notes"][number] {
  return Array.isArray(n) && n.length >= 3 && n.slice(0, 3).every((x) => typeof x === "number" && Number.isFinite(x));
}

// Normalize a note tuple (fill velocity, clamp) so sloppy brain output still plays.
export function cleanNote(n: Track["notes"][number]): Track["notes"][number] {
  return [Math.round(n[0]), Math.max(0, n[1]), Math.max(0.03, n[2]), Math.max(1, Math.min(127, Math.round(n[3] ?? 100)))];
}
