// A voice's phrases, ready to place: from the worker's vocal map (words on the voice's own onsets, the stressed
// syllable, notes, the hook), or, when a record has no map, from the phrases the browser finds in the audio itself.
// Every cut sits in the gap between words, never mid-word. Tone-free and browser-free.
import type { VocalMap, VocalPhrase } from "../vocalMap";
import type { Phrase } from "../vocal";
import type { PlacePhrase, PhraseRole, VoiceSource } from "./types";

const MAX_CUT = 8;   // seconds: the longest line a placement carries whole (lib/engine/slice.ts caps a cut at 8 s)
const TAIL = 0.08;   // a sung word's release after the envelope closes

function roleOf(p: { id: number; hookScore: number; repeats: number; words: number; len: number }, hook: number | null): PhraseRole {
  if (p.id === hook || (p.repeats >= 3 && p.hookScore >= 0.5)) return "hook";
  if (p.words === 0 && p.len < 1.6) return "adlib";
  if (p.len <= 1.8 || (p.words > 0 && p.words <= 3)) return "tag";
  return "verse";
}

function chromaOf(notes: { start: number; end: number; midi: number }[]): number[] | null {
  if (!notes.length) return null;
  const c = new Array(12).fill(0);
  for (const n of notes) c[((Math.round(n.midi) % 12) + 12) % 12] += Math.max(0.01, n.end - n.start);
  return c;
}

/** The cut of a phrase: whole when it fits, else the loudest window with each edge moved into a gap between words. */
export function cutOf(p: Pick<VocalPhrase, "start" | "end" | "loudest">, onsets: number[], nextStart: number | null): [number, number] {
  const limit = nextStart !== null ? Math.max(p.end, nextStart - 0.02) : p.end + TAIL;
  const end = Math.min(p.end + TAIL, limit);
  if (end - p.start <= MAX_CUT) return [Math.max(0, p.start - 0.02), end];
  const [la, lb] = p.loudest;
  // Start on the onset at or before the window (a word begins there), end just before the first onset after it.
  const before = onsets.filter((t) => t <= la + 0.05 && t >= p.start);
  const a = before.length ? before[before.length - 1] - 0.02 : la;
  const after = onsets.find((t) => t >= lb - 0.05 && t > a + 0.5);
  const b = after !== undefined ? after - 0.03 : Math.min(end, lb);
  return [Math.max(p.start - 0.02, a), Math.max(a + 0.35, Math.min(b, a + MAX_CUT))];
}

/** A record's voice from its vocal map. `bpm` and `key` are the record's own when the map lacks them. */
export function voiceFromMap(map: VocalMap, o: { name: string; clipKey: string; bpm?: number; key?: string | null; family?: string | null; kind?: "record" | "take" }): VoiceSource {
  const ps = [...map.phrases].sort((a, b) => a.start - b.start);
  const phrases: PlacePhrase[] = ps.map((p, i) => {
    const onsets = p.words.map((w) => w.start).filter((t) => t >= p.start - 0.05 && t <= p.end).sort((a, b) => a - b);
    const cut = cutOf(p, onsets, ps[i + 1]?.start ?? null);
    const inCut = (t: number) => t >= cut[0] && t < cut[1];
    const stress = inCut(p.stressOnset) ? p.stressOnset : onsets.find(inCut) ?? cut[0] + 0.02;
    const lastWord = onsets.filter(inCut).pop() ?? null;
    return {
      id: p.id, start: p.start, end: p.end, cut, stress, lastWord, text: p.text, onsets: onsets.filter(inCut),
      role: roleOf({ id: p.id, hookScore: p.hookScore, repeats: p.repeats, words: p.words.length, len: p.end - p.start }, map.hook),
      hookScore: p.hookScore, repeats: p.repeats, rmsDb: p.rmsDb, chroma: chromaOf(p.notes), midis: p.notes.map((n) => Math.round(n.midi)),
      section: p.section, order: i,
    };
  });
  return { name: o.name, clipKey: o.clipKey, bpm: map.source.bpm ?? o.bpm ?? 60 / map.source.beatSec, key: map.source.key ?? o.key ?? null, family: o.family ?? null, phrases, hook: map.hook, kind: o.kind ?? "record" };
}

/** A voice with no map: the browser's own phrases (loudness and length only, no words, no notes). The anchor is
 *  the phrase's first onset, which is where the voice opens. */
export function voiceFromPhrases(found: Phrase[], o: { name: string; clipKey: string; bpm: number; key: string | null; family?: string | null; kind?: "record" | "take"; midis?: (p: Phrase) => number[] }): VoiceSource {
  const ranked = [...found].sort((a, b) => b.score - a.score);
  const hookAt = ranked[0]?.startSec ?? null;
  const phrases: PlacePhrase[] = found.map((p, i) => {
    const len = p.endSec - p.startSec;
    const midis = o.midis?.(p) ?? [];
    const chroma = midis.length ? (() => { const c = new Array(12).fill(0); for (const m of midis) c[((m % 12) + 12) % 12] += 1; return c; })() : null;
    return {
      id: i, start: p.startSec, end: p.endSec, cut: [Math.max(0, p.startSec - 0.02), p.endSec + Math.min(TAIL, Math.max(0, (found[i + 1]?.startSec ?? Infinity) - p.endSec - 0.02))],
      stress: p.startSec + 0.02, lastWord: null, text: "", onsets: [p.startSec + 0.02],
      role: p.startSec === hookAt ? "hook" : len <= 1.8 ? "tag" : "verse",
      hookScore: p.score, repeats: 1, rmsDb: p.rmsDb, chroma, midis, section: null, order: i,
    };
  });
  const hook = phrases.find((p) => p.role === "hook")?.id ?? null;
  return { name: o.name, clipKey: o.clipKey, bpm: o.bpm, key: o.key, family: o.family ?? null, phrases, hook, kind: o.kind ?? "record" };
}
