// Where an utterance goes, decided in code on Brady's own words (masterprompt section 4): a draft ("make a song
// like X", "new song", "surprise me"), the next take of the draft, a voice off a record ("pull the voice from X"),
// a take of his own ("record me"), a named refine ("make the drums hit harder", "rebuild the drop"), a small op
// (lib/brain/local.ts), a question, or none of these (the Voice lane answers). Never a regex over a model's words.
import type { Song } from "../song/types";
import { laneAsk, rolloutIntent, localIntent } from "./local";
import { laneInfo } from "./laneNames";
import { seedOf } from "../song/ritual";

export type RefineStep = "drums" | "bass" | "harmony" | "hook" | "craft" | "mix" | "finish" | "fixSection";
export type Route =
  | { kind: "draft"; name: string | null; surprise?: boolean }
  | { kind: "next"; reason: string | null }
  | { kind: "voice"; from: string | null; what: string | null; where: string | null }
  | { kind: "take"; what: "record" | "said" }
  | { kind: "refine"; step: RefineStep; section?: string }
  | { kind: "small" }
  | { kind: "question" }
  | { kind: "none" };

const clean = (t: string) => t.toLowerCase().replace(/[“”"]/g, "").replace(/[^a-z0-9#\s.'&-]/g, " ").replace(/\s+/g, " ").replace(/[.]+$/, "").trim();
const LEAD = String.raw`^(?:(?:ok|okay|alright|yo|hey|so|now|please|can you|could you|would you|let'?s|lets|i want you to|i want to|go)\s+)*`;
const MAKE = String.raw`(?:make|build|do|give|write|produce|cook up|start|whip up|throw together|draft)`;
const THING = String.raw`(?:a |an |some |another |the |one more )?(?:new |fresh |quick |first )?(?:song|track|record|beat|tune|banger|one|something|draft)`;
const LIKE = String.raw`(?:like|in the style of|that sounds like|sounding like|inspired by|similar to|off of|based on|from|in the lane of|kind of like)`;
const DRAFT_LIKE = new RegExp(`${LEAD}${MAKE} (?:me |us )?${THING} ${LIKE} (.+)$`);
const STYLE_OF = new RegExp(`${LEAD}(?:something |a song |a track |a beat )?(?:in the style of|like) (.+?)(?: please)?$`);
const TYPE_BEAT = new RegExp(`${LEAD}(?:${MAKE} (?:me |us )?(?:a |an |some )?)?(.+?) (?:type beat|style (?:song|track|beat|record))$`);
const A_X_RECORD = new RegExp(`${LEAD}${MAKE} (?:me |us )?(?:a |an |some |another )(?:new |fresh )?(.+?) (?:record|song|track|tune|banger|beat|joint|edit)$`);
const BLANK = new RegExp(`${LEAD}(?:${MAKE} (?:me |us )?${THING}|new (?:song|track|record|one)|start (?:something |a )?(?:new|fresh)(?: one| song| track| record)?|start over|fresh start)(?: please)?$`);
const SURPRISE = /^(?:(?:ok|okay|just|go ahead and|go on)\s+)*surprise me(?: please)?$/;
const NEXT = /^(?:(?:ok|okay|alright|nah|no|nope|hmm)\s+)*(?:next(?: one)?|another one|try another(?: one)?|give me another(?: one)?|go again|different one|new seed|roll again|again but different|something else)(?: please)?$/;
const ROLES = /\b(kick|clap|snare|hats?|hi hats?|open hats?|perc|percussion|bass|sub|chords?|stabs?|pads?|lead|pluck|arp|drums?|roll|fill|riser|fx)\b/;
const VOICE_VERB = /\b(?:isolate|pull|take|grab|lift|steal|get|rip|extract|sample|chop|find)\b/;
const VOICE_WORD = /\b(?:vocal|vocals|voice|acapella|a cappella|singer|singing)\b/;
const FROM = /\b(?:from|off|out of) (?:the (?:song|record|track|tune) )?(.+?)(?: (?:and|then|so) .*)?$/;
const FIND = /\b(?:go find|find|look up|pull up|go get) (?:the (?:song|record|track) )?(.+?)(?: and | then | (?:pull|take|grab|isolate|get|rip|extract|lift)\b|$)/;
const WHERE = /\b(?:put|drop|place|land|use) (?:it|that|them) (.+)$/;
const PUT_IN = /^(?:put|drop|add|throw|bring|sample) (.+?) (?:in|into|on|over|under) (?:it|this|the (?:song|track|beat|record|drop))(?: (.+))?$/;
const TAKE_SAID = /\b(?:put|use|drop|keep|sample) what i (?:just )?(?:said|sang|did)\b/;
const TAKE_REC = /^(?:(?:ok|okay|alright)\s+)*(?:record me|let me (?:sing|record|lay (?:it|something|a vocal) down|do a take)|i(?:'ll| will| wanna| want to) (?:sing|record)(?: (?:it|something|a take))?|record (?:a |my )?(?:take|voice|vocal))\b/;
const QUESTION = /^(?:what|how|why|who|which|when|where|is|are|does|do|did|can you tell|should|would|could it|was)\b/;
const REFINES: [RegExp, RefineStep][] = [
  [/\b(?:drums?|kick|beat|groove)\b.*\b(?:hit harder|harder|punchier|bigger|fatter|slap|knock|better)\b|\bmake the drums\b/, "drums"],
  [/\b(?:bass|bassline|low end|sub)\b.*\b(?:rework|rewrite|better|heavier|fatter|redo|new|different)\b|\b(?:rework|redo|rewrite|new) (?:the )?(?:bass|bassline)\b/, "bass"],
  [/\b(?:chords?|harmony|progression|pads?)\b.*\b(?:rework|change|better|redo|new|different|sadder|happier)\b|\b(?:rework|redo|change|new) (?:the )?(?:chords?|harmony|progression)\b/, "harmony"],
  [/\b(?:hook|melody|lead|topline)\b.*\b(?:rework|change|better|redo|new|catchier|different)\b|\b(?:rework|redo|change|new|write a) (?:the )?(?:hook|melody|lead)\b/, "hook"],
  [/\b(?:arrangement|transitions?|fills?|builds?)\b.*\b(?:better|rework|fix|smoother|bigger)\b/, "craft"],
  [/^(?:mix it|master it|fix the mix|balance (?:it|the mix)|clean up the mix|mix(?:down)? (?:it|this))\b/, "mix"],
];

function nameOf(raw: string): string {
  return raw.replace(/^(?:the |a |an )?(?:song |record |track |tune )/, "").replace(/\b(?:please|for me|right now|real quick|tonight)\b/g, "").replace(/\s+/g, " ").trim();
}

export function route(text: string, song: Song): Route {
  const t = clean(text); if (!t) return { kind: "none" };
  if (TAKE_SAID.test(t)) return { kind: "take", what: "said" };
  if (TAKE_REC.test(t)) return { kind: "take", what: "record" };
  if (VOICE_VERB.test(t) && VOICE_WORD.test(t)) {
    // "isolate the vocal from X", "go find X, pull just the voice". A bare "isolate the vocals" with no record named is a solo.
    const from = FROM.exec(t)?.[1] ?? FIND.exec(t)?.[1] ?? null;
    const named = from && !VOICE_WORD.test(from) ? nameOf(from) : null;
    if (named || !/^(?:solo|isolate|just|only)\b/.test(t)) return { kind: "voice", from: named, what: null, where: WHERE.exec(t)?.[1]?.trim() ?? null };
  }
  const p = PUT_IN.exec(t);
  if (p && !ROLES.test(p[1]) && !/^(?:a|an|some|more|that|this|it|the (?:vocal|voice))\b/.test(p[1])) return { kind: "voice", from: nameOf(p[1]), what: null, where: p[2]?.trim() ?? null };
  // On a drafted record with no chop seed, "next one" is the next take of the draft (a chop seed keeps the ritual's next).
  if (NEXT.test(t) && song.draft && !seedOf(song)) return { kind: "next", reason: null };
  if (SURPRISE.test(t)) return { kind: "draft", name: null, surprise: true };
  const like = DRAFT_LIKE.exec(t) ?? STYLE_OF.exec(t) ?? TYPE_BEAT.exec(t);
  if (like && !/^(?:that|this|it|the last one|before)$/.test(like[1])) return { kind: "draft", name: nameOf(like[1]) };
  const rec = A_X_RECORD.exec(t);
  if (rec && !/^(?:new|fresh|good|nice|better|different|whole|full)$/.test(rec[1])) return { kind: "draft", name: nameOf(rec[1]) };
  const lane = laneAsk(t);
  if (lane) return { kind: "draft", name: laneInfo(lane)?.name ?? lane };
  if (BLANK.test(t)) return { kind: "draft", name: null };
  const ro = rolloutIntent(t, false);
  if (ro?.kind === "finish") return { kind: "refine", step: "finish" };
  if (ro?.kind === "fixSection") return { kind: "refine", step: "fixSection", section: ro.section };
  if (localIntent(t, song)) return { kind: "small" };
  for (const [re, step] of REFINES) if (re.test(t)) return { kind: "refine", step };
  if (t.endsWith("?") || QUESTION.test(t)) return { kind: "question" };
  return { kind: "none" };
}

/** A reason given against a draft, as a steer for the next seed: "too busy", "darker", "more energy". */
export function steerFrom(words: string): { busy?: number; dark?: number; energy?: number } | null {
  const t = clean(words); const s: { busy?: number; dark?: number; energy?: number } = {};
  if (/\b(too busy|too much going on|cluttered|simpler|less busy|too many|stripped)\b/.test(t)) s.busy = -1;
  if (/\b(too empty|too sparse|too simple|more going on|busier|fuller|thin)\b/.test(t)) s.busy = 1;
  if (/\b(darker|too happy|too bright|moodier|sadder|more minor|grittier)\b/.test(t)) s.dark = 1;
  if (/\b(brighter|too dark|happier|uplifting|more major|lighter)\b/.test(t)) s.dark = -1;
  if (/\b(more energy|harder|faster|bigger|hype|too slow|too chill)\b/.test(t)) s.energy = 1;
  if (/\b(chill|slower|calmer|too fast|too hard|softer|laid back)\b/.test(t)) s.energy = -1;
  return Object.keys(s).length ? s : null;
}
