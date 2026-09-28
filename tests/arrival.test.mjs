import { test } from "node:test";
import assert from "node:assert/strict";
import { cutId } from "../lib/engine/cuts.ts";
import { referenceFromWorker } from "../lib/ears/fromWorker.ts";
import { compare } from "../lib/ears/compare.ts";

test("a cut is named by what it is: the same cut is the same id, a different one is not", () => {
  const a = cutId("stem_job1_vocals", 30.0004, 3.2, "vox");
  assert.equal(a, cutId("stem_job1_vocals", 30, 3.2, "vox"), "a tenth of a millisecond is the same cut");
  assert.match(a, /^cut:[0-9a-z]+$/);
  assert.notEqual(a, cutId("stem_job1_vocals", 30.5, 3.2, "vox"));
  assert.notEqual(a, cutId("stem_job2_vocals", 30, 3.2, "vox"));
  assert.notEqual(a, cutId("stem_job1_vocals", 30, 3.2, "grab:audio"));
});

test("a reference from the worker's numbers keeps what it measured and leaves the rest unknown", () => {
  const f = referenceFromWorker({ bpm: 124, tempoConfidence: 0.8, key: "A minor", durationSec: 200, bars: 103, dropAt: 31, blocks: [{ bar: 1, at: 0, energy: 0.3 }, { bar: 17, at: 31, energy: 1 }] }, { chords: ["Am", "F"] }, "Test");
  assert.equal(f.tempo.bpm, 124); assert.equal(f.key.mode, "minor"); assert.equal(f.structure.dropAt, 31);
  assert.equal(f.structure.sections.length, 2); assert.equal(f.structure.sections[1].label, "drop");
  assert.ok(Number.isNaN(f.loudness.integrated)); assert.ok(Number.isNaN(f.spectrum.bands.sub));
  // Compared with a render, it speaks of tempo and key and says nothing of loudness or the spectrum.
  const render = { ...f, tempo: { ...f.tempo, bpm: 124 }, loudness: { integrated: -9, shortTermMax: -7, range: 3, crest: 8, peak: -1 }, spectrum: { bands: { sub: 0.3, low: 0.3, lowMid: 0.1, mid: 0.1, highMid: 0.1, air: 0.1 }, centroidHz: 900, mud: 0.2, harshness: 0.1, width: 0.3 } };
  const c = compare(render, f);
  assert.match(c.text, /Tempo matches/); assert.match(c.text, /Keys match/);
  assert.doesNotMatch(c.text, /Loudness|low end|NaN/);
});
