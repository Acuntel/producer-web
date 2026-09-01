// Chroma for key and chords: track tuning estimation, constant-Q chroma and harmonic-salience
// chroma from one high-resolution spectral pass (plus a 4x-decimated pass for the bass octaves).
import { decimate, fft, interp, type Frames } from "./dsp";

// Constant-Q style chroma (N=8192, hop=2048): pitches from C1 to B7, each summing the FFT
// magnitude within plus or minus 50 cents of the pitch centre (interpolated where the FFT grid is
// coarser than a semitone), folded to 12 pitch classes and normalized per frame. The pitch grid is
// first re-tuned to the track (DJ edits and bootlegs are often pitched off A440), which is what
// keeps a semitone-off key from winning. This is the chroma shape key profiles were validated on.
export const chromaConfig = { lowMidi: 24, highMidi: 107, tuning: "auto" as "auto" | number };

export function estimateTuningCents(mags: Float32Array[], binHz: number): number {
  const hist = new Float64Array(100);
  const kLo = Math.ceil(80 / binHz), kHi = Math.floor(3000 / binHz);
  for (const mag of mags) {
    let top = 0;
    for (let k = kLo; k <= kHi; k++) if (mag[k] > top) top = mag[k];
    const floor = top * 0.03;
    for (let k = kLo; k <= kHi; k++) {
      const m = mag[k];
      if (m < floor || m <= mag[k - 1] || m < mag[k + 1]) continue;
      const a = Math.log(mag[k - 1] + 1e-9), b = Math.log(m + 1e-9), c = Math.log(mag[k + 1] + 1e-9);
      const den = a - 2 * b + c;
      const delta = den !== 0 ? (0.5 * (a - c)) / den : 0;
      const cents = 1200 * Math.log2(((k + delta) * binHz) / 440);
      let dev = cents - 100 * Math.round(cents / 100);
      if (dev >= 50) dev -= 100;
      hist[Math.max(0, Math.min(99, Math.floor(dev + 50)))] += Math.log(1 + m);
    }
  }
  let best = 0, bestV = -1;
  for (let i = 0; i < 100; i++) {
    let v = 0;
    for (let d = -3; d <= 3; d++) v += hist[(i + d + 100) % 100];
    if (v > bestV) { bestV = v; best = i; }
  }
  return best - 50;
}

// Two chroma flavours come out of the same spectra: constant-Q (bin sums, used for chords and
// structure) and harmonic salience (a partial only counts for a fundamental whose other harmonics
// are present, which stops a bright saw's fifth harmonic posing as a major third). Key finding
// scores both; on the DJ-tagged set the pair beat either one alone.
export function fillChroma(fr: Frames, mono: Float32Array, sr: number): void {
  const mainHop = fr.hop, mainCount = fr.count, out = fr.chroma, outSal = fr.chromaSal;
  const n = 8192, hop = 2048;
  const count = Math.max(1, Math.floor((mono.length - n) / hop) + 1);
  const bins = n / 2 + 1;
  const binHz = sr / n;
  const win = new Float32Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  const re = new Float32Array(n), im = new Float32Array(n);
  const spectra = (x: Float32Array, frames: number): Float32Array[] => {
    const outMags: Float32Array[] = [];
    for (let t = 0; t < frames; t++) {
      const off = t * hop;
      for (let i = 0; i < n; i++) { const idx = off + i; re[i] = idx < x.length ? x[idx] * win[i] : 0; im[i] = 0; }
      fft(re, im);
      const mag = new Float32Array(bins);
      for (let k = 0; k < bins; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      outMags.push(mag);
    }
    return outMags;
  };
  const mags = spectra(mono, count);
  // The bass octaves (C1 to B2) need finer bins than 2.7 Hz to separate semitones, so they
  // come from a four-times decimated copy: same FFT size, four times the frequency resolution,
  // and the same hop in seconds, so the frames line up one to one.
  const bass = decimate(mono, sr, sr / 4);
  const bassHop = hop / 4;
  const bassMags: Float32Array[] = [];
  {
    const bx = bass.y;
    for (let t = 0; t < count; t++) {
      const off = t * bassHop;
      for (let i = 0; i < n; i++) { const idx = off + i; re[i] = idx < bx.length ? bx[idx] * win[i] : 0; im[i] = 0; }
      fft(re, im);
      const mag = new Float32Array(bins);
      for (let k = 0; k < bins; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      bassMags.push(mag);
    }
  }
  const bassBinHz = bass.sr / n;
  const tuning = chromaConfig.tuning === "auto" ? estimateTuningCents(mags, binHz) : chromaConfig.tuning;
  const shift = Math.pow(2, tuning / 1200);
  const pitches: { pc: number; kLo: number; kHi: number; center: number; low: boolean }[] = [];
  for (let midi = chromaConfig.lowMidi; midi <= chromaConfig.highMidi; midi++) {
    const low = midi < 48;
    const bh = low ? bassBinHz : binHz;
    const f = 440 * Math.pow(2, (midi - 69) / 12) * shift;
    const lo = f * Math.pow(2, -1 / 24), hi = f * Math.pow(2, 1 / 24);
    const kLo = Math.ceil(lo / bh), kHi = Math.min(bins - 2, Math.floor(hi / bh));
    pitches.push({ pc: ((midi % 12) + 12) % 12, kLo, kHi, center: f / bh, low });
  }
  const local = new Float32Array(count * 12), localSal = new Float32Array(count * 12);
  const HARM = 6, hw = Array.from({ length: HARM }, (_, h) => Math.pow(0.7, h));
  for (let t = 0; t < count; t++) {
    const c0 = t * 12;
    for (const p of pitches) {
      const mag = p.low ? bassMags[t] : mags[t];
      let v = 0;
      if (p.kHi >= p.kLo) for (let k = p.kLo; k <= p.kHi; k++) v += mag[k];
      else v = interp(mag, p.center);
      local[c0 + p.pc] += v;
      let sal = 0;
      for (let h = 1; h <= HARM; h++) { const c = p.center * h; if (c >= bins - 2) break; sal += hw[h - 1] * interp(mag, c); }
      localSal[c0 + p.pc] += sal;
    }
    for (const arr of [local, localSal]) {
      let mx = 0;
      for (let q = 0; q < 12; q++) if (arr[c0 + q] > mx) mx = arr[c0 + q];
      if (mx > 0) for (let q = 0; q < 12; q++) arr[c0 + q] /= mx;
    }
  }
  const ratio = hop / mainHop;
  for (let t = 0; t < mainCount; t++) {
    const src = Math.min(count - 1, Math.floor(t / ratio));
    for (let q = 0; q < 12; q++) { out[t * 12 + q] = local[src * 12 + q]; outSal[t * 12 + q] = localSal[src * 12 + q]; }
  }
}

