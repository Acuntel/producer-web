// Robust parsing of the brain's reply. The model is asked for strict JSON, but
// we survive fences, prose, and missing fields.
import type { Song } from "../song/types";
import { migrateSong } from "../song/migrate";
import { laneId } from "./laneNames";

export type BrainAction = { type: "play" | "pause" | "goto" | "loop" | "unloop" | "recordHum" | "rollout" | "hear" | "analyze" | "identify" | "tracklist" | "vocal" | "findSound" | "none"; section?: string; bar?: number; beats?: number; track?: string; kind?: string; lane?: string; url?: string; query?: string; prompt?: string; lyrics?: string; lengthMs?: number; from?: "local" | "web" };
export type Expectation = { section?: string; metric: string; dir: "up" | "down" };
export type BrainReply = { say: string; ops: unknown[] | null; song: Song | null; action: BrainAction | null; listen: string | null; expect: Expectation[] | null; alternative: unknown[] | null; raw?: string };

// When the JSON is cut off or malformed, never speak the raw text: pull the "say"
// sentence out by hand, or say something honest and short.
export function safeSay(text: string): string {
  const t = text.trim();
  const m = t.match(/"say"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m) { try { return JSON.parse(`"${m[1]}"`).slice(0, 500); } catch { return m[1].slice(0, 500); } }
  if (!t || t.startsWith("{") || t.startsWith("[") || t.startsWith("```") || /"op"\s*:/.test(t)) return "I lost my words halfway through that move. Say it again and I will land it.";
  return t.slice(0, 500);
}

export const looksTruncated = (text: string): boolean => { const t = text.trim(); return t.startsWith("{") && !extractJson(t); };

export function parseBrain(text: string): BrainReply {
  const fallback: BrainReply = { say: safeSay(text), ops: null, song: null, action: null, listen: null, expect: null, alternative: null, raw: text };
  const obj = extractJson(text);
  if (!obj) return fallback;
  const say = typeof obj.say === "string" && obj.say.trim() ? obj.say.trim() : fallback.say;
  const ops = Array.isArray(obj.ops) && obj.ops.length ? obj.ops : null;
  const song = ops ? null : migrateSong(obj.song);
  const expect = Array.isArray(obj.expect) ? (obj.expect as unknown[]).filter((e): e is Expectation => !!e && typeof e === "object" && typeof (e as Expectation).metric === "string" && ((e as Expectation).dir === "up" || (e as Expectation).dir === "down")) : null;
  const alternative = Array.isArray(obj.alternative) && obj.alternative.length ? obj.alternative : null;
  return { say, ops, song, action: normalizeAction(obj.action), listen: typeof obj.listen === "string" ? obj.listen : null, expect: expect && expect.length ? expect : null, alternative, raw: text };
}

export function normalizeAction(a: unknown): BrainAction | null {
  if (!a) return null;
  if (typeof a === "string") {
    const s = a.toLowerCase();
    if (s === "pause" || s === "stop") return { type: "pause" };
    if (s === "play" || s === "resume") return { type: "play" };
    return null;
  }
  if (typeof a !== "object") return null;
  const o = a as Record<string, unknown>;
  const type = typeof o.type === "string" ? o.type : "";
  if (!["play", "pause", "goto", "loop", "unloop", "recordHum", "rollout", "hear", "analyze", "vocal", "findSound", "none"].includes(type)) return null;
  return {
    type: type as BrainAction["type"],
    section: typeof o.section === "string" ? o.section : undefined,
    bar: typeof o.bar === "number" ? o.bar : undefined,
    beats: typeof o.beats === "number" ? o.beats : undefined,
    track: typeof o.track === "string" ? o.track : undefined,
    kind: typeof o.kind === "string" ? o.kind : undefined,
    ...(laneId(o.lane) ? { lane: laneId(o.lane) as string } : {}),
    ...(typeof o.url === "string" && /^https?:\/\/\S+$/i.test(o.url) ? { url: o.url } : {}),
    ...(typeof o.query === "string" && o.query.trim() ? { query: o.query.trim().slice(0, 160) } : {}),
    ...(o.from === "local" || o.from === "web" ? { from: o.from } : {}),
    ...(typeof o.prompt === "string" && o.prompt.trim() ? { prompt: o.prompt.trim().slice(0, 600) } : {}),
    ...(typeof o.lyrics === "string" && o.lyrics.trim() ? { lyrics: o.lyrics.trim().slice(0, 1200) } : {}),
    ...(typeof o.lengthMs === "number" ? { lengthMs: Math.max(3000, Math.min(60000, Math.round(o.lengthMs))) } : {}),
  };
}

// Find the outermost JSON object in a blob of text (handles ```json fences).
export function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  // Walk to the matching close brace so trailing prose does not break parsing.
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { break; } } }
  }
  const end = cleaned.lastIndexOf("}");
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}
