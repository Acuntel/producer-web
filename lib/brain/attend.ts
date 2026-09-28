// Attention: was that sentence for the producer? The mic hears the room; the
// producer should act only on speech meant for it. Three layers: a wake word
// that always gets through, a quick gate for obvious fillers and clear studio
// commands, and a small classifier for the rest that knows whether the music is
// paused (paused = the room is talking, not the user).
import { economyQuery } from "./stream";
export type Attention = "send" | "ignore" | "ask";
export type Intent = "command" | "talk" | "ignore";

export const WAKE = /^(?:hey|yo|ok|okay|alright|hi|so)?[,\s]*(?:the\s+)?(?:producer|studio)\b[,:!]?\s*/i;
export function stripWake(text: string): { text: string; woke: boolean } {
  const m = WAKE.exec(text.trim());
  if (!m) return { text: text.trim(), woke: false };
  return { text: text.trim().slice(m[0].length).trim(), woke: true };
}

const FILLER = /^(?:um+|uh+|hmm+|mm+|hm+|yeah|yep|yes|no|nah|nope|okay|ok|cool|nice|sick|fire|wow|damn|bro|dude|man|lol|haha|what|huh|wait|hold on|right|sure|alright|oh|ah|ooh|oof|yo|hey|hello|hi|see|look|like|so|and|but|the)(?:\s+(?:yeah|no|okay|ok|man|bro|dude|then|now))?[.!?,]*$/i;
const REACTION = /^(?:yeah|yes|no|nah|nope|nice|sick|fire|love (?:it|that)|hate (?:it|that)|keep (?:it|that)|lose (?:it|that)|better|worse|perfect|that's it|not that|cool|meh)[.!?,]*$/i;
const MUSIC = /\b(?:kick|drum|drums|beat|hat|hats|snare|clap|perc|bass|sub|synth|pad|chord|chords|stab|lead|melody|hook|vocal|vocals|sample|loop|drop|build|breakdown|intro|outro|section|bar|bars|bpm|tempo|key|swing|groove|mix|master|reverb|delay|filter|louder|quieter|softer|darker|brighter|harder|heavier|faster|slower|deeper|wider|bigger|tighter|track|song|record|tune|producer|studio|play|pause|stop|resume|undo|redo|solo|mute|analy[sz]e|slice|chop|stem|version|a or b|keep a|keep b)\b/i;
const IMPERATIVE = /^(?:make|add|remove|take|put|give|drop|bring|turn|pull|push|cut|kill|mute|solo|loop|play|pause|stop|go|jump|change|swap|switch|try|do|let'?s|can you|could you|would you|i want|i need|i'?d like|we need|more|less|less of|no more|start|build|write|finish|rebuild|redo|undo|analy[sz]e|grab|pull|slice|chop|use|open|load|save|new song|surprise me)\b/i;
const QUESTION_TO_PRODUCER = /\b(?:what (?:key|tempo|bpm|is this|are we|did you)|how (?:many|fast|loud|do you|did you)|why (?:is|did|does)|can (?:we|you|it)|is (?:this|that|the))\b/i;

/** The quick verdict: no network. "ask" hands the sentence to the classifier. */
export function quickGate(text: string, ctx: { paused: boolean; recentMove: boolean }): Attention {
  const t = text.trim();
  if (!t) return "ignore";
  const words = t.split(/\s+/).length;
  if (FILLER.test(t)) return ctx.recentMove && REACTION.test(t) ? "send" : "ignore";   // "nice" right after a move is a verdict; alone it is nothing
  if (REACTION.test(t)) return ctx.recentMove ? "send" : "ignore";
  if (IMPERATIVE.test(t) && MUSIC.test(t)) return "send";
  if (IMPERATIVE.test(t) && words <= 6) return "send";
  if (QUESTION_TO_PRODUCER.test(t) && MUSIC.test(t)) return "send";
  if (words <= 2 && !MUSIC.test(t)) return "ignore";
  // Paused means the room is talking unless they clearly speak to the studio.
  if (ctx.paused && !MUSIC.test(t)) return "ignore";
  if (!MUSIC.test(t) && words >= 14) return "ignore";   // long sentences with no studio words are the room
  return "ask";
}

export async function classify(text: string, ctx: { paused: boolean; lastProducer: string; lastAsk: string; section: string }): Promise<Intent> {
  try {
    const r = await fetch("/api/attend" + economyQuery(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, ...ctx }) });
    const j = (await r.json()) as { intent?: Intent };
    return j.intent === "ignore" || j.intent === "talk" || j.intent === "command" ? j.intent : "command";
  } catch { return "command"; }   // fail open: never drop a request because the classifier hiccuped
}
