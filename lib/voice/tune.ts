// Cleaning a take of Brady's own voice: a gate between phrases (the phrase envelope of lib/song/vocal.ts), and tuning
// toward the song's scale, gently by default. Each sung note (a run of steady pitch) is moved as a whole toward the
// nearest note of the scale, so the slides and the vibrato inside it stay his; a note far from any scale note (a
// bend, a blue note) is left alone unless he asked for hard tuning. The shift itself is Signalsmith with formants
// kept (lib/audio/stretch.ts). Pure arithmetic here, so it is tested.
import { trackPitch, hzToMidi, type PitchFrame } from "../engine/hum";
import { findPhrases } from "../song/vocal";
import { parseKey } from "../song/harmony";

export type SungNote = { start: number; end: number; midi: number; target: number; cents: number };
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];

export function scaleOf(key: string): number[] {
  const k = parseKey(key); if (!k) return [0, 2, 3, 5, 7, 8, 10].map((x) => (x + 9) % 12);
  return (k.mode === "minor" ? MINOR : MAJOR).map((x) => (x + k.pc) % 12);
}
/** The nearest MIDI note in the scale. */
export function nearestInScale(midi: number, scale: number[]): number {
  let best = Math.round(midi), d = Infinity;
  for (let m = Math.floor(midi) - 2; m <= Math.ceil(midi) + 2; m++) if (scale.includes(((m % 12) + 12) % 12) && Math.abs(m - midi) < d) { d = Math.abs(m - midi); best = m; }
  return best;
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

/** Sung notes: runs of confident frames whose pitch stays within half a semitone of the run, 80 ms or longer. */
export function sungNotes(frames: PitchFrame[], hopSec: number, key: string, minConf = 0.7): SungNote[] {
  const scale = scaleOf(key); const out: SungNote[] = [];
  let run: { t: number; m: number }[] = [];
  const close = () => {
    if (run.length * hopSec >= 0.08) { const m = median(run.map((r) => r.m)); const target = nearestInScale(m, scale); out.push({ start: run[0].t, end: run[run.length - 1].t + hopSec, midi: m, target, cents: Math.round((m - target) * 100) }); }
    run = [];
  };
  for (const f of frames) {
    if (!f.hz || f.conf < minConf) { close(); continue; }
    const m = hzToMidi(f.hz);
    if (run.length && Math.abs(m - median(run.map((r) => r.m))) > 0.5) close();
    run.push({ t: f.t, m });
  }
  close();
  return out;
}

export function pitchFrames(samples: Float32Array, sr: number): { frames: PitchFrame[]; hopSec: number } {
  const hop = Math.round(sr * 0.01), size = Math.round(sr * 0.04);
  let n = 1; while (n < size) n <<= 1;
  return { frames: trackPitch(samples, sr, n, hop), hopSec: hop / sr };
}

/** The shift for each note: gentle moves a note within 70 cents of the scale 80% of the way, hard moves every note
 *  all the way. Between notes the voice is left as sung. */
export function corrections(notes: SungNote[], mode: "gentle" | "hard" = "gentle"): { at: number; semitones: number }[] {
  const out: { at: number; semitones: number }[] = [];
  for (const n of notes) {
    const off = n.midi - n.target;
    if (mode === "gentle" && Math.abs(off) > 0.7) continue;
    const s = -off * (mode === "hard" ? 1 : 0.8);
    if (Math.abs(s) < 0.03) continue;
    out.push({ at: n.start, semitones: Math.round(s * 1000) / 1000 }, { at: n.end, semitones: 0 });
  }
  return out;
}

/** How far a take sings from the scale: the median of each note's distance from its nearest scale note, in cents. */
export function deviation(samples: Float32Array, sr: number, key: string): { medianAbsCents: number; notes: number } {
  const { frames, hopSec } = pitchFrames(samples, sr);
  const notes = sungNotes(frames, hopSec, key);
  return { medianAbsCents: notes.length ? Math.round(median(notes.map((n) => Math.abs(n.cents)))) : 0, notes: notes.length };
}

/** The gate: everything outside the sung phrases goes to silence, with 10 ms ramps at every edge; then the take is
 *  brought to a -1 dBFS peak, so it never clips. */
export function gateTake(samples: Float32Array, sr: number): Float32Array {
  const phrases = findPhrases(samples, sr, { maxSec: 60 });
  const out = new Float32Array(samples.length);
  const ramp = Math.round(0.01 * sr);
  for (const p of phrases) {
    const a = Math.max(0, Math.round(p.startSec * sr) - ramp), b = Math.min(samples.length, Math.round(p.endSec * sr) + ramp);
    for (let i = a; i < b; i++) { const g = Math.min(1, (i - a) / ramp, (b - i) / ramp); out[i] = samples[i] * g; }
  }
  let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 0.891 / peak : 1;
  for (let i = 0; i < out.length; i++) out[i] *= g;
  return out;
}
