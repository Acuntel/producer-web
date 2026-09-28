// How the producer asks (masterprompt section 3): "Do you like this beat?" once, after the draft has played 16 to
// 32 bars; then one concrete offer drawn from what the draft is missing. Never more than one question in 30 s,
// never over Brady's words or the producer's own, and silence is not a no: a question nobody answers for 30 s
// closes, and the next one may come. Pure: time, bars and talking come in as numbers.
import type { Offer, OfferId } from "../song/drafting/gaps";
import type { Steer } from "../song/drafting/types";
import { steerFrom } from "../brain/route";

export const QUESTION_GAP_MS = 30_000;
/** The one clock every question in the room reads (this module, the patience watch in hooks/useRitual). */
export const askClock = { last: -Infinity };
export const mayAsk = (now: number) => now - askClock.last >= QUESTION_GAP_MS;
export const BEAT_LINE = "Do you like this beat?";
export type Ask = { kind: "beat" | "offer" | "verify"; line: string; at: number; draft: string | null; offers?: Offer[] };
export type QState = { lastAskAt: number; open: Ask | null; beatFor: string | null; offerFor: string | null };
export const initialQ = (): QState => ({ lastAskAt: -Infinity, open: null, beatFor: null, offerFor: null });

/** An open question closes after 30 s of silence (not a no); the state it leaves behind. */
export function expire(s: QState, now: number): QState {
  return s.open && now - s.open.at >= QUESTION_GAP_MS ? { ...s, open: null } : s;
}
const free = (s: QState, now: number, talking: boolean) => !talking && !s.open && now - s.lastAskAt >= QUESTION_GAP_MS;

/** What to ask now, if anything, for the draft `draft` that has played `bars` bars. */
export function nextAsk(s0: QState, draft: string | null, bars: number, now: number, talking: boolean, offers: () => Offer[]): { state: QState; ask: Ask | null } {
  const s = expire(s0, now);
  if (!draft || !free(s, now, talking)) return { state: s, ask: null };
  if (s.beatFor !== draft) {
    if (bars < 16) return { state: s, ask: null };
    if (bars > 32) return { state: { ...s, beatFor: draft }, ask: null };   // the moment passed while someone was talking: never ask late
    const ask: Ask = { kind: "beat", line: BEAT_LINE, at: now, draft };
    return { state: { ...s, open: ask, lastAskAt: now, beatFor: draft }, ask };
  }
  if (s.offerFor !== draft) {
    const o = offers();
    if (!o.length) return { state: { ...s, offerFor: draft }, ask: null };
    const ask: Ask = { kind: "offer", line: "", at: now, draft, offers: o };
    return { state: { ...s, open: ask, lastAskAt: now, offerFor: draft }, ask };
  }
  return { state: s, ask: null };
}

/** An offer that is not about the draft (a verify that missed): asked when the room is free, the same 30 s rule. */
export function askOffer(s0: QState, line: string, now: number, talking: boolean): { state: QState; ask: Ask | null } {
  const s = expire(s0, now);
  if (!free(s, now, talking)) return { state: s, ask: null };
  const ask: Ask = { kind: "verify", line, at: now, draft: null };
  return { state: { ...s, open: ask, lastAskAt: now }, ask };
}

export type Answer = { verdict: "yes" | "no" | null; option: OfferId | null; steer: Steer | null };
const YES = /^(?:(?:oh |hell |yeah |yes )*(?:yes|yeah|yep|yup|ya|sure|ok|okay|definitely|absolutely)\b|(?:i )?(?:love|like) (?:it|that|this)|keep (?:it|that)|that'?s (?:it|the one|hard|fire|sick)|(?:it'?s |that'?s )?(?:fire|hard|sick|dope|sounds good)|do it|go for it|let'?s go)/;
const NO = /^(?:no|nah|nope|not really|not (?:it|that|feeling it)|(?:i )?(?:don'?t|do not) (?:like|love)|hate it|next(?: one)?|another(?: one)?|skip|meh|try again|change it)\b/;
const OPTION: [RegExp, OfferId][] = [[/\b(?:vocal|voice|singer|singing)\b/, "vocal"], [/\b(?:roll|snare)\b/, "roll"], [/\b(?:lead|high)\b/, "lead"], [/\barp\b/, "arp"], [/\bopen ?hats?\b/, "openhat"]];

/** Brady's words, read against the open question. Null when they are not an answer to it. */
export function readAnswer(words: string, open: Ask | null): Answer | null {
  if (!open) return null;
  const t = words.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const option = open.kind === "offer" ? OPTION.find(([re]) => re.test(t))?.[1] ?? null : null;
  const offered = option && open.offers?.some((o) => o.id === option) ? option : null;
  const verdict = YES.test(t) ? "yes" : NO.test(t) ? "no" : null;
  const steer = open.kind === "beat" ? steerFrom(t) : null;
  if (!verdict && !offered && !steer) return null;
  return { verdict: steer && !verdict ? "no" : verdict, option: offered, steer };
}
