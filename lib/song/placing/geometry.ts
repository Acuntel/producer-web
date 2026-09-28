// Where things are in a song, in beats: the arrangement laid end to end, each section's role, and the notes of the
// parts a voice has to live with (the chords under it, the lead beside it). Tone-free and browser-free.
import type { Song, Track, Section } from "../types";
import type { Placed, SectionRole } from "./types";

export function roleOfSection(s: Pick<Section, "name" | "fill" | "energy">, i: number, n: number): SectionRole {
  const name = s.name.toLowerCase();
  if (/drop|chorus|hook/.test(name)) return "drop";
  if (/break/.test(name)) return "break";
  if (/build|riser|up\b|pre/.test(name) || s.fill === "cut" || s.fill === "riser") return "build";
  if (/intro/.test(name) || (i === 0 && (s.energy ?? 0.5) < 0.5)) return "intro";
  if (/outro|end/.test(name) || (i === n - 1 && (s.energy ?? 0.5) < 0.5)) return "outro";
  return "groove";
}

/** The arrangement laid out: every occurrence of a section with its start beat. */
export function layout(song: Song): Placed[] {
  const byId = new Map(song.sections.map((s) => [s.id, s]));
  const out: Placed[] = [];
  let beat = 0;
  const ids = song.arrangement.filter((id) => byId.has(id));
  ids.forEach((id, i) => {
    const s = byId.get(id)!;
    out.push({ id, name: s.name, index: i, startBeat: beat, beats: s.bars * 4, bars: s.bars, energy: s.energy ?? 0.6, fill: s.fill ?? "none", role: roleOfSection(s, i, ids.length), active: s.active });
    beat += s.bars * 4;
  });
  return out;
}

const LEADS = new Set(["lead", "pluck", "arp"]);
const HARMONY = new Set(["chords", "pad", "stab", "bass", "sub"]);
export const isLead = (t: Track) => LEADS.has(t.role) || t.id === "hook";
export const isHarmony = (t: Track) => HARMONY.has(t.role);
/** Parts that sound in 1 to 5 kHz, where a voice is understood: leads, chords, stabs, pads, hats. */
export const isMid = (t: Track) => isLead(t) || t.role === "chords" || t.role === "stab" || t.role === "pad";

/** Notes of a track sounding between two beats of one section occurrence, as [midi, absStart, absEnd]. */
export function notesIn(t: Track, sec: Placed, from: number, to: number): [number, number, number][] {
  if (!sec.active.includes(t.id) || !t.notes.length || t.role === "audio") return [];
  const out: [number, number, number][] = [];
  const L = Math.max(0.25, t.loopBeats);
  for (let rep = 0; rep * L < sec.beats; rep++) {
    for (const n of t.notes) {
      const a = sec.startBeat + rep * L + n[1];
      if (n[1] >= L || a >= sec.startBeat + sec.beats) continue;
      const b = a + n[2];
      if (b > from && a < to) out.push([n[0] + (t.transpose ?? 0), a, b]);
    }
  }
  return out;
}

/** The pitch classes sounding under a span, weighted by beats: the section's chroma the voice must agree with. */
export function chromaUnder(song: Song, secs: Placed[], from: number, to: number): number[] {
  const c = new Array(12).fill(0);
  for (const sec of secs) {
    if (sec.startBeat >= to || sec.startBeat + sec.beats <= from) continue;
    for (const t of song.tracks) {
      if (!isHarmony(t)) continue;
      for (const [m, a, b] of notesIn(t, sec, from, to)) c[((Math.round(m) % 12) + 12) % 12] += Math.min(b, to) - Math.max(a, from);
    }
  }
  return c;
}

/** Lead notes sounding under a span: what a voice collides with. */
export function leadsUnder(song: Song, secs: Placed[], from: number, to: number): { track: string; notes: [number, number, number][] }[] {
  const out: { track: string; notes: [number, number, number][] }[] = [];
  for (const t of song.tracks) {
    if (!isLead(t)) continue;
    const notes = secs.flatMap((sec) => (sec.startBeat < to && sec.startBeat + sec.beats > from ? notesIn(t, sec, from, to) : []));
    if (notes.length) out.push({ track: t.id, notes });
  }
  return out;
}

/** The section occurrence a beat falls in. */
export const sectionAtBeat = (secs: Placed[], beat: number) => secs.find((s) => beat >= s.startBeat - 1e-6 && beat < s.startBeat + s.beats - 1e-6) ?? null;
