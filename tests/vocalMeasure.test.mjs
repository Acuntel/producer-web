// The vocal check's measurements (lib/ears/vocalMeasure.ts), each held to a signal with a known answer.
import test from "node:test";
import assert from "node:assert/strict";
import { rmsEnvelope, stretchEnvelope, alignLag, maskedShare, pitchClasses, edgeDb, hopOf } from "../lib/ears/vocalMeasure.ts";

const SR = 22050;
// A "sung" line: three syllables of a harmonic tone with soft attacks, silence around them.
function line(sr, at, f0 = 220, len = 2) {
  const x = new Float32Array(Math.round(sr * (at + len + 0.5)));
  const syl = [[0, 0.4], [0.55, 0.5], [1.2, 0.7]];
  for (const [a, l] of syl) {
    const i0 = Math.round((at + a) * sr), n = Math.round(l * sr);
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / (0.02 * sr)) * Math.min(1, (n - i) / (0.05 * sr));
      const t = i / sr;
      x[i0 + i] += env * (0.5 * Math.sin(2 * Math.PI * f0 * t) + 0.2 * Math.sin(4 * Math.PI * f0 * t) + 0.1 * Math.sin(6 * Math.PI * f0 * t));
    }
  }
  return x;
}

test("the envelope alignment finds where a line sits to within a millisecond, and a stretched line too", () => {
  const ref = line(SR, 0.05);
  const sig = line(SR, 1.2345);
  const hop = hopOf(SR);
  const { lag, corr } = alignLag(rmsEnvelope(ref, SR, hop), rmsEnvelope(sig, SR, hop), 300, 900);
  assert.ok(Math.abs(lag * hop - (1.2345 - 0.05)) < 0.001, `lag ${lag * hop}`);
  assert.ok(corr > 0.9);
  // The same line 5% slower: its envelope stretched by 1.05 lines up with a 5% slower render.
  const slow = new Float32Array(Math.round(ref.length * 1.05)); for (let i = 0; i < slow.length; i++) slow[i] = ref[Math.min(ref.length - 1, Math.floor(i / 1.05))];
  const placed = new Float32Array(slow.length + SR); placed.set(slow, Math.round(0.5 * SR));
  const r = alignLag(stretchEnvelope(rmsEnvelope(ref, SR, hop), 1.05), rmsEnvelope(placed, SR, hop), 100, 400);
  assert.ok(Math.abs(r.lag * hop - 0.5) < 0.003, `stretched lag ${r.lag * hop}`);
});

test("masking: a voice over silence is clear, a voice under loud noise in its band is buried", () => {
  const v = line(SR, 0.1, 440);
  const quiet = new Float32Array(v.length);
  let s = 1; const noise = new Float32Array(v.length).map(() => { s = (s * 16807) % 2147483647; return (s / 2147483647 - 0.5) * 2; });
  assert.equal(maskedShare(v, quiet, SR).masked, 0);
  assert.ok(maskedShare(v, noise, SR).masked > 0.8);
});

test("pitch classes: a sung A is A, and a clean edge is far below the peak", () => {
  const pcs = pitchClasses(line(SR, 0.1, 220), SR);
  assert.equal(pcs.indexOf(Math.max(...pcs)), 9);
  assert.ok(edgeDb(line(SR, 0.1), SR) < -30);
  const loudEdge = line(SR, 0.0); loudEdge.fill(0.3, 0, 400);
  assert.ok(edgeDb(loudEdge, SR) > -12);
});
