import { test } from "node:test";
import assert from "node:assert/strict";
import { detectRootPitch, transposeForRoot } from "../lib/engine/pitch.ts";

const tone = (hz, sec = 0.5, sr = 44100) => { const n = Math.floor(sec * sr); const x = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / sr; x[i] = (0.6 * Math.sin(2 * Math.PI * hz * t) + 0.25 * Math.sin(4 * Math.PI * hz * t) + 0.1 * Math.sin(6 * Math.PI * hz * t)) * Math.exp(-t * 2); } return x; };

test("a tone's root comes back as the right MIDI note", () => {
  for (const [hz, midi] of [[110, 45], [220, 57], [261.63, 60], [440, 69], [55, 33]]) {
    const r = detectRootPitch(tone(hz), 44100);
    assert.equal(r.midi, midi, `${hz} Hz -> ${JSON.stringify(r)}`); assert.ok(r.confidence > 0.6);
  }
});

test("noise has no root, and the transpose folds to within a tritone", () => {
  const n = new Float32Array(22050); let s = 1; for (let i = 0; i < n.length; i++) { s = (s * 16807) % 2147483647; n[i] = (s / 2147483647) * 2 - 1; }
  assert.equal(detectRootPitch(n, 44100).midi, null);
  assert.equal(transposeForRoot(57), 3); assert.equal(transposeForRoot(60), 0); assert.equal(transposeForRoot(64), -4); assert.equal(transposeForRoot(null), 0);
});
