// Structure: per-bar features, self-similarity novelty, segmentation and labels.
import type { Frames } from "./dsp";
import { bandSharesIn, type BandShares } from "./spectrum";
import { spanLufs, type Loud } from "./loudness";
import { kickDensityIn } from "./rhythm";
import { chordsPerBar } from "./tonal";

export type SectionLabel = "intro" | "groove" | "build" | "drop" | "break" | "outro" | "section";
export type SectionFacts = { start: number; end: number; label: SectionLabel; lufs: number; energy: number; bands: BandShares; hasKick: boolean; chords: string[]; centroidHz?: number; pump?: number; kickDensity?: number; swing?: number; peak?: number };
export type Structure = { sections: SectionFacts[]; energy: number[]; dropAt: number | null; barsTotal: number };

function barFeatures(fr: Frames, barSec: number, offset: number, bars: number): { feats: Float32Array[]; rms: Float32Array; full: Float32Array } {
  const feats: Float32Array[] = [];
  const rms = new Float32Array(bars), full = new Float32Array(bars);
  for (let i = 0; i < bars; i++) {
    const a = Math.floor((offset + i * barSec) * fr.fps), b = Math.min(fr.count, Math.floor((offset + (i + 1) * barSec) * fr.fps));
    const f = new Float32Array(19);
    let r = 0, n = 0;
    const bands = [0, 0, 0, 0, 0, 0];
    for (let t = a; t < b; t++) {
      r += fr.rms[t] * fr.rms[t]; n++;
      for (let k = 0; k < 6; k++) bands[k] += fr.bands[t * 6 + k];
      for (let p = 0; p < 12; p++) f[7 + p] += fr.chroma[t * 12 + p];
    }
    const tot = bands.reduce((x, y) => x + y, 0) || 1;
    rms[i] = n > 0 ? Math.sqrt(r / n) : 0;
    f[0] = Math.log10(rms[i] + 1e-5);
    for (let k = 0; k < 6; k++) f[1 + k] = bands[k] / tot;
    let cs = 0;
    for (let p = 0; p < 12; p++) cs += f[7 + p];
    if (cs > 0) for (let p = 0; p < 12; p++) f[7 + p] /= cs;
    // Fullness: loud AND carrying the hook register (a DJ intro is loud but hollow in the mids).
    full[i] = rms[i] * (0.6 + f[3] + f[4] + f[5] + f[6]);
    feats.push(f);
  }
  // z-score each dimension across bars
  for (let d = 0; d < 19; d++) {
    let m = 0;
    for (const f of feats) m += f[d];
    m /= Math.max(1, feats.length);
    let v = 0;
    for (const f of feats) v += (f[d] - m) * (f[d] - m);
    const sd = Math.sqrt(v / Math.max(1, feats.length)) || 1;
    for (const f of feats) f[d] = (f[d] - m) / sd;
  }
  return { feats, rms, full };
}

function novelty(feats: Float32Array[]): Float32Array {
  const n = feats.length;
  const K = Math.max(2, Math.min(8, Math.floor(n / 4)));
  const sim = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= n || j >= n) return 0;
    let s = 0, a = 0, b = 0;
    const x = feats[i], y = feats[j];
    for (let d = 0; d < x.length; d++) { s += x[d] * y[d]; a += x[d] * x[d]; b += y[d] * y[d]; }
    return a > 0 && b > 0 ? s / Math.sqrt(a * b) : 0;
  };
  const out = new Float32Array(n);
  let wsum = 0;
  for (let u = -K; u < K; u++) for (let v = -K; v < K; v++) wsum += Math.exp(-((u + 0.5) * (u + 0.5) + (v + 0.5) * (v + 0.5)) / (2 * (K / 2) * (K / 2)));
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let u = -K; u < K; u++) for (let v = -K; v < K; v++) {
      const sign = (u < 0 ? -1 : 1) * (v < 0 ? -1 : 1);
      const g = Math.exp(-((u + 0.5) * (u + 0.5) + (v + 0.5) * (v + 0.5)) / (2 * (K / 2) * (K / 2)));
      acc += sign * g * sim(i + u, i + v);
    }
    out[i] = acc / wsum; // -1..1: how much the bars before differ from the bars after
  }
  return out;
}

function boundaries(nov: Float32Array, minSeg: number): number[] {
  const n = nov.length;
  let m = 0;
  for (let i = 0; i < n; i++) m += nov[i];
  m /= Math.max(1, n);
  let v = 0;
  for (let i = 0; i < n; i++) v += (nov[i] - m) * (nov[i] - m);
  const sd = Math.sqrt(v / Math.max(1, n));
  const thr = Math.max(0.12, m + 0.5 * sd);
  const peaks: { i: number; v: number }[] = [];
  for (let i = 1; i < n - 1; i++) if (nov[i] > thr && nov[i] >= nov[i - 1] && nov[i] > nov[i + 1]) peaks.push({ i, v: nov[i] });
  peaks.sort((a, b) => b.v - a.v);
  const kept: number[] = [];
  for (const p of peaks) if (kept.every((k) => Math.abs(k - p.i) >= minSeg) && p.i >= minSeg && n - p.i >= minSeg) kept.push(p.i);
  kept.sort((a, b) => a - b);
  return kept;
}

export function analyzeStructure(fr: Frames, loud: Loud, barSec: number, offset: number, durationSec: number, keyBars?: string[]): Structure {
  const bars = Math.max(1, Math.floor((durationSec - offset) / barSec));
  const { feats, rms, full } = barFeatures(fr, barSec, offset, bars);
  let maxR = 0;
  for (let i = 0; i < bars; i++) if (rms[i] > maxR) maxR = rms[i];
  const energy = Array.from(rms, (r) => Math.round((maxR > 0 ? r / maxR : 0) * 1000) / 1000);
  const cuts = bars >= 8 ? boundaries(novelty(feats), 4) : [];
  const edges = [0, ...cuts, bars];
  const chords = keyBars ?? chordsPerBar(fr, barSec, offset, durationSec);
  type Seg = { a: number; b: number; full: number; kick: number; rise: number };
  const segs: Seg[] = [];
  for (let s = 0; s + 1 < edges.length; s++) {
    const a = edges[s], b = edges[s + 1];
    let f = 0;
    for (let i = a; i < b; i++) f += full[i];
    f /= Math.max(1, b - a);
    const q = Math.max(1, Math.floor((b - a) / 4));
    let first = 0, last = 0;
    for (let i = a; i < a + q; i++) first += full[i];
    for (let i = b - q; i < b; i++) last += full[i];
    const kick = kickDensityIn(fr, barSec, offset + a * barSec, offset + b * barSec);
    segs.push({ a, b, full: f, kick, rise: first > 0 ? last / first : 1 });
  }
  const maxFull = Math.max(...segs.map((s) => s.full), 1e-9);
  const labels: SectionLabel[] = segs.map(() => "section");
  segs.forEach((s, i) => {
    const long = s.b - s.a >= 4;
    const bar = i === 0 && segs.length > 1 ? 0.95 : 0.82; // an opening section must be unmistakable to count as a drop
    if (s.kick >= 2 && s.full >= bar * maxFull && long) labels[i] = "drop";
  });
  segs.forEach((s, i) => {
    if (labels[i] === "drop") return;
    const nextDrop = labels[i + 1] === "drop";
    if (i === 0 && !(nextDrop && s.rise > 1.3)) labels[i] = "intro";
    else if (nextDrop && (s.rise > 1.08 || s.full < 0.82 * maxFull)) labels[i] = "build";
    else if (s.kick < 2 && s.full < 0.7 * maxFull) labels[i] = i === segs.length - 1 ? "outro" : "break";
    else if (i === segs.length - 1) labels[i] = "outro";
    else labels[i] = s.kick >= 2 ? "groove" : "section";
  });
  if (segs.length === 1 && segs[0].kick >= 2) labels[0] = "drop";
  // Merge neighbours that got the same label (a steady loop should read as one section).
  for (let i = segs.length - 1; i > 0; i--) {
    if (labels[i] === labels[i - 1] && labels[i] !== "section") {
      segs[i - 1] = { ...segs[i - 1], b: segs[i].b, full: Math.max(segs[i - 1].full, segs[i].full), kick: Math.max(segs[i - 1].kick, segs[i].kick) };
      segs.splice(i, 1); labels.splice(i, 1);
    }
  }
  const sections: SectionFacts[] = segs.map((s, i) => {
    const start = offset + s.a * barSec, end = offset + s.b * barSec;
    const fa = Math.floor(start * fr.fps), fb = Math.floor(end * fr.fps);
    let e = 0;
    for (let k = s.a; k < s.b; k++) e += energy[k];
    return {
      start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100, label: labels[i],
      lufs: Math.round(spanLufs(loud, start, end) * 10) / 10,
      energy: Math.round((e / Math.max(1, s.b - s.a)) * 1000) / 1000,
      bands: bandSharesIn(fr, fa, fb), hasKick: s.kick >= 2,
      chords: chords.slice(s.a, s.b).filter((c, j, arr) => c !== "N" && arr[j - 1] !== c).slice(0, 8),
    };
  });
  const firstDrop = sections.find((s) => s.label === "drop");
  return { sections, energy, dropAt: firstDrop ? firstDrop.start : null, barsTotal: bars };
}
