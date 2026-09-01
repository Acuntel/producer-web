// Ops: small, deterministic edits the brain can return instead of a whole song.
// applyOps never throws on bad input; unknown ops are reported and skipped.
import type { Song, Track, Section, Note, Automation, LoopRegion } from "./types";
import { isNote, cleanNote } from "./migrate";

export type Op =
  | { op: "set"; track: string; path: string; value: unknown }               // track id | "master" | "song"
  | { op: "notes"; track: string; notes: Note[]; pattern?: string; loopBeats?: number }
  | { op: "addTrack"; track: Track; after?: string }
  | { op: "removeTrack"; track: string }
  | { op: "mute" | "unmute" | "solo" | "unsolo"; track: string }                // track id | "all"
  | { op: "section"; section: Section; after?: string }                        // add or replace by id
  | { op: "removeSection"; section: string }
  | { op: "arrange"; arrangement: string[] }
  | { op: "active"; section: string; add?: string[]; remove?: string[] }
  | { op: "variant"; section: string; track: string; pattern: string | null }
  | { op: "automate"; section: string; automation: Automation }
  | { op: "clearAutomation"; section: string; track?: string }
  | { op: "transpose"; track?: string; semitones: number }
  | { op: "tempo"; bpm: number }
  | { op: "key"; key: string }
  | { op: "title"; title: string }
  | { op: "humanize"; swing?: number; velVar?: number; clapLateMs?: number; seed?: number; pocketMs?: number }
  | { op: "loop"; loop: LoopRegion }
  | { op: "shift"; track: string; beats: number; pattern?: string }
  | { op: "velocity"; track: string; scale?: number; add?: number; pattern?: string }
  | { op: "note"; note: string };

export type ApplyResult = { song: Song; applied: number; skipped: string[] };

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function applyOps(input: Song, ops: unknown): ApplyResult {
  const song = clone(input);
  const skipped: string[] = [];
  let applied = 0;
  if (!Array.isArray(ops)) return { song, applied, skipped: ["ops is not an array"] };
  for (const raw of ops) {
    try {
      if (applyOne(song, raw as Op)) applied++;
      else skipped.push(describeOp(raw));
    } catch (e) {
      skipped.push(`${describeOp(raw)}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  return { song, applied, skipped };
}

const describeOp = (raw: unknown) => {
  try { return JSON.stringify(raw).slice(0, 120); } catch { return "op"; }
};

const track = (s: Song, id: string) => s.tracks.find((t) => t.id === id || t.name.toLowerCase() === id.toLowerCase());
const section = (s: Song, id: string) => s.sections.find((x) => x.id === id || x.name.toLowerCase() === id.toLowerCase());

function applyOne(s: Song, o: Op): boolean {
  if (!o || typeof o !== "object" || typeof o.op !== "string") return false;
  switch (o.op) {
    case "set": {
      const target: unknown = o.track === "song" ? s : o.track === "master" ? (s.master ??= {}) : track(s, o.track);
      if (!target) return false;
      return setPath(target as Record<string, unknown>, o.path, o.value);
    }
    case "notes": {
      const t = track(s, o.track);
      if (!t || !Array.isArray(o.notes)) return false;
      const notes = o.notes.filter(isNote).map(cleanNote);
      if (o.pattern && o.pattern !== "A") (t.patterns ??= {})[o.pattern] = notes;
      else t.notes = notes;
      if (o.loopBeats && o.loopBeats > 0) t.loopBeats = o.loopBeats;
      return true;
    }
    case "addTrack": {
      const t = o.track;
      if (!t || typeof t.id !== "string" || typeof t.role !== "string") return false;
      const nt: Track = {
        id: t.id, name: t.name ?? t.id, role: t.role, volume: typeof t.volume === "number" ? t.volume : -6,
        duck: t.duck ?? !["kick", "clap"].includes(t.role), mute: false, solo: false,
        loopBeats: t.loopBeats && t.loopBeats > 0 ? t.loopBeats : 4,
        notes: Array.isArray(t.notes) ? t.notes.filter(isNote).map(cleanNote) : [],
        patterns: t.patterns, synth: t.synth, fx: t.fx, clip: t.clip, transpose: t.transpose,
      };
      const existing = s.tracks.findIndex((x) => x.id === nt.id);
      if (existing >= 0) s.tracks[existing] = nt;
      else {
        const idx = o.after ? s.tracks.findIndex((x) => x.id === o.after) : -1;
        if (idx >= 0) s.tracks.splice(idx + 1, 0, nt); else s.tracks.push(nt);
      }
      return true;
    }
    case "removeTrack": {
      const before = s.tracks.length;
      const t = track(s, o.track);
      if (!t) return false;
      s.tracks = s.tracks.filter((x) => x.id !== t.id);
      for (const sec of s.sections) sec.active = sec.active.filter((id) => id !== t.id);
      return s.tracks.length < before;
    }
    case "mute": case "unmute": case "solo": case "unsolo": {
      const targets = o.track === "all" ? s.tracks : [track(s, o.track)].filter((x): x is Track => !!x);
      if (targets.length === 0) return false;
      for (const t of targets) {
        if (o.op === "mute") t.mute = true;
        if (o.op === "unmute") t.mute = false;
        if (o.op === "solo") t.solo = true;
        if (o.op === "unsolo") t.solo = false;
      }
      return true;
    }
    case "section": {
      const sec = o.section;
      if (!sec || typeof sec.id !== "string") return false;
      const ns: Section = {
        id: sec.id, name: sec.name ?? sec.id, bars: Math.max(1, Math.round(sec.bars ?? 8)),
        active: Array.isArray(sec.active) ? sec.active : [], fill: sec.fill ?? "none",
        variants: sec.variants, automation: sec.automation, energy: sec.energy, note: sec.note,
      };
      const i = s.sections.findIndex((x) => x.id === ns.id);
      if (i >= 0) s.sections[i] = ns;
      else {
        s.sections.push(ns);
        const at = o.after ? s.arrangement.indexOf(o.after) : -1;
        if (at >= 0) s.arrangement.splice(at + 1, 0, ns.id);
        else if (!s.arrangement.includes(ns.id)) s.arrangement.push(ns.id);
      }
      return true;
    }
    case "removeSection": {
      const sec = section(s, o.section);
      if (!sec || s.sections.length <= 1) return false;
      s.sections = s.sections.filter((x) => x.id !== sec.id);
      s.arrangement = s.arrangement.filter((id) => id !== sec.id);
      if (s.arrangement.length === 0) s.arrangement = [s.sections[0].id];
      return true;
    }
    case "arrange": {
      if (!Array.isArray(o.arrangement)) return false;
      const ids = o.arrangement.map((id) => section(s, id)?.id).filter((x): x is string => !!x);
      if (ids.length === 0) return false;
      s.arrangement = ids;
      return true;
    }
    case "active": {
      const sec = section(s, o.section);
      if (!sec) return false;
      for (const id of o.add ?? []) { const t = track(s, id); if (t && !sec.active.includes(t.id)) sec.active.push(t.id); }
      for (const id of o.remove ?? []) { const t = track(s, id); if (t) sec.active = sec.active.filter((x) => x !== t.id); }
      return true;
    }
    case "variant": {
      const sec = section(s, o.section); const t = track(s, o.track);
      if (!sec || !t) return false;
      sec.variants ??= {};
      if (o.pattern === null || o.pattern === "A") delete sec.variants[t.id]; else sec.variants[t.id] = o.pattern;
      return true;
    }
    case "automate": {
      const sec = section(s, o.section);
      const a = o.automation;
      if (!sec || !a || typeof a.param !== "string" || typeof a.from !== "number" || typeof a.to !== "number") return false;
      sec.automation ??= [];
      sec.automation = sec.automation.filter((x) => !(x.track === a.track && x.param === a.param));
      sec.automation.push({ track: a.track, param: a.param, from: a.from, to: a.to, curve: a.curve, startBeat: a.startBeat, endBeat: a.endBeat });
      return true;
    }
    case "clearAutomation": {
      const sec = section(s, o.section);
      if (!sec) return false;
      sec.automation = o.track ? (sec.automation ?? []).filter((x) => x.track !== o.track) : [];
      return true;
    }
    case "transpose": {
      const semis = Math.round(o.semitones);
      if (!Number.isFinite(semis)) return false;
      const targets = o.track ? [track(s, o.track)].filter((x): x is Track => !!x) : s.tracks.filter((t) => !["kick", "clap", "snare", "hat", "openhat", "perc"].includes(t.role));
      if (targets.length === 0) return false;
      for (const t of targets) t.transpose = (t.transpose ?? 0) + semis;
      return true;
    }
    case "tempo": { if (typeof o.bpm !== "number" || o.bpm < 60 || o.bpm > 200) return false; s.bpm = Math.round(o.bpm * 10) / 10; return true; }
    case "key": { if (typeof o.key !== "string") return false; s.key = o.key; return true; }
    case "title": { if (typeof o.title !== "string") return false; s.title = o.title.slice(0, 60); return true; }
    case "note": { if (typeof o.note !== "string") return false; s.notes = o.note.slice(0, 600); return true; }
    case "humanize": {
      const h = s.humanize;
      if (typeof o.swing === "number") h.swing = clamp(o.swing, 0.5, 0.7);
      if (typeof o.velVar === "number") h.velVar = clamp(o.velVar, 0, 0.35);
      if (typeof o.clapLateMs === "number") h.clapLateMs = clamp(o.clapLateMs, -20, 30);
      if (typeof o.seed === "number") h.seed = Math.round(o.seed);
      if (typeof o.pocketMs === "number") h.pocketMs = clamp(o.pocketMs, -25, 25);
      return true;
    }
    case "loop": { s.loop = o.loop ?? null; return true; }
    case "shift": {
      const t = track(s, o.track);
      if (!t || typeof o.beats !== "number") return false;
      const list = o.pattern && o.pattern !== "A" ? t.patterns?.[o.pattern] : t.notes;
      if (!list) return false;
      for (const n of list) n[1] = ((n[1] + o.beats) % t.loopBeats + t.loopBeats) % t.loopBeats;
      return true;
    }
    case "velocity": {
      const t = track(s, o.track);
      if (!t) return false;
      const list = o.pattern && o.pattern !== "A" ? t.patterns?.[o.pattern] : t.notes;
      if (!list) return false;
      for (const n of list) n[3] = Math.max(1, Math.min(127, Math.round(n[3] * (o.scale ?? 1) + (o.add ?? 0))));
      return true;
    }
    default: return false;
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// "fx.filter.cutoff" -> nested set; creates intermediate objects. Guards the shape.
function setPath(target: Record<string, unknown>, path: string, value: unknown): boolean {
  if (typeof path !== "string" || !path) return false;
  const keys = path.split(".");
  if (keys.some((k) => k === "__proto__" || k === "constructor" || k === "prototype")) return false;
  let cur = target;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (last === "notes" && Array.isArray(value)) cur[last] = (value as unknown[]).filter(isNote).map(cleanNote);
  else cur[last] = value;
  return true;
}
