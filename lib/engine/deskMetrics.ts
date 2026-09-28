// The desk's numbers, from samples alone: flat tops, sample and true peak, loudness, how closely
// each drum hit follows its own velocity, and the size of a discontinuity. Tone-free, so a unit
// test can hold every one of them to a signal whose answer is known.
import { analyzeLoudness } from "../ears/loudness";

export const db = (x: number) => 20 * Math.log10(Math.max(Math.abs(x), 1e-12));
const idx = (sr: number, sec: number, len: number) => Math.max(0, Math.min(len, Math.round(sec * sr)));

export type FlatTops = { samples: number; runs: number; longest: number; at: number[] };
/** Samples sitting on a hard clip: runs of `minRun` or more equal samples above `minAbs`. A soft
 *  curve never repeats a value over three samples of real music; a clamp does it every overload. */
export function flatTops(chs: Float32Array[], minRun = 3, minAbs = 0.25, eps = 1e-6, sr = 44100): FlatTops {
  let samples = 0, runs = 0, longest = 0; const at: number[] = [];
  for (const x of chs) {
    let run = 1;
    const close = (i: number) => { if (run >= minRun) { samples += run; runs++; if (run > longest) longest = run; if (at.length < 8) at.push(Math.round(((i - run) / sr) * 1000) / 1000); } run = 1; };
    for (let i = 1; i < x.length; i++) {
      if (Math.abs(x[i]) >= minAbs && Math.abs(x[i] - x[i - 1]) <= eps) run++; else close(i);
    }
    close(x.length);
  }
  return { samples, runs, longest, at };
}

/** How many samples sit within eps of a given level: the old desk's -2.85 dBFS clamp, for one. */
export function atLevel(chs: Float32Array[], level: number, eps = 1e-4): number {
  let n = 0;
  for (const x of chs) for (let i = 0; i < x.length; i++) if (Math.abs(Math.abs(x[i]) - level) <= eps) n++;
  return n;
}

/** How many samples sit at or beyond a level (in absolute value). */
export function atOrAbove(chs: Float32Array[], level: number): number {
  let n = 0;
  for (const x of chs) for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= level) n++;
  return n;
}

export function samplePeak(chs: Float32Array[]): number {
  let p = 0;
  for (const x of chs) for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > p) p = v; }
  return p;
}

// A Hann-windowed sinc per fractional phase, normalised to unity at DC.
function kernels(over: number, half: number): Float64Array[] {
  const out: Float64Array[] = [];
  for (let p = 1; p < over; p++) {
    const frac = p / over; const k = new Float64Array(2 * half); let sum = 0;
    for (let j = 0; j < 2 * half; j++) {
      const t = frac - (j - half + 1);
      const s = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const w = Math.abs(t) < half ? 0.5 * (1 + Math.cos((Math.PI * t) / half)) : 0;
      k[j] = s * w; sum += k[j];
    }
    for (let j = 0; j < k.length; j++) k[j] /= sum;
    out.push(k);
  }
  return out;
}

/** True peak: the loudest point between the samples too, by 4x band-limited interpolation (the
 *  BS.1770 method). Only the neighbourhood of loud samples is interpolated, which is where it lives. */
export function truePeak(chs: Float32Array[], over = 4, half = 16): number {
  const ks = kernels(over, half);
  const sp = samplePeak(chs); const thr = sp * 0.5; let peak = sp;
  for (const x of chs) {
    for (let n = 1; n < x.length; n++) {
      if (Math.abs(x[n]) < thr && Math.abs(x[n - 1]) < thr) continue;
      const base = n - 1;   // the interval between x[n-1] and x[n]
      for (const k of ks) {
        let y = 0;
        for (let j = 0; j < k.length; j++) { const i = base + j - half + 1; if (i >= 0 && i < x.length) y += x[i] * k[j]; }
        const v = Math.abs(y); if (v > peak) peak = v;
      }
    }
  }
  return peak;
}

/** Integrated loudness (BS.1770, gated) of a span, in LUFS. */
export function lufs(chs: Float32Array[], sr: number, fromSec = 0, toSec = Infinity): number {
  const a = idx(sr, fromSec, chs[0].length), b = idx(sr, Math.min(toSec, chs[0].length / sr), chs[0].length);
  return analyzeLoudness(chs.map((c) => c.subarray(a, b)), sr).integrated;
}

export function rmsDb(chs: Float32Array[], sr: number, fromSec: number, toSec: number): number {
  let s = 0, n = 0;
  for (const x of chs) { const a = idx(sr, fromSec, x.length), b = idx(sr, toSec, x.length); for (let i = a; i < b; i++) { s += x[i] * x[i]; n++; } }
  return n ? 10 * Math.log10(Math.max(s / n, 1e-24)) : -240;
}

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length); if (n < 2) return NaN;
  let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, dbv = b[i] - mb; sab += da * dbv; saa += da * da; sbb += dbv * dbv; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN;
}

/** The loudest sample just after each onset time, across channels: the level a hit attacks at. */
export function onsetPeaks(chs: Float32Array[], sr: number, times: number[], pre = 0.0015, post = 0.006): number[] {
  return times.map((t) => {
    let p = 0;
    for (const x of chs) { const a = idx(sr, t - pre, x.length), b = idx(sr, t + post, x.length); for (let i = a; i < b; i++) { const v = Math.abs(x[i]); if (v > p) p = v; } }
    return p;
  });
}

/** The chain's latency: the first sample that sounds after `fromSec`, less the time the first hit was
 *  due. Each DynamicsCompressor on the desk looks ahead about 6 ms, so the output is late by that much
 *  per compressor, and an onset read at its scheduled time would read the hit before it. */
export function latencyAfter(chs: Float32Array[], sr: number, fromSec: number, dueSec: number, floor = 1e-3): number {
  const a = idx(sr, fromSec, chs[0].length);
  for (let i = a; i < chs[0].length; i++) for (const x of chs) if (Math.abs(x[i]) > floor) return Math.max(0, i / sr - dueSec);
  return 0;
}

/** The biggest second difference in a span: a click or a cut is a spike here that the music around it never makes. */
export function maxJump(chs: Float32Array[], sr: number, fromSec: number, toSec: number): number {
  let m = 0;
  for (const x of chs) {
    const a = Math.max(2, idx(sr, fromSec, x.length)), b = idx(sr, toSec, x.length);
    for (let i = a; i < b; i++) { const d = Math.abs(x[i] - 2 * x[i - 1] + x[i - 2]); if (d > m) m = d; }
  }
  return m;
}
