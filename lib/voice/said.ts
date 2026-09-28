// What Brady said, by audio frame: every push-to-talk utterance with the frames it was heard between and, when the
// speech engine gives them, its words with their times. "Put what I just said in the song" is the utterance before the
// one that asks for it. The samples live in the talk mic's ring (lib/audio/ring.ts). Tone-free.
import { Ring } from "../audio/ring";

export type SaidWord = { w: string; start: number; end: number };   // seconds from the utterance's first frame
export type Utterance = { text: string; startFrame: number; endFrame: number; sampleRate: number; words: SaidWord[]; at: number };

let ring: Ring | null = null;
const said: Utterance[] = [];

/** The ring the talk mic writes into, made once per sample rate. */
export function talkRing(sampleRate: number): Ring {
  if (!ring || ring.sampleRate !== sampleRate) ring = new Ring(30, sampleRate);
  return ring;
}
export function remember(u: Utterance) { said.push(u); if (said.length > 12) said.shift(); }
/** What he just said before asking: the newest utterance, unless the newest is the ask itself (said out loud), in which
 *  case the one before it. A typed ask is not an utterance, so the newest stands. */
export function lastSaid(ask?: string): Utterance | null {
  const newest = said[said.length - 1]; if (!newest) return null;
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z ]/g, "").trim();
  if (ask && norm(newest.text) && (norm(ask).includes(norm(newest.text)) || norm(newest.text).includes("what i just"))) return said[said.length - 2] ?? null;
  return newest;
}
/** The ring as it is, for a probe that hands in what the mic would have heard. */
export const ringNow = () => ring;

/** The samples of an utterance: from just before its first word to just after its last (or all of it, with no words). */
export function samplesOf(u: Utterance): { samples: Float32Array; offsetSec: number } | null {
  if (!ring || ring.sampleRate !== u.sampleRate) return null;
  const sr = u.sampleRate;
  const words = u.words.filter((w) => w.end > w.start);
  const a = words.length ? u.startFrame + Math.max(0, Math.floor((words[0].start - 0.08) * sr)) : u.startFrame;
  const b = words.length ? Math.min(u.endFrame, u.startFrame + Math.ceil((words[words.length - 1].end + 0.25) * sr)) : u.endFrame;
  const samples = ring.slice(a, b);
  return samples.length ? { samples, offsetSec: (a - u.startFrame) / sr } : null;
}
