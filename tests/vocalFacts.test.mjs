// The vocal block of the facts (lib/ears/vocalFacts.ts): it rides on the record while the placed voice is in it, the
// critic turns its numbers into notes, and verify can hold a move to them.
import test from "node:test";
import assert from "node:assert/strict";
import { setVocalFacts, attachVocal, vocalFactsFor } from "../lib/ears/vocalFacts.ts";
import { vocalNotes } from "../lib/critic.ts";
import { verifyMove } from "../lib/brain/verify.ts";

const v = (o = {}) => ({ source: "Test", slot: "drop-hook:3", lands: "bar 17", tracks: ["vox_a_0"], anchorErrMs: 2, anchorErrBeats: 0.004, masked: 0.2, maskGapDb: 3, inScale: 0.8, chordFit: 0.9, leadCollisions: 0, crossesBoundary: false, pass: true, ...o });
const song = (ids) => ({ tracks: ids.map((id) => ({ id })) });

test("the block rides on the facts only while the placed voice is in the record", () => {
  setVocalFacts(v());
  assert.ok(vocalFactsFor(song(["kick", "vox_a_0"])));
  assert.equal(vocalFactsFor(song(["kick"])), null);
  const f = attachVocal({ read: "" }, song(["vox_a_0"]));
  assert.equal(f.vocal.slot, "drop-hook:3");
  assert.equal(attachVocal({ ...f }, song(["kick"])).vocal, undefined);
});

test("the critic's vocal notes come from the numbers, and a clean voice gets none", () => {
  assert.equal(vocalNotes(v()).length, 0);
  const notes = vocalNotes(v({ anchorErrMs: 60, anchorErrBeats: 0.13, masked: 0.8, inScale: 0.3, leadCollisions: 4, crossesBoundary: true }));
  assert.deepEqual(notes.map((n) => n.area), ["vocal", "vocal", "vocal", "vocal", "vocal"]);
  assert.ok(notes.every((n) => !/[–—]/.test(n.what + n.why + n.fix)), "no em or en dashes");
});

test("verify holds a move to the voice's numbers", () => {
  const before = { vocal: v({ masked: 0.6 }) }, after = { vocal: v({ masked: 0.3 }) };
  assert.equal(verifyMove(before, after, [{ metric: "vocalMasked", dir: "down" }]), null);
  assert.match(verifyMove(before, after, [{ metric: "vocalMasked", dir: "up" }]), /vocalMasked/);
});
