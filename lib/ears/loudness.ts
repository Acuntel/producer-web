// ITU-R BS.1770-4 loudness: K-weighting, gated integrated LUFS, short-term max,
// loudness range, crest factor and sample peak. Runs at the native sample rate.
export type Loud = {
  integrated: number; shortTermMax: number; range: number; crest: number; peak: number;
  blocks: Float32Array;  // momentary block power (400 ms, 100 ms hop), summed over channels
  blockHop: number;      // seconds between blocks
};

function kWeight(x: Float32Array, fs: number): Float32Array {
  // Stage 1: high shelf (+4 dB above ~1.7 kHz). Stage 2: high-pass (~38 Hz). libebur128 form.
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const b0 = (Vh + (Vb * K) / Q + K * K) / a0, b1 = (2 * (K * K - Vh)) / a0, b2 = (Vh - (Vb * K) / Q + K * K) / a0;
  const a1 = (2 * (K * K - 1)) / a0, a2 = (1 - K / Q + K * K) / a0;
  f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan((Math.PI * f0) / fs);
  a0 = 1 + K / Q + K * K;
  const c1 = (2 * (K * K - 1)) / a0, c2 = (1 - K / Q + K * K) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, z1 = 0, z2 = 0, w1 = 0, w2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const s1 = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = s1;
    const s2 = s1 - 2 * z1 + z2 - c1 * w1 - c2 * w2;
    z2 = z1; z1 = s1; w2 = w1; w1 = s2;
    y[i] = s2;
  }
  return y;
}

const lufs = (power: number) => (power > 0 ? -0.691 + 10 * Math.log10(power) : -Infinity);

export function analyzeLoudness(channels: Float32Array[], sr: number): Loud {
  const len = channels[0].length;
  const step = Math.max(1, Math.round(sr * 0.1));
  const subCount = Math.floor(len / step);
  const sub = new Float64Array(subCount); // mean-square per 100 ms sub-block, summed over channels
  let peak = 0, sqAll = 0;
  for (const ch of channels) {
    const z = kWeight(ch, sr);
    for (let j = 0; j < subCount; j++) {
      let s = 0;
      const off = j * step;
      for (let i = off; i < off + step; i++) s += z[i] * z[i];
      sub[j] += s / step;
    }
    for (let i = 0; i < len; i++) { const v = Math.abs(ch[i]); if (v > peak) peak = v; sqAll += ch[i] * ch[i]; }
  }
  const rmsAll = Math.sqrt(sqAll / Math.max(1, len * channels.length));
  // Momentary blocks: 400 ms = 4 sub-blocks, hop 100 ms.
  const nBlocks = Math.max(0, subCount - 3);
  const blocks = new Float32Array(nBlocks);
  for (let j = 0; j < nBlocks; j++) blocks[j] = (sub[j] + sub[j + 1] + sub[j + 2] + sub[j + 3]) / 4;
  // Gated integrated loudness.
  const absGate = -70;
  let sum = 0, cnt = 0;
  for (let j = 0; j < nBlocks; j++) if (lufs(blocks[j]) > absGate) { sum += blocks[j]; cnt++; }
  let integrated = -Infinity;
  if (cnt > 0) {
    const rel = lufs(sum / cnt) - 10;
    let s2 = 0, c2 = 0;
    for (let j = 0; j < nBlocks; j++) { const l = lufs(blocks[j]); if (l > absGate && l > rel) { s2 += blocks[j]; c2++; } }
    if (c2 > 0) integrated = lufs(s2 / c2);
  }
  // Short-term: 3 s windows (30 sub-blocks), hop 100 ms.
  const win = 30;
  const st: number[] = [];
  if (subCount >= win) {
    let acc = 0;
    for (let j = 0; j < win; j++) acc += sub[j];
    st.push(lufs(acc / win));
    for (let j = win; j < subCount; j++) { acc += sub[j] - sub[j - win]; st.push(lufs(acc / win)); }
  } else if (subCount > 0) {
    let acc = 0;
    for (let j = 0; j < subCount; j++) acc += sub[j];
    st.push(lufs(acc / subCount));
  }
  let shortTermMax = -Infinity;
  for (const v of st) if (v > shortTermMax) shortTermMax = v;
  // Loudness range (EBU Tech 3342): abs gate -70, relative gate -20 LU, P95 - P10.
  let range = 0;
  const g1 = st.filter((v) => v > absGate);
  if (g1.length > 1) {
    const meanPow = g1.reduce((a, v) => a + Math.pow(10, (v + 0.691) / 10), 0) / g1.length;
    const rel = lufs(meanPow) - 20;
    const g2 = g1.filter((v) => v > rel).sort((a, b) => a - b);
    if (g2.length > 1) {
      const p = (q: number) => g2[Math.min(g2.length - 1, Math.max(0, Math.round((g2.length - 1) * q)))];
      range = p(0.95) - p(0.1);
    }
  }
  const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  const crest = peak > 0 && rmsAll > 0 ? 20 * Math.log10(peak / rmsAll) : 0;
  return { integrated, shortTermMax, range, crest, peak: peakDb, blocks, blockHop: 0.1 };
}

// Loudness of a time span from the momentary block powers.
export function spanLufs(l: Loud, startSec: number, endSec: number): number {
  const a = Math.max(0, Math.floor(startSec / l.blockHop));
  const b = Math.min(l.blocks.length, Math.ceil(endSec / l.blockHop));
  if (b <= a) return -Infinity;
  let s = 0;
  for (let j = a; j < b; j++) s += l.blocks[j];
  return lufs(s / (b - a));
}
