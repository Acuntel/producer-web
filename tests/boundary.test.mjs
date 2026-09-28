import { test } from "node:test";
import assert from "node:assert/strict";
import { boundaryFor, onlyMuteSolo, nextBoundary } from "../lib/engine/boundary.ts";
import { hashEvents } from "../lib/engine/steady.ts";
import { SEED_SONG } from "../lib/song/seeds.ts";

const PPQ = 192, BAR = 4 * PPQ;
const clone = (s) => JSON.parse(JSON.stringify(s));

test("content lands on the bar, structure on the phrase, the mixer on the beat, mute and solo at once", () => {
  const s = clone(SEED_SONG);
  const hat = s.tracks.find((t) => t.role === "hat");
  const busier = clone(s); busier.tracks.find((t) => t.id === hat.id).notes.push([42, 0.75, 0.25, 90]);
  assert.equal(boundaryFor(s, busier), "bar");
  const louder = clone(s); louder.tracks.find((t) => t.id === hat.id).volume += 3;
  assert.equal(boundaryFor(s, louder), "beat");
  const faster = clone(s); faster.bpm += 2;
  assert.equal(boundaryFor(s, faster), "phrase");
  const looped = clone(s); looped.loop = { startBar: 5, endBar: 9 };
  assert.equal(boundaryFor(s, looped), "phrase");
  const muted = clone(s); muted.tracks.find((t) => t.id === hat.id).mute = true;
  assert.equal(boundaryFor(s, muted), "now");
  assert.ok(onlyMuteSolo(s, muted));
  assert.equal(boundaryFor(null, s), "now");
  const both = clone(busier); both.bpm += 1;
  assert.equal(boundaryFor(s, both), "phrase", "the latest boundary of what changed wins");
});

test("the next boundary is always after the frontier, laid one tick before, and a loop's end is its wrap", () => {
  assert.deepEqual(nextBoundary(10, "bar", PPQ, null), { tick: BAR, layAt: BAR - 1, wraps: false });
  // Sitting right on the lay tick: the boundary after that one.
  assert.deepEqual(nextBoundary(BAR - 1, "bar", PPQ, null), { tick: 2 * BAR, layAt: 2 * BAR - 1, wraps: false });
  assert.deepEqual(nextBoundary(BAR + 5, "beat", PPQ, null).tick, BAR + PPQ);
  assert.deepEqual(nextBoundary(BAR + 5, "phrase", PPQ, null).tick, 4 * BAR);
  // A loop over bars 5 to 8: from inside bar 8, the next bar line is the wrap to bar 5.
  const loop = { start: 4 * BAR, end: 8 * BAR };
  assert.deepEqual(nextBoundary(7 * BAR + 100, "bar", PPQ, loop), { tick: 4 * BAR, layAt: 8 * BAR - 1, wraps: true });
  assert.deepEqual(nextBoundary(5 * BAR + 100, "bar", PPQ, loop), { tick: 6 * BAR, layAt: 6 * BAR - 1, wraps: false });
  // A phrase inside a 4-bar loop is always the wrap.
  assert.equal(nextBoundary(5 * BAR, "phrase", PPQ, loop).tick, 4 * BAR);
});

test("a note's length counts at 960 PPQ in the content address", () => {
  const a = [{ beat: 0, note: [36, 0, 0.25, 100] }];
  const b = [{ beat: 0, note: [36, 0, 0.25 + 1 / 64, 100] }];
  assert.notEqual(hashEvents(a), hashEvents(b));
});
