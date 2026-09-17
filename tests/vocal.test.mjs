// The phrase finder, on audio whose phrases are known exactly.
import test from "node:test";
import assert from "node:assert/strict";
import { findPhrases, pickPhrase, tuneFor, leadIn, envelope } from "../lib/song/vocal.ts";

const SR = 22050;

// A stem: quiet room, with bursts where the voice is. Amplitudes and times are the answer key.
function stem(bursts, seconds = 12, floor = 0.0006) {
  const y = new Float32Array(Math.round(seconds * SR));
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  for (let i = 0; i < y.length; i++) y[i] = rnd() * floor;
  for (const [from, to, amp] of bursts) {
    const a = Math.round(from * SR), b = Math.round(to * SR);
    for (let i = a; i < b && i < y.length; i++) {
      const t = (i - a) / SR;
      const fade = Math.min(1, t / 0.02, (b - i) / SR / 0.02);
      y[i] += Math.sin(2 * Math.PI * 220 * t) * amp * fade + rnd() * amp * 0.1;
    }
  }
  return y;
}

test("the envelope follows the voice and the room", () => {
  const y = stem([[1, 2, 0.5]]);
  const env = envelope(y, SR);
  const at = (s) => env[Math.round(s / 0.01)];
  assert.ok(at(1.5) > at(0.5) + 20, `a phrase should sit well above the room: ${at(1.5)} vs ${at(0.5)}`);
});

test("phrases are found where the voice is, and breaths between them are not phrases", () => {
  const p = findPhrases(stem([[1, 2.2, 0.5], [4, 4.1, 0.4], [6, 8, 0.45]]), SR);
  assert.equal(p.length, 2, `two phrases, not the tenth of a second breath: got ${JSON.stringify(p.map((x) => [x.startSec, x.endSec]))}`);
  assert.ok(Math.abs(p[0].startSec - 1) < 0.1 && Math.abs(p[0].endSec - 2.2) < 0.15, `first phrase 1.0 to 2.2: ${p[0].startSec} to ${p[0].endSec}`);
  assert.ok(Math.abs(p[1].startSec - 6) < 0.1, `second phrase starts at 6: ${p[1].startSec}`);
});

test("a gap shorter than a breath joins one phrase, a longer one splits it", () => {
  const joined = findPhrases(stem([[1, 1.8, 0.5], [1.9, 2.6, 0.5]]), SR);
  assert.equal(joined.length, 1, "a tenth of a second between words is one phrase");
  const split = findPhrases(stem([[1, 1.8, 0.5], [3, 3.8, 0.5]]), SR);
  assert.equal(split.length, 2, "a second of silence is two phrases");
});

test("the hook is the loud, full line, not the quiet short one", () => {
  const p = findPhrases(stem([[1, 1.5, 0.05], [4, 6, 0.6]]), SR);
  const pick = pickPhrase(p);
  assert.ok(pick && Math.abs(pick.startSec - 4) < 0.15, `the loud two second line should win: ${JSON.stringify(pick)}`);
});

test("quoted words point at the phrase that carries them", () => {
  const p = findPhrases(stem([[1, 2, 0.6], [5, 7, 0.6]]), SR);
  const pick = pickPhrase(p, { said: "hold on", words: [{ at: 5.2, text: "hold on tight" }] });
  assert.ok(pick && Math.abs(pick.startSec - 5) < 0.2, `the quoted line is the second one: ${JSON.stringify(pick)}`);
});

test("tuning moves a voice into the key, and refuses when the move would wreck it", () => {
  assert.equal(tuneFor(60, "D minor"), 2);       // C up to D
  assert.equal(tuneFor(62, "D minor"), 0);
  assert.equal(tuneFor(59, "C minor"), 1);       // B up to C
  assert.equal(tuneFor(66, "C minor"), null);    // six semitones: left alone and said so
  assert.equal(tuneFor(null, "C minor"), null);
});

test("the lead in puts the last word on the downbeat", () => {
  assert.deepEqual(leadIn(32, 6), { startBeat: 26, cut: false });
  assert.deepEqual(leadIn(32, 6, 2), { startBeat: 24, cut: false });
  assert.deepEqual(leadIn(4, 6), { startBeat: 0, cut: true });   // longer than the section: it starts at the top
});
