// Synthetic club-music signals with known answers, for the ears tests.
const NOTE = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// Deterministic noise.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function synth({ bpm = 126, sr = 22050, seconds = 30, bassMidi = [38, 41, 45], padMidi = [62, 65, 69], duck = false, kickFrom = 0, hats = true, gain = 1, quietUntil = 0 } = {}) {
  const n = Math.floor(sr * seconds);
  const out = new Float32Array(n);
  const beat = 60 / bpm;
  const rand = rng(7);
  const noise = new Float32Array(n);
  for (let i = 0; i < n; i++) noise[i] = rand() * 2 - 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const inBeat = t % beat;
    const beatIdx = Math.floor(t / beat);
    const quiet = t < quietUntil;
    let kick = 0;
    if (t >= kickFrom && inBeat < 0.3) {
      const f = 40 + 70 * Math.exp(-inBeat / 0.025);
      const ph = 2 * Math.PI * (40 * inBeat + 70 * 0.025 * (1 - Math.exp(-inBeat / 0.025)));
      kick = Math.sin(ph) * Math.exp(-inBeat / 0.11) * 0.9 * (f > 0 ? 1 : 1);
    }
    let hat = 0;
    const offbeat = (t + beat / 2) % beat;
    if (hats && offbeat < 0.03) hat = noise[i] * Math.exp(-offbeat / 0.008) * 0.28;
    const bm = bassMidi[beatIdx % bassMidi.length];
    const fb = NOTE(bm);
    let bass = 0;
    for (let k = 1; k <= 6; k++) bass += Math.sin(2 * Math.PI * fb * k * t) / k;
    bass *= 0.22 * (1 - Math.min(1, inBeat / beat) * 0.3);
    let pad = 0;
    for (const m of padMidi) pad += Math.sin(2 * Math.PI * NOTE(m) * t) + 0.3 * Math.sin(2 * Math.PI * NOTE(m) * 2 * t);
    pad *= 0.06;
    let g = 1;
    if (duck && t >= kickFrom) g = 1 - 0.8 * Math.max(0, 1 - inBeat / 0.26);
    let v = quiet ? pad * 0.6 : kick + (hat + bass + pad) * g;
    out[i] = Math.tanh(v * gain);
  }
  return out;
}
