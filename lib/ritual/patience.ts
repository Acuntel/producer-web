// Patience, measured from a person (docs/MASTERPROMPT_SMOOTH.md section 1). A new element is judged in
// one spoken line inside thirty seconds, and three passes of a loop with no verdict means the idea is
// wrong, not unfinished. Nothing here touches the browser: time and the loop count come in as numbers.
//
// A pass is one trip of the transport around its loop region, counted from Tone's "loop" event
// (lib/ritual/passes.ts), never from the wall clock, so a paused record makes no passes. The trip the
// element landed in counts only when it landed in the first half of it: a pass always means the element
// was heard for at least half the loop. An idea is only dead once its thirty seconds are over too, so a
// two bar loop that goes round three times in eleven seconds still gets its whole window to be judged.
import type { VerdictWindow } from "../taste";

export const VERDICT_WINDOW_MS = 30_000;
export const PROMPT_FLOOR_MS = 8_000;    // never ask before the element has had a moment in the room
export const PROMPT_CAP_MS = 20_000;     // always ask inside the window, so the answer can still land in it
export const DEAD_PASSES = 3;

export type Watch = {
  moveId: string | null; element: string;
  landedAt: number; loopsAt: number; landedFraction: number;
  saidAt: number | null; words: string | null; verdict: "liked" | "rejected" | null;
  promptedAt: number | null; swapAt: number | null;
  closed: boolean;   // its window is on the move in the ledger
};

export const watchFor = (element: string, moveId: string | null, now: number, loops: number, fraction: number): Watch =>
  ({ moveId, element, landedAt: now, loopsAt: loops, landedFraction: Math.max(0, Math.min(1, fraction || 0)), saidAt: null, words: null, verdict: null, promptedAt: null, swapAt: null, closed: false });

export const passesSince = (w: Watch, loops: number) => Math.max(0, loops - w.loopsAt - (w.landedFraction > 0.5 ? 1 : 0));
export const inWindow = (w: Watch, now: number) => now - w.landedAt <= VERDICT_WINDOW_MS;

/** What the producer owes the room right now: a verdict prompt, a swap offer, or nothing. */
export function due(w: Watch, now: number, loops: number): "prompt" | "swap" | null {
  if (w.verdict || w.swapAt !== null) return null;
  const passes = passesSince(w, loops), age = now - w.landedAt;
  if (w.swapAt === null && passes >= DEAD_PASSES && age >= VERDICT_WINDOW_MS) return "swap";
  if (w.promptedAt === null && w.saidAt === null && age < VERDICT_WINDOW_MS && ((passes >= 1 && age >= PROMPT_FLOOR_MS) || age >= PROMPT_CAP_MS)) return "prompt";
  return null;
}

/** Words said over the element. Inside the window the first words and the first verdict are kept; after it they
 *  judge nothing, because a line said a minute later is about something else. */
export function hearWords(w: Watch, words: string, verdict: "liked" | "rejected" | null, now: number): Watch {
  if (!inWindow(w, now) || w.verdict) return w;
  if (verdict) return { ...w, saidAt: now, words, verdict };
  return w.saidAt === null ? { ...w, saidAt: now, words } : w;
}

/** The window as the ledger keeps it. */
export const windowOf = (w: Watch, closedBy: VerdictWindow["closedBy"]): VerdictWindow =>
  ({ landedAt: w.landedAt, windowMs: VERDICT_WINDOW_MS, saidAt: w.saidAt, words: w.words, verdict: w.verdict ?? "none", closedBy });

// What a tick of the watch asks of the ledger: a window to put on the move, or the move marked dead.
export type Judgement = { id: string; window: VerdictWindow } | { id: string; dead: number };

/** One tick of the watch. A window with no verdict closes at thirty seconds as "none"; after three passes and a
 *  closed window the idea is dead and a swap is offered; a prompt is due at the first pass. While the producer is
 *  talking (or a move is in flight) nothing is said, except a prompt that has reached its cap. */
export function step(w: Watch, now: number, loops: number, talking = false): { watch: Watch; say: string | null; judge: Judgement | null; what: "prompt" | "swap" | "close" | null } {
  if (!w.closed && !w.verdict && now - w.landedAt >= VERDICT_WINDOW_MS) {
    const watch = { ...w, closed: true };
    return { watch, say: null, judge: w.moveId ? { id: w.moveId, window: windowOf(w, "time") } : null, what: "close" };
  }
  const what = due(w, now, loops);
  if (!what || (talking && !(what === "prompt" && now - w.landedAt >= PROMPT_CAP_MS))) return { watch: w, say: null, judge: null, what: null };
  if (what === "prompt") return { watch: { ...w, promptedAt: now }, say: promptLine(w.element), judge: null, what };
  return { watch: { ...w, swapAt: now }, say: SWAP_LINE, judge: w.moveId ? { id: w.moveId, dead: passesSince(w, loops) } : null, what };
}

/** A verdict said inside the window goes on the move at once; a newer move landing closes an open window early. */
export const judged = (before: Watch, after: Watch): Judgement | null =>
  !before.verdict && after.verdict && after.moveId ? { id: after.moveId, window: windowOf(after, "verdict") } : null;
export const superseded = (w: Watch | null): Judgement | null =>
  w && w.moveId && !w.closed && !w.verdict ? { id: w.moveId, window: windowOf(w, "next move") } : null;

const PROMPTS: Record<string, string> = {
  chop: "That is the chop. Can you sing it back? One line tells me if it stays.",
  beat: "Drums and bass are under it now. One line, in or out, or what record does it remind you of?",
  next: "That is the next one. In or out?",
};
export const promptLine = (element: string) => PROMPTS[element] ?? "What do we think? One line is enough.";
export const SWAP_LINE = "Three times round and no verdict, so that one is not it. Say next one and I will swap it.";
