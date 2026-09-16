// Root pitch of a short sound, in the browser, no model: a YIN estimate over the loudest 200 ms after the
// onset, folded to a MIDI note with a confidence. Used to tune a grabbed tone so the song's root plays it at pitch.
export type RootPitch = { midi: number | null; hz: number | null; confidence: number };

export function detectRootPitch(samples: Float32Array, sampleRate: number, opts?: { fmin?: number; fmax?: number }): RootPitch {
  const fmin = opts?.fmin ?? 40, fmax = opts?.fmax ?? 2000;
  if (samples.length < sampleRate * 0.05) return { midi: null, hz: null, confidence: 0 };
  // The loudest 200 ms window (after the transient) carries the tone.
  const win = Math.min(samples.length, Math.floor(sampleRate * 0.2));
  let bestStart = 0, bestE = -1;
  const hop = Math.max(1, Math.floor(sampleRate * 0.01));
  for (let s = 0; s + win <= samples.length; s += hop) {
    let e = 0; for (let i = s; i < s + win; i += 4) e += samples[i] * samples[i];
    if (e > bestE) { bestE = e; bestStart = s; }
  }
  const x = samples.subarray(bestStart, bestStart + win);
  const tauMin = Math.floor(sampleRate / fmax), tauMax = Math.min(Math.floor(sampleRate / fmin), Math.floor(win / 2));
  if (tauMax <= tauMin) return { midi: null, hz: null, confidence: 0 };
  // YIN: difference function, cumulative mean normalisation, first dip under the threshold, parabolic refinement.
  const d = new Float64Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) { let sum = 0; for (let i = 0; i + tau < win; i++) { const v = x[i] - x[i + tau]; sum += v * v; } d[tau] = sum; }
  const cmnd = new Float64Array(tauMax + 1); let run = 0;
  for (let tau = tauMin; tau <= tauMax; tau++) { run += d[tau]; cmnd[tau] = run > 0 ? (d[tau] * (tau - tauMin + 1)) / run : 1; }
  let tau = -1; const thr = 0.15;
  for (let t = tauMin + 1; t < tauMax; t++) { if (cmnd[t] < thr && cmnd[t] <= cmnd[t + 1]) { tau = t; break; } }
  if (tau < 0) { let m = tauMin; for (let t = tauMin; t <= tauMax; t++) if (cmnd[t] < cmnd[m]) m = t; tau = m; }
  const a = cmnd[tau - 1] ?? cmnd[tau], b = cmnd[tau], c = cmnd[tau + 1] ?? cmnd[tau];
  const denom = a - 2 * b + c; const shift = denom !== 0 ? 0.5 * (a - c) / denom : 0;
  const period = tau + Math.max(-1, Math.min(1, shift));
  const hz = sampleRate / period;
  const confidence = Math.max(0, Math.min(1, 1 - cmnd[tau]));
  if (!(hz > fmin && hz < fmax) || confidence < 0.5) return { midi: null, hz: null, confidence };
  return { midi: Math.round(69 + 12 * Math.log2(hz / 440)), hz: Math.round(hz * 10) / 10, confidence: Math.round(confidence * 100) / 100 };
}

/** The transpose that makes MIDI 60 play the sound at its own root, so notes on the song's root land in key. */
export const transposeForRoot = (rootMidi: number | null) => (rootMidi === null ? 0 : ((60 - rootMidi) % 12 + 18) % 12 - 6);
