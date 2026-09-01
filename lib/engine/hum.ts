// Hum-to-melody: YIN pitch tracking on mic frames, then notes on the grid.
// Pure functions, testable in Node.
import type { Note } from "../song/types";

export type PitchFrame = { t: number; hz: number | null; conf: number; rms: number };

// YIN (de Cheveigne & Kawahara 2002), returns Hz or null.
export function yin(frame: Float32Array, sampleRate: number, threshold = 0.15, minHz = 60, maxHz = 1200): { hz: number | null; conf: number } {
  const n = frame.length;
  const maxTau = Math.min(Math.floor(sampleRate / minHz), Math.floor(n / 2));
  const minTau = Math.max(2, Math.floor(sampleRate / maxHz));
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < n - maxTau; i++) { const x = frame[i] - frame[i + tau]; sum += x * x; }
    d[tau] = sum;
  }
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) { running += d[tau]; cmnd[tau] = running === 0 ? 1 : (d[tau] * tau) / running; }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= maxTau && cmnd[t + 1] < cmnd[t]) t++;
      tau = t; break;
    }
  }
  if (tau < 0) {
    let best = minTau;
    for (let t = minTau; t <= maxTau; t++) if (cmnd[t] < cmnd[best]) best = t;
    if (cmnd[best] > 0.5) return { hz: null, conf: 0 };
    tau = best;
  }
  // Parabolic interpolation around tau.
  const x0 = tau > 1 ? cmnd[tau - 1] : cmnd[tau], x2 = tau + 1 <= maxTau ? cmnd[tau + 1] : cmnd[tau];
  const denom = 2 * (2 * cmnd[tau] - x2 - x0);
  const shift = denom === 0 ? 0 : (x2 - x0) / denom;
  const period = tau + Math.max(-1, Math.min(1, shift));
  return { hz: sampleRate / period, conf: Math.max(0, 1 - cmnd[tau]) };
}

export const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);

export function trackPitch(samples: Float32Array, sampleRate: number, frameSize = 2048, hop = 512): PitchFrame[] {
  const out: PitchFrame[] = [];
  for (let i = 0; i + frameSize <= samples.length; i += hop) {
    const frame = samples.subarray(i, i + frameSize);
    let e = 0;
    for (let j = 0; j < frame.length; j++) e += frame[j] * frame[j];
    const rms = Math.sqrt(e / frame.length);
    if (rms < 0.01) { out.push({ t: i / sampleRate, hz: null, conf: 0, rms }); continue; }
    const { hz, conf } = yin(frame, sampleRate);
    out.push({ t: i / sampleRate, hz, conf, rms });
  }
  return out;
}

// Frames -> quantized notes on a 16th grid, starting at t=0 = beat 0.
export function framesToNotes(frames: PitchFrame[], bpm: number, opts?: { grid?: number; minBeats?: number; minConf?: number; loopBeats?: number }): Note[] {
  const grid = opts?.grid ?? 0.25, minBeats = opts?.minBeats ?? 0.25, minConf = opts?.minConf ?? 0.5;
  const beatSec = 60 / bpm;
  const cells = new Map<number, number[]>();
  for (const f of frames) {
    if (f.hz === null || f.conf < minConf) continue;
    const cell = Math.floor(f.t / beatSec / grid);
    (cells.get(cell) ?? cells.set(cell, []).get(cell)!).push(hzToMidi(f.hz));
  }
  const cellPitch = new Map<number, number>();
  for (const [c, ps] of cells) {
    ps.sort((a, b) => a - b);
    cellPitch.set(c, Math.round(ps[Math.floor(ps.length / 2)]));
  }
  const notes: Note[] = [];
  const maxCell = Math.max(-1, ...cellPitch.keys());
  let cur: { midi: number; start: number; len: number } | null = null;
  for (let c = 0; c <= maxCell + 1; c++) {
    const p = cellPitch.get(c);
    if (cur && p === cur.midi) { cur.len++; continue; }
    if (cur) { if (cur.len * grid >= minBeats) notes.push([cur.midi, cur.start * grid, cur.len * grid, 100]); cur = null; }
    if (p !== undefined) cur = { midi: p, start: c, len: 1 };
  }
  const loop = opts?.loopBeats;
  return loop ? notes.filter((n) => n[1] < loop).map((n) => [n[0], n[1], Math.min(n[2], loop - n[1]), n[3]] as Note) : notes;
}

// Median-filter the pitch track to kill octave flickers.
export function smoothFrames(frames: PitchFrame[], radius = 2): PitchFrame[] {
  return frames.map((f, i) => {
    if (f.hz === null) return f;
    const win = frames.slice(Math.max(0, i - radius), i + radius + 1).map((x) => x.hz).filter((h): h is number => h !== null).sort((a, b) => a - b);
    return { ...f, hz: win[Math.floor(win.length / 2)] };
  });
}
