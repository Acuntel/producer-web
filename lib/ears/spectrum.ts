// Spectral balance: band shares, centroid, mud, harshness and stereo width.
import type { Frames } from "./dsp";

export type BandShares = { sub: number; low: number; lowMid: number; mid: number; highMid: number; air: number };
export type Spectrum = { bands: BandShares; centroidHz: number; mud: number; harshness: number; width: number };

export function bandSharesIn(fr: Frames, from = 0, to = fr.count): BandShares {
  const acc = [0, 0, 0, 0, 0, 0];
  for (let t = Math.max(0, from); t < Math.min(fr.count, to); t++) for (let b = 0; b < 6; b++) acc[b] += fr.bands[t * 6 + b];
  const tot = acc.reduce((a, b) => a + b, 0) || 1;
  const r = (v: number) => Math.round((v / tot) * 1000) / 1000;
  return { sub: r(acc[0]), low: r(acc[1]), lowMid: r(acc[2]), mid: r(acc[3]), highMid: r(acc[4]), air: r(acc[5]) };
}

export function analyzeSpectrum(fr: Frames, channels?: Float32Array[]): Spectrum {
  const bands = bandSharesIn(fr);
  let cs = 0, cw = 0;
  for (let t = 0; t < fr.count; t++) { const w = Math.sqrt(fr.energy[t] + 1e-12); cs += fr.centroid[t] * w; cw += w; }
  const centroidHz = cw > 0 ? Math.round(cs / cw) : 0;
  const mud = Math.round((bands.lowMid / Math.max(1e-6, bands.low + bands.lowMid + bands.mid)) * 1000) / 1000;
  const harshness = bands.highMid;
  let width = 0;
  if (channels && channels.length >= 2) {
    const L = channels[0], R = channels[1];
    let m = 0, s = 0;
    const step = Math.max(1, Math.floor(L.length / 400000));
    for (let i = 0; i < L.length; i += step) { const mid = (L[i] + R[i]) * 0.5, side = (L[i] - R[i]) * 0.5; m += mid * mid; s += side * side; }
    width = m > 0 ? Math.round(Math.sqrt(s / m) * 1000) / 1000 : 0;
  }
  return { bands, centroidHz, mud, harshness, width };
}
