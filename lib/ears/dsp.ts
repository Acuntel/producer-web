// Signal plumbing for the ears: mono mix, decimation, FFT, framed features.
// Pure TypeScript: Float32Array in, typed arrays out. No DOM, no Tone.js.

export type Frames = {
  sr: number; n: number; hop: number; count: number; fps: number;
  rms: Float32Array;      // per-frame RMS of the raw signal
  energy: Float32Array;   // per-frame total spectral power
  flux: Float32Array;     // onset strength, full band (half-wave rectified log spectral flux)
  lowFlux: Float32Array;  // onset strength below 120 Hz (kick onsets)
  centroid: Float32Array; // spectral centroid in Hz
  bands: Float32Array;    // count*6 power per band: sub<60, low 60-250, lowMid 250-500, mid 500-2k, highMid 2-6k, air >6k
  chroma: Float32Array;   // count*12 constant-Q chroma, max-normalized per frame (C=0)
  chromaSal: Float32Array; // count*12 harmonic-salience chroma, max-normalized per frame
};

export type Fine = {
  hop: number; fps: number; count: number;
  rms: Float32Array;    // 2.5 ms RMS envelope, full band
  rmsHp: Float32Array;  // same, high-passed at 200 Hz (kick body removed)
  onset: Float32Array;  // log-energy rise, half-wave rectified (full band: kicks dominate)
  onsetHp: Float32Array; // log-energy rise of the high-passed signal (hats, snares, chords)
  onsetHi: Float32Array; // log-energy rise above ~4 kHz (hats only: the swing lives here)
};

export const BAND_EDGES = [0, 60, 250, 500, 2000, 6000, Infinity];

export function mixMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const len = channels[0].length;
  const out = new Float32Array(len);
  const g = 1 / channels.length;
  for (const ch of channels) for (let i = 0; i < len; i++) out[i] += ch[i] * g;
  return out;
}

// Windowed-sinc lowpass + decimate by an integer factor (44.1k -> 22.05k, 48k -> 24k).
export function decimate(x: Float32Array, sr: number, targetSr = 22050): { y: Float32Array; sr: number } {
  const factor = Math.max(1, Math.round(sr / targetSr));
  if (factor === 1) return { y: x, sr };
  const taps = 16 * factor + 1;
  const mid = (taps - 1) / 2;
  const fc = 0.45 / factor;
  const h = new Float32Array(taps);
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const k = i - mid;
    const sinc = k === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k);
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (taps - 1));
    h[i] = sinc * w;
    sum += h[i];
  }
  for (let i = 0; i < taps; i++) h[i] /= sum;
  const outLen = Math.floor(x.length / factor);
  const y = new Float32Array(outLen);
  const n = x.length;
  for (let o = 0; o < outLen; o++) {
    const c = o * factor - mid;
    let acc = 0;
    const i0 = Math.max(0, -c);
    const i1 = Math.min(taps, n - c);
    for (let i = i0; i < i1; i++) acc += h[i] * x[c + i];
    y[o] = acc;
  }
  return { y, sr: sr / factor };
}

const tableCache = new Map<number, { cos: Float32Array; sin: Float32Array; rev: Uint32Array }>();
function tables(n: number) {
  let t = tableCache.get(n);
  if (t) return t;
  const cos = new Float32Array(n / 2);
  const sin = new Float32Array(n / 2);
  for (let k = 0; k < n / 2; k++) { cos[k] = Math.cos((2 * Math.PI * k) / n); sin[k] = Math.sin((2 * Math.PI * k) / n); }
  const bits = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0, v = i;
    for (let b = 0; b < bits; b++) { r = (r << 1) | (v & 1); v >>= 1; }
    rev[i] = r;
  }
  t = { cos, sin, rev };
  tableCache.set(n, t);
  return t;
}

// In-place iterative radix-2 FFT. n must be a power of two.
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  const t = tables(n);
  for (let i = 0; i < n; i++) {
    const j = t.rev[i];
    if (j > i) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = 0; j < half; j++) {
        const k = j * step;
        const wr = t.cos[k], wi = -t.sin[k];
        const a = i + j, b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}

// One STFT pass producing every per-frame feature the ears need.
export function computeFrames(mono: Float32Array, sr: number, n = 2048, hop = 512): Frames {
  const count = Math.max(1, Math.floor((mono.length - n) / hop) + 1);
  const bins = n / 2 + 1;
  const binHz = sr / n;
  const win = new Float32Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  const bandOf = new Int8Array(bins), pcOf = new Int8Array(bins);
  const freq = new Float32Array(bins), pcW = new Float32Array(bins);
  for (let k = 0; k < bins; k++) {
    const f = k * binHz;
    freq[k] = f;
    let b = 0;
    while (f >= BAND_EDGES[b + 1]) b++;
    bandOf[k] = b;
    pcOf[k] = -1; pcW[k] = 0; // chroma comes from the dedicated high-resolution pass below
  }
  const lowBins = Math.ceil(120 / binHz);
  const rms = new Float32Array(count), energy = new Float32Array(count), flux = new Float32Array(count);
  const lowFlux = new Float32Array(count), centroid = new Float32Array(count);
  const bands = new Float32Array(count * 6), chroma = new Float32Array(count * 12), chromaSal = new Float32Array(count * 12);
  const re = new Float32Array(n), im = new Float32Array(n);
  let prevLog = new Float32Array(bins), curLog = new Float32Array(bins);
  const b6 = new Float64Array(6);
  for (let t = 0; t < count; t++) {
    const off = t * hop;
    let sq = 0;
    for (let i = 0; i < n; i++) { const v = mono[off + i]; sq += v * v; re[i] = v * win[i]; im[i] = 0; }
    rms[t] = Math.sqrt(sq / n);
    fft(re, im);
    let fl = 0, lfl = 0, cSum = 0, cW = 0;
    b6.fill(0);
    const c0 = t * 12;
    for (let k = 1; k < bins; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      const m = Math.sqrt(p);
      const lg = Math.log(1 + 10 * m);
      curLog[k] = lg;
      const d = lg - prevLog[k];
      if (d > 0) { fl += d; if (k < lowBins) lfl += d; }
      b6[bandOf[k]] += p;
      cSum += freq[k] * m; cW += m;
      const pc = pcOf[k];
      if (pc >= 0) chroma[c0 + pc] += m * pcW[k];
    }
    const tmp = prevLog; prevLog = curLog; curLog = tmp;
    flux[t] = fl; lowFlux[t] = lfl;
    centroid[t] = cW > 0 ? cSum / cW : 0;
    let tot = 0;
    for (let b = 0; b < 6; b++) { bands[t * 6 + b] = b6[b]; tot += b6[b]; }
    energy[t] = tot;
    let cs = 0;
    for (let p = 0; p < 12; p++) cs += chroma[c0 + p];
    if (cs > 0) for (let p = 0; p < 12; p++) chroma[c0 + p] /= cs;
  }
  // chroma and chromaSal are filled by chroma.ts (fillChroma) after this pass.
  return { sr, n, hop, count, fps: sr / hop, rms, energy, flux, lowFlux, centroid, bands, chroma, chromaSal };
}

// 2.5 ms envelopes for beat phase, swing and pump.
export function fineEnvelopes(mono: Float32Array, sr: number): Fine {
  const hop = Math.max(1, Math.round(sr * 0.0025));
  const win = hop * 4;
  const count = Math.max(1, Math.floor((mono.length - win) / hop) + 1);
  const onePoleHp = (x: Float32Array, fc: number) => {
    const rc = 1 / (2 * Math.PI * fc);
    const a = rc / (rc + 1 / sr);
    const y = new Float32Array(x.length);
    let prevX = 0, prevY = 0;
    for (let i = 0; i < x.length; i++) { const v = a * (prevY + x[i] - prevX); y[i] = v; prevX = x[i]; prevY = v; }
    return y;
  };
  const hp = onePoleHp(mono, 200);
  const hi = onePoleHp(onePoleHp(hp, 4000), 4000);
  const rms = new Float32Array(count), rmsHp = new Float32Array(count), rmsHi = new Float32Array(count);
  const onset = new Float32Array(count), onsetHp = new Float32Array(count), onsetHi = new Float32Array(count);
  for (let t = 0; t < count; t++) {
    const off = t * hop;
    let s = 0, sh = 0, si = 0;
    for (let i = off; i < off + win; i++) { s += mono[i] * mono[i]; sh += hp[i] * hp[i]; si += hi[i] * hi[i]; }
    rms[t] = Math.sqrt(s / win); rmsHp[t] = Math.sqrt(sh / win); rmsHi[t] = Math.sqrt(si / win);
  }
  const rise = (a: Float32Array, t: number) => { const d = Math.log(a[t] + 1e-5) - Math.log(a[t - 3] + 1e-5); return d > 0 ? d : 0; };
  for (let t = 3; t < count; t++) { onset[t] = rise(rms, t); onsetHp[t] = rise(rmsHp, t); onsetHi[t] = rise(rmsHi, t); }
  return { hop, fps: sr / hop, count, rms, rmsHp, onset, onsetHp, onsetHi };
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const round = (v: number, d = 2) => { const p = Math.pow(10, d); return Math.round(v * p) / p; };
export function percentile(values: number[] | Float32Array, q: number): number {
  const a = Array.from(values).sort((x, y) => x - y);
  if (a.length === 0) return 0;
  const idx = clamp((a.length - 1) * q, 0, a.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return a[lo] + (a[hi] - a[lo]) * (idx - lo);
}
// Linear interpolation into a typed array at a fractional index.
export function interp(a: Float32Array, x: number): number {
  if (x <= 0) return a[0];
  if (x >= a.length - 1) return a[a.length - 1];
  const i = Math.floor(x);
  return a[i] + (a[i + 1] - a[i]) * (x - i);
}
