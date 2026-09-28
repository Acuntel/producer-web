// Brady's own voice, as arithmetic (masterprompt 5.7): the talk mic's ring, the last thing he said cut by its words,
// the tuner's notes and corrections, and the gate.
import test from "node:test";
import assert from "node:assert/strict";
import { Ring } from "../lib/audio/ring.ts";
import { talkRing, remember, lastSaid, samplesOf } from "../lib/voice/said.ts";
import { sungNotes, corrections, deviation, gateTake, nearestInScale, scaleOf, pitchFrames } from "../lib/voice/tune.ts";

const SR = 16000;
// A sung line: notes of A minor, each held 0.4 s, detuned by `cents`, with a 5 Hz vibrato of 20 cents.
function sing(midis, cents, sr = SR) {
  const len = Math.round(0.4 * sr), gap = Math.round(0.08 * sr), out = new Float32Array(midis.length * (len + gap) + sr / 4);
  let ph = 0, at = Math.round(sr / 8);
  midis.forEach((m, k) => {
    for (let i = 0; i < len; i++) { const t = i / sr; const hz = 440 * 2 ** ((m + (cents[k] ?? 0) / 100 + 0.2 * Math.sin(2 * Math.PI * 5 * t) / 12 - 69) / 12); ph += (2 * Math.PI * hz) / sr; const e = Math.min(1, i / (0.02 * sr), (len - i) / (0.03 * sr)); out[at + i] = 0.4 * e * (Math.sin(ph) + 0.4 * Math.sin(2 * ph) + 0.2 * Math.sin(3 * ph)); }
    at += len + gap;
  });
  return out;
}

test("the ring keeps the last 30 s by audio frame, and a gap is silence", () => {
  const r = new Ring(1, 100);
  r.push(new Float32Array([1, 2, 3]), 0); r.push(new Float32Array([4]), 5);
  assert.deepEqual(Array.from(r.slice(0, 6)), [1, 2, 3, 0, 0, 4]);
  r.push(new Float32Array(150).fill(7), 6);
  assert.equal(r.start, 56); assert.equal(r.slice(0, 60).length, 4);
});

test("what he just said is the utterance before the ask, cut by its words", () => {
  const ring = talkRing(SR);
  const line = new Float32Array(SR * 2).fill(0.1);
  ring.push(line, 1000);
  remember({ text: "la la la", startFrame: 1000, endFrame: 1000 + SR * 2, sampleRate: SR, words: [{ w: "la", start: 0.5, end: 0.8 }, { w: "la", start: 1.0, end: 1.3 }], at: 1 });
  remember({ text: "put what I just said in the song", startFrame: 1000 + SR * 3, endFrame: 1000 + SR * 5, sampleRate: SR, words: [], at: 2 });
  const u = lastSaid("put what I just said in the song");
  assert.equal(u.text, "la la la");
  const got = samplesOf(u);
  assert.ok(Math.abs(got.offsetSec - 0.42) < 1e-3);
  assert.ok(Math.abs(got.samples.length / SR - (1.3 + 0.25 - 0.42)) < 1e-3);
  remember({ text: "oh yeah", startFrame: 1000 + SR * 6, endFrame: 1000 + SR * 7, sampleRate: SR, words: [], at: 3 });
  assert.equal(lastSaid("put what I just said in the song").text, "oh yeah", "a typed ask is not an utterance: the newest is what he said");
});

test("gentle tuning moves each sung note toward the scale and keeps a far bend", () => {
  assert.equal(nearestInScale(61.3, scaleOf("A minor")), 62);
  assert.equal(nearestInScale(60.4, scaleOf("A minor")), 60);
  const x = sing([69, 72, 76, 74], [35, -30, 28, 90]);
  const { frames, hopSec } = pitchFrames(x, SR);
  const notes = sungNotes(frames, hopSec, "A minor");
  assert.equal(notes.length, 4);
  assert.deepEqual(notes.map((n) => Math.sign(n.cents)), [1, -1, 1, 1]);
  const c = corrections(notes, "gentle");
  assert.equal(c.filter((s) => s.semitones !== 0).length, 3, "the note 90 cents off is a bend and stays");
  assert.equal(corrections(notes, "hard").filter((s) => s.semitones !== 0).length, 4, "hard tuning moves every note");
  assert.ok(deviation(x, SR, "A minor").medianAbsCents >= 25);
});

test("the gate silences what is between phrases and the take never clips", () => {
  const x = sing([69, 72], [0, 0]); for (let i = 0; i < 400; i++) x[i] = 0.001 * Math.sin(i);
  x[x.length - 10] = 3;
  const g = gateTake(x, SR);
  let peak = 0; for (const v of g) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak <= 0.8911);
  assert.equal(g[100], 0);
});
