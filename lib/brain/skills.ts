// Skills: focused producer knowledge the server injects per exchange when the
// user's words call for it. They ride in the user block, never in the cached
// system prefix, so the prompt cache survives and the brain stays lean.
import { SKILLS_DATA } from "./skills-data";

export type SkillId = keyof typeof SKILLS_DATA | string;

const TRIGGERS: { id: string; re: RegExp }[] = [
  { id: "hits", re: /\b(hit|hits|viral|radio|chart|charts|charted|number one|number ones|no\.? ?1|popular|banger|bangers|famous|top 100|top 40|billboard|what works|why (do|does) (hits|songs|it) work|make it (a hit|pop|catchy)|catchy|earworm)\b/i },
  { id: "discoveries", re: /\b(hit|hits|viral|chart|charted|number one|popular|banger|famous|what works|why (do|does) (hits|songs|it) work|what (did|have) you (find|found|learn)|pattern|patterns|data says|the numbers)\b/i },
  { id: "charts", re: /\b(chart|charts|charted|year[- ]end|number one|number ones|biggest|best of|top (10|ten|100|forty|40)|famous|viral|popular|hit of|hits of|(19[4-9]\d|20[0-2]\d)s?)\b/i },
  { id: "flow", re: /\b(flow|arrangement|arrange|structure|transition|transitions|build[- ]?up|breakdown|break down|the break|the build|the drop|drops?|segue|blend|mix (into|out of)|mash|mashup|energy (curve|arc)|smooth|smoother|how (does|should) (it|this|the record) (go|move|flow)|phrase|phrasing|turnaround|outro|intro)\b/i },
  { id: "math", re: /\b(math|maths|mathematic|pattern|patterns|euclid|euclidean|bjorklund|polyrhythm|polymeter|tresillo|clave|cinquillo|golden (ratio|section)|fibonacci|markov|probab|odds|what follows|transition|rotate|rotation|density|tuplet|triplet|algorithm|generate (a|the) (pattern|rhythm|progression)|formula)\b/i },
  { id: "dance-science", re: /\b(dance|danc(e|ing) ?floor|groove|groovy|bounce|bouncy|swing|pocket|feel|human|robotic|stiff|rigid|make (people|them|me) move|why does|science|syncopat|tempo feel|hits? harder|doesn'?t hit|body)\b/i },
  { id: "song-breakdown", re: /\b(break ?down|breakdown of|analy[sz]e|analysis|what makes|why does (this|it) work|dissect|study|reference|this song|that song|like (this|that) (song|track|record)|best (part|bit|piece|8 bars)|hook of|structure of|how (is|was) (this|it) made|emulate|sounds? like)\b/i },
  { id: "sampling-and-stems", re: /\b(sample|sampling|stem|stems|isolate|isolat(e|ed|ion)|separate|extract|pull (the|that|one)|take (the|that) (kick|drum|snare|hat|synth|vocal|bass)|one[- ]?shot|chop|youtube|link|url|acapella|a cappella|remix|flip|from (this|that) (song|track|record))\b/i },
  { id: "vocals", re: /\b(vocal|vocals|vox|voice|sing|singer|sung|lyric|lyrics|topline|top line|chant|chop|diva|acapella|a cappella|hook line|verse|chorus|rap)\b/i },
  { id: "genres", re: /\b(genre|genres|style of|what is (house|techno|garage|trance|dubstep|drum and bass|dnb|trap|afrobeats?|reggaeton|disco|pop|lo-?fi)|dubstep|drum and bass|dnb|hip[- ]?hop|trap|afrobeats?|reggaeton|disco|nu-?disco|lo-?fi|pop|r&b|ambient|breakbeat|edm|big room|future bass|phonk|amapiano|baile|funk|dembow|make it (more|less) [a-z-]+ ?(house|techno|garage|trance))\b/i },
];

const MAX_CHARS = 9000;

/** Which skills this utterance calls for (stable order, deduped). */
export function skillsFor(text: string, extra: string[] = []): string[] {
  const t = (text ?? "").toLowerCase();
  const ids = TRIGGERS.filter((k) => k.re.test(t)).map((k) => k.id);
  for (const e of extra) if (SKILLS_DATA[e] && !ids.includes(e)) ids.push(e);
  return ids;
}

/** The block for the user turn, capped so a chatty ask cannot blow up the prompt. */
export function skillsBlock(ids: string[]): string | null {
  if (!ids.length) return null;
  const parts: string[] = [];
  let used = 0;
  // A skill bigger than the whole budget used to drop every skill, so an ask about the charts arrived with nothing.
  // Each one now takes the room that is left, trimmed at a line break, and the smaller ones still get through.
  for (const id of ids) {
    const text = SKILLS_DATA[id];
    if (!text) continue;
    const room = MAX_CHARS - used;
    if (room < 500) break;
    if (text.length <= room) { parts.push(text); used += text.length; continue; }
    const cut = text.slice(0, room - 60);
    parts.push(cut.slice(0, Math.max(cut.lastIndexOf("\n"), 400)) + "\n(trimmed to fit this exchange)");
    used = MAX_CHARS;
  }
  if (!parts.length) return null;
  return `SKILLS LOADED FOR THIS EXCHANGE (apply them; cite a number, not an adjective, when you reason):\n\n${parts.join("\n\n---\n\n")}`;
}

export const SKILL_IDS = Object.keys(SKILLS_DATA);
