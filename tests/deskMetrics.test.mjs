import { test } from "node:test";
import assert from "node:assert/strict";
import { flatTops, atLevel, samplePeak, truePeak, lufs, rmsDb, pearson, onsetPeaks, maxJump, db } from "../lib/engine/deskMetrics.ts";

const SR = 44100;
const sine = (hz, amp, secs, phase = 0, sr = SR) => { const x = new Float32Array(Math.round(secs * sr)); for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin(2 * Math.PI * hz * (i / sr) + phase); return x; };

test("a clean sine has no flat tops; the same sine hard clipped is full of them", () => {
  const x = sine(997, 0.9, 1);
  assert.equal(flatTops([x]).samples, 0);
  const c = x.map((v) => Math.max(-0.5, Math.min(0.5, v)));
  const f = flatTops([c]);
  assert.ok(f.samples > 1000, `clipped: ${f.samples}`);
  assert.ok(atLevel([c], 0.5) >= f.samples);
});

test("true peak finds the peak between the samples that the sample peak misses", () => {
  // A quarter-rate sine at 45 degrees: every sample sits at 0.707 of the real peak.
  const x = sine(SR / 4, 1, 0.2, Math.PI / 4);
  assert.ok(Math.abs(samplePeak([x]) - Math.SQRT1_2) < 1e-3);
  const tp = truePeak([x]);
  assert.ok(tp > 0.98 && tp < 1.02, `true peak ${tp}`);
});

test("a full-scale 997 Hz sine on one channel reads -3 LUFS (BS.1770)", () => {
  const l = lufs([sine(997, 1, 3)], SR);
  assert.ok(Math.abs(l - -3.01) < 0.15, `lufs ${l}`);
  assert.ok(Math.abs(rmsDb([sine(997, 1, 1)], SR, 0, 1) - -3.01) < 0.05);
});

test("pearson is 1 for a line, -1 for its mirror, NaN for a constant", () => {
  assert.ok(Math.abs(pearson([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-12);
  assert.ok(Math.abs(pearson([1, 2, 3, 4], [8, 6, 4, 2]) + 1) < 1e-12);
  assert.ok(Number.isNaN(pearson([1, 2, 3], [5, 5, 5])));
});

test("onset peaks read each hit at its own level, and a cut is a jump the music never makes", () => {
  const x = new Float32Array(SR); const times = [0.1, 0.3, 0.5]; const amps = [0.2, 0.8, 0.4];
  times.forEach((t, k) => { const a = Math.round(t * SR); for (let i = 0; i < 2000; i++) x[a + i] = amps[k] * Math.exp(-i / 400) * Math.sin(i / 3); });
  const p = onsetPeaks([x], SR, times);
  assert.ok(pearson(p.map(db), amps.map(db)) > 0.999);
  const s = sine(220, 0.5, 1); const smooth = maxJump([s], SR, 0.1, 0.9);
  s.fill(0, Math.round(0.5 * SR));   // the voice disconnected mid-note
  assert.ok(maxJump([s], SR, 0.4, 0.6) > 10 * smooth);
});
