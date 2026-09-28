// Fitting a voice to the beat, as arithmetic. A sung clip is never played faster or slower to change its pitch
// (varispeed: +3 semitones is 19% fast, a chipmunk) and never granulated (a smear). It is pre-rendered once per
// tempo and key with formants kept (Signalsmith Stretch, lib/audio/stretch.ts), cached by content under its own
// key, and played at rate 1. Past 12% or 3 semitones the beat moves to the voice instead (law 8): the draft is
// compiled in the vocal's key at its tempo, or at double or half of it.
//
// Tone-free and browser-free, so the keys, the store and the tests all read it.
import type { AudioClip } from "./types";
import { parseKey } from "./harmony";

export const MAX_STRETCH = 1.12;   // lib/sources/owned.ts: past twelve percent a stretched voice smears
export const MAX_SHIFT = 3;        // past three semitones a moved voice turns into a cartoon

export type Fit = { rate: number; semitones: number };

/** How a voice clip plays on a grid: its warp (song tempo over the clip's own) and its shift. */
export function voiceFit(clip: AudioClip, songBpm: number): Fit {
  const rate = clip.warp !== false && clip.bpm && songBpm > 0 ? songBpm / clip.bpm : 1;
  return { rate: Math.round(rate * 10000) / 10000, semitones: Math.round((clip.semitones ?? 0) * 100) / 100 };
}

export const isIdentity = (f: Fit) => Math.abs(f.rate - 1) < 1e-4 && Math.abs(f.semitones) < 1e-3;

/** The stretch-and-shift cost C of section 5.5: over 1 fails. */
export function fitCost(f: Fit): number {
  return Math.max(Math.abs(Math.log(f.rate)) / Math.log(MAX_STRETCH), Math.abs(f.semitones) / MAX_SHIFT);
}

/** The store key of a pre-rendered voice: `vocal:<clip key>@<rate>@<semitones>`. The unmoved voice is its own key. */
export function fitKey(base: string, f: Fit): string {
  return isIdentity(f) ? base : `vocal:${base}@${f.rate.toFixed(4)}@${f.semitones.toFixed(2)}`;
}
export function parseFitKey(key: string): (Fit & { base: string }) | null {
  const m = /^vocal:(.+)@(-?\d+(?:\.\d+)?)@(-?\d+(?:\.\d+)?)$/.exec(key);
  if (!m) return null;
  const rate = Number(m[2]), semitones = Number(m[3]);
  return Number.isFinite(rate) && rate > 0 && Number.isFinite(semitones) ? { base: m[1], rate, semitones } : null;
}
/** The clip a stored key was rendered from (the vault keeps that one, never a render). */
export const baseKeyOf = (key: string) => parseFitKey(key)?.base ?? key;

/** A voice clip as the engine plays it: from the pre-rendered buffer, whose timeline is the clip's divided by the
 *  rate, already at the song's tempo and in its key, so nothing downstream bends it again. */
export function playedClip(clip: AudioClip, songBpm: number): AudioClip {
  if (!clip.voice) return clip;
  const f = voiceFit(clip, songBpm);
  return { ...clip, startSec: (clip.startSec ?? 0) / f.rate, bpm: undefined, warp: false, semitones: 0, durationSec: clip.durationSec ? clip.durationSec / f.rate : undefined };
}

/** Seconds of the source become these seconds on the grid. */
export const onGrid = (sourceSec: number, f: Fit) => sourceSec / f.rate;

/** The tempo a beat should run at for a voice sung at `vocalBpm`: its own, double or half, whichever is nearest
 *  the beat's lane (the tempo the draft would have had). */
export function tempoForVoice(vocalBpm: number, laneBpm: number): number {
  const opts = [vocalBpm, vocalBpm * 2, vocalBpm / 2].filter((b) => b >= 60 && b <= 200);
  if (!opts.length) return Math.round(vocalBpm);
  return Math.round(opts.reduce((a, b) => (Math.abs(Math.log(b / laneBpm)) < Math.abs(Math.log(a / laneBpm)) ? b : a)) * 100) / 100;
}

/** The tempo the voice is treated as on this grid (its own, double or half) and the rate that stretches it there. */
export function rateOnto(vocalBpm: number, gridBpm: number): { playsAt: number; rate: number } {
  let best = { playsAt: vocalBpm, rate: gridBpm / vocalBpm };
  for (const k of [2, 0.5]) { const r = gridBpm / (vocalBpm * k); if (Math.abs(Math.log(r)) < Math.abs(Math.log(best.rate)) - 1e-9) best = { playsAt: vocalBpm * k, rate: r }; }
  return best;
}

/** Semitones from a key to another (to its relative when the modes differ), the smallest way round. */
export function keyShift(from: string | null | undefined, to: string | null | undefined): number | null {
  const a = from ? parseKey(from) : null, g = to ? parseKey(to) : null;
  if (!a || !g) return null;
  const target = a.mode === g.mode ? g.pc : a.mode === "minor" ? (g.pc + 9) % 12 : (g.pc + 3) % 12;
  return ((target - a.pc + 18) % 12) - 6;
}

/** How a voice from a record (its tempo, its key, and the shift its phrase sings at) goes onto this song. `fits`
 *  says whether it stays inside 12% and 3 semitones; when it does not, the beat moves (beatFor). */
export function fitOnto(v: { bpm: number; key: string | null; keyRel?: number | null }, song: { bpm: number; key: string }): Fit & { playsAt: number; fits: boolean } {
  const { playsAt, rate } = rateOnto(v.bpm, song.bpm);
  const shift = keyShift(v.key, song.key);
  const semitones = shift === null ? 0 : shift;
  const f = { rate: Math.round(rate * 10000) / 10000, semitones };
  return { ...f, playsAt, fits: fitCost(f) <= 1 };
}

/** The beat a voice needs: its tempo (or double or half, nearest the lane) and its key. */
export function beatFor(v: { bpm: number; key: string | null }, laneBpm: number): { bpm: number; key: string | null } {
  return { bpm: tempoForVoice(v.bpm, laneBpm), key: v.key };
}
