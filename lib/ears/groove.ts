// Extract Groove: fold a track's onsets into the 16 slots of one bar and read
// how late or early each slot lands and how hard it hits. Only slots that hold
// a stable hit in most bars get a reading; scatter between hits stays at zero.
// The result is a custom Groove Pool template the studio can apply to its own drums.
import { interp } from "./dsp";

export type GrooveTemplate = { timing: number[]; accents: number[]; confidence: number };
const SLOTS = 16;
const MIN_HIT_RATE = 0.6;   // a real slot fires in at least 60 percent of the bars
const MAX_SPREAD_SEC = 0.012; // and lands within about 12 ms of its own mean

type Sample = { shift: number; w: number };

// onset: an onset-strength envelope at `fps` frames per second. bpm and phase (seconds of the
// first downbeat) place the grid. Timing comes back in beats (positive = late), accents in -1..1.
export function extractGroove(onset: Float32Array, fps: number, bpm: number, phase = 0, maxSec = 90): GrooveTemplate {
  const beatSec = 60 / bpm;
  const slotSec = beatSec / 4;
  const barSec = beatSec * 4;
  const half = slotSec / 2;
  const span = Math.min(onset.length / fps, maxSec);
  const samples: Sample[][] = Array.from({ length: SLOTS }, () => []);
  let bars = 0;
  for (let t0 = phase; t0 + barSec <= span; t0 += barSec) {
    bars++;
    // A hit counts when it stands out of this bar's own onset activity.
    let barMax = 0;
    for (let i = Math.floor(t0 * fps); i < Math.min(onset.length, Math.ceil((t0 + barSec) * fps)); i++) if (onset[i] > barMax) barMax = onset[i];
    if (barMax <= 0) continue;
    for (let s = 0; s < SLOTS; s++) {
      const center = t0 + s * slotSec;
      let best = 0, bestAt = 0;
      const from = Math.max(1, Math.floor((center - half) * fps)), to = Math.min(onset.length - 2, Math.ceil((center + half) * fps));
      for (let i = from; i <= to; i++) if (onset[i] > best && onset[i] >= onset[i - 1] && onset[i] >= onset[i + 1]) { best = onset[i]; bestAt = i; }
      if (best < 0.3 * barMax) continue;
      // Parabolic refinement between neighbouring frames for sub-frame timing.
      const a = onset[bestAt - 1], b = onset[bestAt], c = onset[bestAt + 1];
      const den = a - 2 * b + c;
      const at = den < 0 ? bestAt + 0.5 * (a - c) / den : bestAt;
      const shift = at / fps - center;
      if (Math.abs(shift) > half) continue;
      samples[s].push({ shift, w: interp(onset, at) });
    }
  }
  const timing = new Array<number>(SLOTS).fill(0);
  const accents = new Array<number>(SLOTS).fill(0);
  if (bars === 0) return { timing, accents, confidence: 0 };
  const real: number[] = [];
  const level = new Array<number>(SLOTS).fill(0);
  for (let s = 0; s < SLOTS; s++) {
    const list = samples[s];
    if (list.length / bars < MIN_HIT_RATE) continue;
    const wSum = list.reduce((acc, x) => acc + x.w, 0);
    const mean = list.reduce((acc, x) => acc + x.shift * x.w, 0) / wSum;
    const spread = Math.sqrt(list.reduce((acc, x) => acc + (x.shift - mean) ** 2 * x.w, 0) / wSum);
    if (spread > MAX_SPREAD_SEC) continue;
    real.push(s);
    timing[s] = Math.round((mean / beatSec) * 10000) / 10000;
    level[s] = wSum / bars;
  }
  if (real.length) {
    const avg = real.reduce((acc, s) => acc + level[s], 0) / real.length;
    for (const s of real) accents[s] = avg > 0 ? Math.max(-1, Math.min(1, Math.round(((level[s] - avg) / avg) * 100) / 100)) : 0;
  }
  const confidence = real.length ? Math.round((real.reduce((acc, s) => acc + samples[s].length / bars, 0) / real.length) * 100) / 100 : 0;
  return { timing, accents, confidence };
}

// One line for the brain: which slots run late or early, in milliseconds.
export function grooveTemplateLine(g: GrooveTemplate, bpm: number): string {
  const ms = (b: number) => Math.round(b * (60 / bpm) * 1000);
  const late = g.timing.map((t, i) => ({ i, ms: ms(t) })).filter((x) => Math.abs(x.ms) >= 4);
  if (!late.length) return "straight (every 16th within 4 ms of the grid)";
  return late.map((x) => `slot ${x.i} ${x.ms > 0 ? "+" : ""}${x.ms} ms`).join(", ");
}
