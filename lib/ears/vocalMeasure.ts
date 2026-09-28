// The measurements a vocal placement is judged by, on plain samples: where the voice actually is in a render (its
// envelope aligned to what should be there), how buried it is in 1 to 5 kHz, which pitch classes it sings, and
// whether its cut edges sit in silence. Pure TypeScript, no DOM and no Tone, so each is tested on a known signal.
import { fft } from "./dsp";

/** The hop an envelope really steps by, in seconds: `hopSec` rounded to whole samples at this rate. */
export const hopOf = (sr: number, hopSec = 0.002) => Math.max(1, Math.round(hopSec * sr)) / sr;

/** Linear RMS every `hopSec` (rounded to whole samples, hopOf), over `winSec`. */
export function rmsEnvelope(x: Float32Array, sr: number, hopSec = 0.002, winSec = 0.01): Float32Array {
  const hop = Math.max(1, Math.round(hopSec * sr)), win = Math.max(hop, Math.round(winSec * sr));
  const n = Math.max(0, Math.floor((x.length - win) / hop) + 1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; const a = i * hop; for (let j = a; j < a + win; j++) s += x[j] * x[j]; out[i] = Math.sqrt(s / win); }
  return out;
}

/** An envelope stretched in time by `factor` (1.05 makes it 5% longer), by linear interpolation. */
export function stretchEnvelope(env: Float32Array, factor: number): Float32Array {
  const n = Math.max(1, Math.round(env.length * factor));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / factor; const a = Math.floor(x), f = x - a; out[i] = (env[a] ?? 0) * (1 - f) + (env[a + 1] ?? env[a] ?? 0) * f; }
  return out;
}

const logc = (e: Float32Array) => { const out = new Float32Array(e.length); let m = 0; for (const v of e) m = Math.max(m, v); const floor = m * 1e-3 + 1e-9; for (let i = 0; i < e.length; i++) out[i] = Math.log(Math.max(floor, e[i]) / floor); return out; };

/** Where `ref` sits in `sig` (both envelopes on one hop): the lag in hops, searched from `from` to `to`, refined to a
 *  fraction of a hop, and how alike they are there (a normalized correlation, 0 to 1). */
export function alignLag(ref: Float32Array, sig: Float32Array, from: number, to: number, log = true): { lag: number; corr: number } {
  const a = log ? logc(ref) : ref, b = log ? logc(sig) : sig;
  const ma = a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  const za = a.map((v) => v - ma); const na = Math.sqrt(za.reduce((s, v) => s + v * v, 0)) || 1;
  const score = (lag: number) => {
    let d = 0, sb = 0, sbb = 0, n = 0;
    for (let i = 0; i < za.length; i++) { const j = i + lag; if (j < 0 || j >= b.length) continue; sb += b[j]; sbb += b[j] * b[j]; n++; }
    if (n < za.length * 0.5) return -1;
    const mb = sb / n; const nb = Math.sqrt(Math.max(1e-12, sbb - n * mb * mb));
    for (let i = 0; i < za.length; i++) { const j = i + lag; if (j < 0 || j >= b.length) continue; d += za[i] * (b[j] - mb); }
    return d / (na * nb);
  };
  let best = from, bs = -Infinity;
  const scores = new Map<number, number>();
  for (let lag = from; lag <= to; lag++) { const s = score(lag); scores.set(lag, s); if (s > bs) { bs = s; best = lag; } }
  const l = scores.get(best - 1), r = scores.get(best + 1);
  let frac = 0;
  if (l !== undefined && r !== undefined && l > -1 && r > -1) { const den = l - 2 * bs + r; if (den < 0) frac = Math.max(-0.5, Math.min(0.5, 0.5 * (l - r) / den)); }
  return { lag: best + frac, corr: Math.max(0, bs) };
}

/** Power in a band per frame (n-point frames, hop n/2), in dB. */
export function bandDb(x: Float32Array, sr: number, fromHz: number, toHz: number, n = 1024): Float32Array {
  const hop = n / 2, count = Math.max(0, Math.floor((x.length - n) / hop) + 1);
  const out = new Float32Array(count);
  const re = new Float32Array(n), im = new Float32Array(n);
  const k0 = Math.max(1, Math.floor((fromHz * n) / sr)), k1 = Math.min(n / 2, Math.ceil((toHz * n) / sr));
  for (let t = 0; t < count; t++) {
    for (let i = 0; i < n; i++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n); re[i] = x[t * hop + i] * w; im[i] = 0; }
    fft(re, im);
    let p = 0; for (let k = k0; k <= k1; k++) p += re[k] * re[k] + im[k] * im[k];
    out[t] = 10 * Math.log10(p + 1e-12);
  }
  return out;
}

/** The share of the voice's sung frames in which the other parts are at least `marginDb` louder than it in 1 to 5
 *  kHz, the band a voice is understood in (after Hafezi and Reiss 2015): 0 is clear, 1 is buried. */
export function maskedShare(vocal: Float32Array, others: Float32Array, sr: number, marginDb = 3): { masked: number; frames: number; medianGapDb: number } {
  const v = bandDb(vocal, sr, 1000, 5000), o = bandDb(others, sr, 1000, 5000);
  const n = Math.min(v.length, o.length);
  let top = -Infinity; for (let i = 0; i < n; i++) top = Math.max(top, v[i]);
  const sung: number[] = [];
  for (let i = 0; i < n; i++) if (v[i] > top - 25) sung.push(i);
  if (!sung.length) return { masked: 0, frames: 0, medianGapDb: 0 };
  const gaps = sung.map((i) => v[i] - o[i]).sort((a, b) => a - b);
  const masked = sung.filter((i) => o[i] >= v[i] + marginDb).length / sung.length;
  return { masked: Math.round(masked * 1000) / 1000, frames: sung.length, medianGapDb: Math.round(gaps[Math.floor(gaps.length / 2)] * 10) / 10 };
}

/** Twelve pitch-class weights of a sung signal (80 Hz to 1.6 kHz peaks, loud frames only), summing to 1. */
export function pitchClasses(x: Float32Array, sr: number): number[] {
  const n = 4096, hop = 2048, count = Math.max(0, Math.floor((x.length - n) / hop) + 1);
  const pc = new Array(12).fill(0);
  const re = new Float32Array(n), im = new Float32Array(n);
  const k0 = Math.floor((80 * n) / sr), k1 = Math.ceil((1600 * n) / sr);
  const frames: { mags: Float32Array; e: number }[] = [];
  for (let t = 0; t < count; t++) {
    for (let i = 0; i < n; i++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n); re[i] = x[t * hop + i] * w; im[i] = 0; }
    fft(re, im);
    const mags = new Float32Array(k1 + 2); let e = 0;
    for (let k = k0; k <= k1 + 1; k++) { mags[k] = Math.hypot(re[k], im[k]); e += mags[k] * mags[k]; }
    frames.push({ mags, e });
  }
  const loud = Math.max(0, ...frames.map((f) => f.e));
  for (const f of frames) {
    if (f.e < loud * 0.05) continue;
    for (let k = k0 + 1; k <= k1; k++) {
      const m = f.mags[k]; if (m < f.mags[k - 1] || m < f.mags[k + 1]) continue;
      const hz = (k * sr) / n; const midi = 69 + 12 * Math.log2(hz / 440);
      pc[((Math.round(midi) % 12) + 12) % 12] += m * m;
    }
  }
  const s = pc.reduce((a, b) => a + b, 0) || 1;
  return pc.map((v) => v / s);
}

/** How far a cut edge is below the loudest part of the cut, in dB (its first and last 20 ms against its peak 100 ms). */
export function edgeDb(x: Float32Array, sr: number): number {
  const e = rmsEnvelope(x, sr, 0.01, 0.02); if (e.length < 3) return 0;
  const peak = Math.max(...e) || 1e-9;
  const edge = Math.max(e[0], e[e.length - 1]);
  return Math.round(20 * Math.log10(Math.max(1e-9, edge) / peak) * 10) / 10;
}

/** Where a sung onset near `t` (seconds) is: inside `t - before` to `t + after`, the first upward crossing of half the
 *  loudest point that follows, refined between hops. The same rule on the source and on a render cancels its own bias. */
export function onsetNear(env: Float32Array, hop: number, t: number, before = 0.06, after = 0.15): number | null {
  const a = Math.max(1, Math.floor((t - before) / hop)), b = Math.min(env.length - 1, Math.ceil((t + after) / hop));
  if (b <= a) return null;
  let peak = 0, at = a;
  for (let i = a; i <= b; i++) if (env[i] > peak) { peak = env[i]; at = i; }
  if (peak <= 0) return null;
  const half = peak / 2;
  for (let i = Math.max(a, 1); i <= at; i++) {
    if (env[i] >= half && env[i - 1] < half) return (i - 1 + (half - env[i - 1]) / Math.max(1e-12, env[i] - env[i - 1])) * hop;
  }
  return a * hop;
}

/** The first sample at or over `level`, in seconds (a click's onset), or null. */
export function firstOver(x: Float32Array, sr: number, level = 0.05, from = 0, to = x.length): number | null {
  for (let i = from; i < Math.min(to, x.length); i++) if (Math.abs(x[i]) >= level) return i / sr;
  return null;
}
