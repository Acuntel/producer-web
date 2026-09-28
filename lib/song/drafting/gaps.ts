// What a draft is missing, as offers a producer would make ("a snare roll into the drop, one of those high leads,
// or a vocal on it"), each with the ops that add it. The options come from the record, not a fixed list: an offer
// is only made for something the draft does not already have.
import type { Song, Note, Track } from "../types";
import type { Op } from "../ops";

export type OfferId = "vocal" | "roll" | "lead" | "arp" | "openhat";
export type Offer = { id: OfferId; label: string };

const dropIds = (s: Song) => s.sections.filter((x) => /drop|chorus|climax/i.test(x.name)).map((x) => x.id);
const beforeDrops = (s: Song) => s.arrangement.filter((id, i) => dropIds(s).includes(s.arrangement[i + 1] ?? ""));
const has = (s: Song, id: string) => s.tracks.some((t) => t.id === id);

/** Up to three offers, the most telling first: a voice when the source sings, a roll into the drop, a high lead. */
export function gapsOf(s: Song): Offer[] {
  const out: Offer[] = [];
  const vocal = s.tracks.some((t) => t.role === "audio" && !t.clip?.sampleId);
  if (!vocal && s.draft?.dna.voice !== "instrumental") out.push({ id: "vocal", label: "a vocal on it" });
  if (!has(s, "roll") && beforeDrops(s).length) out.push({ id: "roll", label: "a snare roll into the drop" });
  const hook = s.tracks.find((t) => t.id === "hook");
  if (!has(s, "highlead") && hook && (hook.role === "pluck" || Math.max(...hook.notes.map((n) => n[0])) < 80)) out.push({ id: "lead", label: "one of those high leads" });
  if (!has(s, "arp")) out.push({ id: "arp", label: "an arp in the breakdown" });
  if (!has(s, "openhat")) out.push({ id: "openhat", label: "open hats in the groove" });
  return out.slice(0, 3);
}

export function offerLine(offers: Offer[]): string {
  const l = offers.map((o) => o.label);
  if (!l.length) return "What do you want to hear next?";
  return `Want ${l.length === 1 ? l[0] : `${l.slice(0, -1).join(", ")}, or ${l[l.length - 1]}`}?`;
}

/** The ops that add an offer (the vocal is a job of its own, not ops). */
export function offerOps(s: Song, id: OfferId): Op[] {
  const drops = dropIds(s);
  if (id === "roll") {
    const roll: Note[] = Array.from({ length: 16 }, (_, i) => [38, i * 0.25, 0.1, Math.round(40 + i * 5.5)] as Note);
    const track: Track = { id: "roll", name: "Snare Roll", role: "snare", volume: -7, loopBeats: 4, notes: [], patterns: { roll } };
    return [{ op: "addTrack", track }, ...beforeDrops(s).map((sec) => ({ op: "fill" as const, section: sec, track: "roll", every: s.sections.find((x) => x.id === sec)?.bars ?? 8, pattern: "roll", bars: 1 }))];
  }
  if (id === "lead") {
    const hook = s.tracks.find((t) => t.id === "hook"); if (!hook) return [];
    const up = hook.role === "pluck" ? 12 : Math.max(...hook.notes.map((n) => n[0])) < 80 ? 12 : 0;
    const track: Track = { id: "highlead", name: "High Lead", role: "lead", volume: -9, duck: true, loopBeats: hook.loopBeats, notes: hook.notes.map((n) => [n[0] + up, n[1], n[2], Math.min(127, n[3] + 4)] as Note),
      synth: { wave: "fatsawtooth", unison: 4, spread: 32, cutoff: 5200, attack: 0.01, decay: 0.25, sustain: 0.6, release: 0.35 }, fx: { delay: { time: "8n.", feedback: 0.35, wet: 0.24 }, reverb: 0.3, width: 0.9 } };
    return [{ op: "addTrack", track }, ...drops.map((sec) => ({ op: "active" as const, section: sec, add: ["highlead"] }))];
  }
  if (id === "arp") {
    const pad = s.tracks.find((t) => t.id === "pad"); if (!pad) return [];
    const chords = [...new Set(pad.notes.map((n) => n[1]))].sort((a, b) => a - b);
    const notes: Note[] = chords.flatMap((at, ci) => { const tones = pad.notes.filter((n) => n[1] === at).map((n) => n[0] + 12); const end = chords[ci + 1] ?? pad.loopBeats; const out: Note[] = []; for (let b = at, i = 0; b < end; b += 0.5, i++) out.push([tones[i % tones.length], b, 0.4, i % 2 ? 76 : 92]); return out; });
    const track: Track = { id: "arp", name: "Arp", role: "arp", volume: -11, duck: true, loopBeats: pad.loopBeats, notes, synth: { wave: "sawtooth", decay: 0.12, sustain: 0.1, cutoff: 2000 }, fx: { delay: { time: "8n.", feedback: 0.35, wet: 0.25 }, reverb: 0.3 } };
    const breaks = s.sections.filter((x) => /break|bridge/i.test(x.name)).map((x) => x.id);
    return [{ op: "addTrack", track }, ...[...breaks, ...drops].map((sec) => ({ op: "active" as const, section: sec, add: ["arp"] }))];
  }
  if (id === "openhat") {
    const notes: Note[] = [0.5, 1.5, 2.5, 3.5].map((b) => [46, b, 0.4, 88] as Note);
    const track: Track = { id: "openhat", name: "Open Hat", role: "openhat", volume: -9, duck: true, loopBeats: 4, notes, fx: { pan: -0.1 } };
    const grooves = s.sections.filter((x) => /groove|verse/i.test(x.name)).map((x) => x.id);
    return [{ op: "addTrack", track }, ...[...grooves, ...drops].map((sec) => ({ op: "active" as const, section: sec, add: ["openhat"] }))];
  }
  return [];
}
