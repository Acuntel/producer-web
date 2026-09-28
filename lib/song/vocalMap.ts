// The vocal map: what the worker understood about one record's voice, as numbers only (docs/VOCAL_MAP.md).
// The worker writes it beside the stems (worker/vocalmap.py); the browser reads it to pick, fit and place a line.
// Every time is in seconds on the SOURCE record's timeline; every bar and beat is on the source's own grid.
//
// Nothing here touches the browser or Tone: it is types and arithmetic, so it can be tested.

export type SectionLabel = "intro" | "verse" | "chorus" | "build" | "drop" | "break" | "outro";

export type VocalWord = { w: string; start: number; end: number; p: number };
export type VocalNote = { start: number; end: number; midi: number };

export type VocalPhrase = {
  id: number;
  start: number;
  end: number;
  /** The loudest window of at most 6 s inside the phrase: where a capped cut goes. */
  loudest: [number, number];
  text: string;
  words: VocalWord[];
  notes: VocalNote[];
  /** Semitones (-5 to +6) that best fit the phrase to the record's scale; 0 means it sings in the record's key. */
  keyRelToSource: number | null;
  /** Share of the sung time inside the record's scale, 0 to 1. */
  inKey: number | null;
  section: SectionLabel | null;
  /** How many times the line occurs in the record, itself included: by its words, or by its melody when wordless. */
  repeats: number;
  repeatsWords: number;
  repeatsMelody: number;
  /** 0 to 1: lyric repetition 0.45, melodic self-similarity 0.30, prominence 0.25. */
  hookScore: number;
  /** Where the phrase starts on the source grid: bar from 0 at the first downbeat (negative before it), beat 0 to 4. */
  sourceBar: number;
  sourceBeat: number;
  /** Beats from the phrase start to the stressed syllable it anchors on (the pickup before the one). */
  pickupBeats: number;
  /** Seconds: the stressed syllable, taken from the voice's own onsets, never from the word times. */
  stressOnset: number;
  rmsDb: number;
  peakDb: number;
};

export type VocalSection = { label: SectionLabel; startBar: number; endBar: number; start: number; end: number; energy: number; low: number };

export type VocalMap = {
  version: 1;
  source: { name: string | null; bpm: number | null; key: string | null; durationSec: number | null; grid: "beat_this" | "tempo"; beatSec: number; downbeats: number[] };
  words: { model: string | null; language: string | null; count: number; error?: string | null };
  melody: { model: "rmvpe" | "pyin" };
  sections: VocalSection[];
  /** The id of the phrase with the top hook score, or null when the vocal held no phrase. */
  hook: number | null;
  phrases: VocalPhrase[];
  timing?: Record<string, number>;
};

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** A map from the worker, checked: null when it is not one (an old job, a failed pass, another version). */
export function parseVocalMap(raw: unknown): VocalMap | null {
  const m = raw as VocalMap | null;
  if (!m || typeof m !== "object" || m.version !== 1 || !Array.isArray(m.phrases) || !m.source) return null;
  if (!isNum(m.source.beatSec) || m.source.beatSec <= 0) return null;
  const ok = m.phrases.every((p) => isNum(p.start) && isNum(p.end) && p.end > p.start && isNum(p.hookScore) && isNum(p.stressOnset) && Array.isArray(p.words) && Array.isArray(p.notes));
  return ok ? m : null;
}

/** The hook phrase, or the nth best by hook score. */
export function hookPhrase(map: VocalMap, nth = 0): VocalPhrase | null {
  if (nth === 0 && map.hook !== null) return map.phrases.find((p) => p.id === map.hook) ?? null;
  const ranked = [...map.phrases].sort((a, b) => b.hookScore - a.hookScore || a.start - b.start);
  return ranked[Math.min(ranked.length - 1, Math.max(0, nth))] ?? null;
}

/** Every phrase that sings the same line as this one (its words, else its melody), in source order. */
export function repeatsOf(map: VocalMap, phrase: VocalPhrase): VocalPhrase[] {
  const words = (p: VocalPhrase) => p.text.toLowerCase().replace(/[^a-z0-9 ]+/g, "").split(/\s+/).filter(Boolean);
  const mine = words(phrase);
  if (mine.length < 2) return [phrase];
  return map.phrases.filter((p) => {
    const theirs = words(p);
    if (theirs.length < 2) return false;
    const shared = mine.filter((w) => theirs.includes(w)).length;
    return shared / Math.max(mine.length, theirs.length) >= 0.6;
  }).sort((a, b) => a.start - b.start);
}

/** The phrase that holds a quoted piece of lyric, by its words; null when no phrase sings it. */
export function phraseSaying(map: VocalMap, said: string): VocalPhrase | null {
  const want = said.toLowerCase().replace(/[^a-z0-9 ]+/g, "").split(/\s+/).filter(Boolean);
  if (!want.length) return null;
  let best: VocalPhrase | null = null, bestHit = 0;
  for (const p of map.phrases) {
    const have = p.text.toLowerCase().replace(/[^a-z0-9 ]+/g, "").split(/\s+/);
    const hit = want.filter((w) => have.includes(w)).length / want.length;
    if (hit > bestHit || (hit === bestHit && best && p.hookScore > best.hookScore)) { best = p; bestHit = hit; }
  }
  return bestHit >= 0.6 ? best : null;
}

/** Seconds from a phrase's start to its anchor, and the anchor's place on the source grid in beats. */
export function anchorOf(p: VocalPhrase): { leadSec: number; pickupBeats: number } {
  return { leadSec: Math.max(0, p.stressOnset - p.start), pickupBeats: p.pickupBeats };
}

/** The section of the source record at a time. */
export function sectionAt(map: VocalMap, t: number): VocalSection | null {
  return map.sections.find((s) => s.start <= t && t < s.end) ?? null;
}
