// Rhythm: tempo (autocorrelation of onset strength with harmonic summation and a
// dance-music prior), beat phase, swing, transient density, pump and kick density.
import { clamp, interp, percentile, type Frames, type Fine } from "./dsp";

export type Rhythm = {
  bpm: number; confidence: number; alt: number; beatOffset: number;
  swing: number; transientsPerBeat: number; pump: number; kickDensity: number;
  beatSec: number; barSec: number; downbeatOffset: number;
};

// Local-mean-subtracted, half-wave-rectified, max-normalized onset envelope.
export function onsetEnvelope(x: Float32Array, win: number): Float32Array {
  const n = x.length;
  const out = new Float32Array(n);
  let acc = 0, cnt = 0, max = 0;
  const half = Math.floor(win / 2);
  for (let i = 0; i < Math.min(n, half); i++) { acc += x[i]; cnt++; }
  for (let t = 0; t < n; t++) {
    if (t + half < n) { acc += x[t + half]; cnt++; }
    if (t - half - 1 >= 0) { acc -= x[t - half - 1]; cnt--; }
    const v = x[t] - acc / Math.max(1, cnt);
    out[t] = v > 0 ? v : 0;
    if (out[t] > max) max = out[t];
  }
  if (max > 0) for (let t = 0; t < n; t++) out[t] /= max;
  return out;
}

function autocorr(env: Float32Array, maxLag: number): Float32Array {
  const n = env.length;
  const acf = new Float32Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0;
    for (let t = 0; t + lag < n; t++) s += env[t] * env[t + lag];
    acf[lag] = s / Math.max(1, n - lag);
  }
  const z = acf[0] || 1;
  for (let lag = 0; lag <= maxLag; lag++) acf[lag] /= z;
  return acf;
}

export type TempoResult = { bpm: number; confidence: number; alt: number; lagFrames: number };

export function estimateTempo(env: Float32Array, fps: number, bpmHint?: number): TempoResult {
  const maxLag = Math.min(env.length - 2, Math.ceil(fps * 8.2));
  const acf = autocorr(env, maxLag);
  const weights = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4];
  // Harmonic summation gated by the beat lag itself: a 3:2 impostor (a lag that lands
  // between beats) is killed by the sqrt(acf(L)) factor, a half-tempo impostor by the
  // acf(L/2) penalty, and the dance prior settles honest octave ties.
  const raw = (bpm: number) => {
    const L = (fps * 60) / bpm;
    let s = 0;
    for (let k = 1; k <= 8; k++) { const lag = k * L; if (lag > maxLag) break; s += weights[k - 1] * interp(acf, lag); }
    return Math.sqrt(Math.max(0, interp(acf, L))) * s - 0.35 * interp(acf, L / 2);
  };
  const prior = (bpm: number) => {
    const c = bpmHint ?? 128, sigma = bpmHint ? 0.08 : 0.35;
    const d = Math.log2(bpm / c) / sigma;
    return Math.exp(-0.5 * d * d);
  };
  let best = 60, bestScore = -Infinity;
  for (let bpm = 60; bpm <= 200; bpm += 0.1) {
    const s = raw(bpm) * (0.15 + prior(bpm));
    if (s > bestScore) { bestScore = s; best = bpm; }
  }
  for (let bpm = best - 0.5; bpm <= best + 0.5; bpm += 0.01) {
    const s = raw(bpm) * (0.15 + prior(bpm));
    if (s > bestScore) { bestScore = s; best = bpm; }
  }
  const L = (fps * 60) / best;
  const confidence = clamp(interp(acf, L), 0, 1);
  const half = best / 2, dbl = best * 2;
  let alt = half >= 60 ? half : dbl;
  if (half >= 60 && dbl <= 200) alt = raw(half) > raw(dbl) ? half : dbl;
  return { bpm: Math.round(best * 100) / 100, confidence: Math.round(confidence * 1000) / 1000, alt: Math.round(alt * 100) / 100, lagFrames: L };
}

// Beat phase on the fine onset envelope for a known period (seconds).
export function beatPhase(fine: Fine, beatSec: number, maxSec = 60): number {
  const L = beatSec * fine.fps;
  const span = Math.min(fine.count, Math.floor(maxSec * fine.fps));
  let bestPhi = 0, bestS = -Infinity;
  const steps = 60;
  for (let s = 0; s < steps; s++) {
    const phi = (s / steps) * L;
    let acc = 0;
    for (let x = phi; x < span; x += L) acc += interp(fine.onset, x) + 0.5 * interp(fine.onset, x + 1) + 0.5 * interp(fine.onset, x - 1);
    if (acc > bestS) { bestS = acc; bestPhi = phi; }
  }
  return bestPhi / fine.fps;
}

// Beat-synchronous average profile of an envelope (bins per beat).
export function beatProfile(env: Float32Array, fps: number, beatSec: number, offsetSec: number, bins = 48, startSec = 0, endSec = Infinity): Float32Array {
  const prof = new Float32Array(bins);
  const L = beatSec * fps;
  const start = Math.max(offsetSec, startSec) * fps;
  const end = Math.min(env.length - 1, endSec * fps);
  let beats = 0;
  for (let b = start + Math.ceil((startSec * fps - start) / L) * L; b + L <= end; b += L) {
    for (let i = 0; i < bins; i++) prof[i] += interp(env, b + (i / bins) * L);
    beats++;
  }
  if (beats > 0) for (let i = 0; i < bins; i++) prof[i] /= beats;
  return prof;
}

// MPC-style 16th swing (0.50 straight, 0.667 triplet) from the half-beat onset profile.
// Straight when no real 16th-note onset stands out of the profile's noise floor.
export function swingFromProfile(prof: Float32Array): number {
  const bins = prof.length / 2;
  const h = new Float32Array(bins);
  for (let i = 0; i < bins; i++) h[i] = prof[i] + prof[i + bins];
  const base = percentile(h, 0.5);
  let peak = 0;
  for (let i = 0; i < bins; i++) { h[i] = Math.max(0, h[i] - base); if (h[i] > peak) peak = h[i]; }
  const lo = Math.round(bins * 0.375), hi = Math.round(bins * 0.75);
  let s = 0, w = 0, m = 0;
  for (let i = lo; i < hi; i++) { s += h[i] * ((i + 0.5) / bins); w += h[i]; if (h[i] > m) m = h[i]; }
  if (peak <= 0 || m < 0.2 * peak || w <= 0) return 0.5;
  return clamp(Math.round((s / w) * 1000) / 1000, 0.5, 0.7);
}

// Low-band onset envelope gated by an absolute sub level: a pad attack in a quiet breakdown is
// not a kick, however much it stands out relative to its own section.
export function kickEnvelope(fr: Frames): Float32Array {
  const env = onsetEnvelope(fr.lowFlux, Math.round(fr.fps * 0.5));
  const floor = 0.02 * 0.02 * fr.n; // sub+low RMS of about -34 dBFS within the analysis frame
  for (let t = 0; t < fr.count; t++) {
    const lowPower = (fr.bands[t * 6] + fr.bands[t * 6 + 1]) / fr.n;
    if (lowPower < floor) env[t] = 0;
  }
  return env;
}

export function countPeaks(env: Float32Array, thr: number, minGap: number, from = 0, to = env.length): number {
  let c = 0;
  let last = -Infinity;
  for (let t = Math.max(1, from); t < Math.min(env.length - 1, to); t++) {
    if (env[t] >= thr && env[t] >= env[t - 1] && env[t] > env[t + 1] && t - last >= minGap) { c++; last = t; }
  }
  return c;
}

export function analyzeRhythm(fr: Frames, fine: Fine, durationSec: number, bpmHint?: number): Rhythm {
  const env = onsetEnvelope(fr.flux, Math.round(fr.fps * 0.5));
  const t = estimateTempo(env, fr.fps, bpmHint);
  const beatSec = 60 / t.bpm;
  const barSec = beatSec * 4;
  const beatOffset = beatPhase(fine, beatSec);
  // Downbeat: the beat phase (0..3) whose bar starts carry the most low-band onset energy.
  const lowEnv = kickEnvelope(fr);
  let bestB = 0, bestS = -Infinity;
  for (let b = 0; b < 4; b++) {
    let s = 0;
    for (let x = (beatOffset + b * beatSec) * fr.fps; x < fr.count; x += barSec * fr.fps) s += interp(lowEnv, x) + interp(env, x);
    if (s > bestS) { bestS = s; bestB = b; }
  }
  const downbeatOffset = beatOffset + bestB * beatSec;
  const onsetProf = beatProfile(fine.onsetHi, fine.fps, beatSec, beatOffset, 48);
  const swing = swingFromProfile(onsetProf);
  // Pump = how far the sustained (>200 Hz) mix dips below its typical level each beat.
  const pumpProf = beatProfile(fine.rmsHp, fine.fps, beatSec, beatOffset, 48);
  const pMed = percentile(pumpProf, 0.5);
  let pMin = Infinity;
  for (let i = 0; i < 48; i++) if (pumpProf[i] < pMin) pMin = pumpProf[i];
  const pump = pMed > 0 ? clamp(1 - pMin / pMed, 0, 1) : 0;
  const beats = Math.max(1, durationSec / beatSec);
  const thr = 0.35 * percentile(fine.onset, 0.98);
  const transientsPerBeat = countPeaks(fine.onset, thr, Math.round(fine.fps * 0.03)) / beats;
  const kThr = 0.4 * percentile(lowEnv, 0.95);
  const kickDensity = countPeaks(lowEnv, kThr, Math.round(fr.fps * 0.12)) / Math.max(1, durationSec / barSec);
  return {
    bpm: t.bpm, confidence: t.confidence, alt: t.alt, beatOffset: Math.round(beatOffset * 1000) / 1000,
    swing, transientsPerBeat: Math.round(transientsPerBeat * 100) / 100, pump: Math.round(pump * 1000) / 1000,
    kickDensity: Math.round(kickDensity * 100) / 100, beatSec, barSec, downbeatOffset,
  };
}

// Kick density inside a time span (kicks per bar).
export function kickDensityIn(fr: Frames, barSec: number, startSec: number, endSec: number): number {
  const lowEnv = kickEnvelope(fr);
  const kThr = 0.4 * percentile(lowEnv, 0.95);
  const c = countPeaks(lowEnv, kThr, Math.round(fr.fps * 0.12), Math.floor(startSec * fr.fps), Math.floor(endSec * fr.fps));
  return c / Math.max(0.25, (endSec - startSec) / barSec);
}
