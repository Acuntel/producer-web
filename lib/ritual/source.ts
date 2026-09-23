// The first law: decide the grid before a sound. A named record's tempo and key, with how sure the studio
// is of each. The numbers come from what the studio already knows (the records its own ears have heard,
// then the measured catalog); the confidences are priors for those sources, lowered when the tempo sits
// an octave away from where its family lives, and they are said out loud when they are low.
export type SourceHit = { found: true; name: string; bpm: number; key?: string; tempoConfidence: number; keyConfidence?: number; from: "heard" | "store" | "ears"; alt: number | null; family?: string | null };
export type SourceMiss = { found: false; name: string };

export const LOW_CONFIDENCE = 0.6;
// Priors: a whole-record tempo from one analyzer is usually right within an octave; a key read from a
// chroma profile is right about two times in three on pop and dance records.
export const TEMPO_PRIOR = 0.75, KEY_PRIOR = 0.65, OCTAVE_DOUBT = 0.45;

// Where each dance family's records actually live. A tempo outside the band whose double or half is inside
// it is the classic octave error; families with no tight band (pop, hip hop, rock) are not second guessed.
const HOME: Record<string, [number, number]> = { house: [112, 136], techno: [118, 155], trance: [122, 145], garage: [122, 140], dnb: [158, 182], dubstep: [132, 152], hardstyle: [138, 162], disco: [100, 136] };

/** The worker's tempo confidence is its autocorrelation peak, not a probability. On the fourteen DJ-tagged records
 *  in tests/fixtures every read that was not folded and not refused was right (worker/tempo_check.py), so such a
 *  read counts as sure; a folded octave is a genre guess and carries the octave doubt; a refused read, or one from
 *  before the worker reported a confidence, is unsure. */
export function earsConfidence(raw?: number | null, alt?: number | null, refused?: boolean): number {
  if (refused) return 0.3;
  if (typeof raw !== "number") return 0.5;
  if (alt) return OCTAVE_DOUBT;
  return Math.round(Math.min(0.9, 0.6 + raw * 0.4) * 100) / 100;
}

/** "Summer by Calvin Harris", "Calvin Harris - Summer", "the song Summer": an artist when one was said, and the title. */
export function parseRecordName(raw: string): { artist: string | null; title: string } {
  const t = raw.replace(/["“”]/g, "").replace(/^(?:the\s+)?(?:song|record|track|tune)\s+/i, "").replace(/[.?!]+$/, "").trim();
  const dash = t.match(/^(.+?)\s+[-–:]\s+(.+)$/);
  if (dash) return { artist: dash[1].trim(), title: dash[2].trim() };
  const by = t.match(/^(.+)\s+by\s+(.+)$/i);
  if (by) return { artist: by[2].trim(), title: by[1].trim() };
  return { artist: null, title: t };
}

/** A stored tempo as a producer says it (whole beats), with its confidence and the other octave when in doubt. */
export function tempoPrior(tempo: number, family: string | null | undefined, prior = TEMPO_PRIOR): { bpm: number; confidence: number; alt: number | null } {
  const bpm = Math.round(tempo);
  const band = family ? HOME[family] : undefined;
  if (!band || (bpm >= band[0] && bpm <= band[1])) return { bpm, confidence: prior, alt: null };
  for (const other of [bpm * 2, Math.round(bpm / 2)]) if (other >= band[0] && other <= band[1]) return { bpm: other, confidence: OCTAVE_DOUBT, alt: bpm };
  return { bpm, confidence: prior * 0.8, alt: null };
}

const KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
export const keyNameOf = (pc: number | null | undefined, mode: string | null | undefined) => (typeof pc === "number" && pc >= 0 && pc < 12 ? `${KEYS[pc]} ${mode === "minor" ? "minor" : "major"}` : undefined);

const spoken = (key: string) => key.replace(/b\b/, " flat").replace(/#/, " sharp");

/** What the producer says when the grid is set: the numbers, and the doubt when there is doubt. Full sentences, no dashes. */
export function sourceLine(h: SourceHit): string {
  const what = h.name;
  const tempo = h.tempoConfidence < LOW_CONFIDENCE
    ? `I have ${what} at ${h.bpm}, but I am not sure of that${h.alt ? `. It could be ${h.alt}` : ""}. Say the tempo if you know it and I will move the grid.`
    : `${what} sits at ${h.bpm}. The grid is set.`;
  if (!h.key) return `${tempo} I do not have its key yet.`;
  const key = (h.keyConfidence ?? 0) < LOW_CONFIDENCE ? `The key reads as ${spoken(h.key)}, but I would not bet on it yet.` : `It is in ${spoken(h.key)}.`;
  return `${tempo} ${key}`;
}
