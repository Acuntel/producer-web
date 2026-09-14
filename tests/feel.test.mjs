import { test } from "node:test";
import assert from "node:assert/strict";
import { feelOf, feelFromFacts } from "../lib/brain/feel.ts";

test("a slow minor pad reads as ache and drag", () => {
  const f = feelOf({ mode: "minor", tempo: 72, energy: 0.2, acousticness: 0.7, attackSlow: true });
  assert.ok(f.valence < 0.4, `valence ${f.valence}`);
  assert.ok(f.arousal < 0.4, `arousal ${f.arousal}`);
  assert.ok(f.words.includes("gut") || f.words.includes("ache"), f.words.join(","));
});

test("a 142 saturated minor drop reads as rush and weight", () => {
  const f = feelOf({ mode: "minor", tempo: 142, energy: 0.95, harshness: 0.12, syncopation: 0.5 });
  assert.ok(f.arousal >= 0.75, `arousal ${f.arousal}`);
  assert.ok(f.words.includes("rush") || f.words.includes("weight"), f.words.join(","));
});

test("a bright major pop record at 120 reads as sun", () => {
  const f = feelOf({ mode: "major", tempo: 120, energy: 0.8, valencePrior: 0.8, centroidHz: 2800 });
  assert.ok(f.valence >= 0.62, `valence ${f.valence}`);
  assert.ok(f.words.includes("sun"), f.words.join(","));
});

test("the ears' facts map without throwing and carry the line", () => {
  const f = feelFromFacts({ key: { mode: "minor" }, tempo: { bpm: 126 }, loudness: { integrated: -8.5 }, spectrum: { centroidHz: 2400, harshness: 0.09, mud: 0.2, bands: { lowMid: 0.13 } }, groove: { transientsPerBeat: 6 } });
  assert.ok(f && /^feel: /.test(f.line), f?.line);
  assert.equal(feelFromFacts(null), null);
});
