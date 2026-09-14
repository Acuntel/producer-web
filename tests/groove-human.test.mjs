import { test } from "node:test";
import assert from "node:assert/strict";
import { HUMAN_GROOVES, HUMAN_GROOVE_NAMES } from "../lib/song/grooveHuman.ts";
import { templateOffsets, applyGroove, cleanGroove, GROOVE_NAMES } from "../lib/song/groove.ts";

test("the measured drummer grooves are registered and well formed", () => {
  assert.ok(HUMAN_GROOVE_NAMES.length >= 10, `expected at least ten styles, got ${HUMAN_GROOVE_NAMES.length}`);
  for (const name of HUMAN_GROOVE_NAMES) {
    const g = HUMAN_GROOVES[name];
    assert.equal(g.timing.length, 16); assert.equal(g.accents.length, 16);
    assert.equal(g.timing[0], 0, `${name} timing is relative to the downbeat`);
    assert.ok(g.timing.every((t) => Math.abs(t) <= 0.25), `${name} timing stays inside a 16th`);
    assert.ok(g.n >= 4000, `${name} rests on at least 4000 hits`);
    assert.ok(GROOVE_NAMES.includes(name));
  }
});

test("human-funk: the off sixteenths land late and the backbeat is the loudest hit", () => {
  const t = templateOffsets("human-funk");
  const odd = t.timing.filter((_, i) => i % 2 === 1);
  const lateMs = (odd.reduce((a, b) => a + b, 0) / odd.length) * 500;
  assert.ok(lateMs > 4 && lateMs < 30, `off sixteenths late by ${lateMs.toFixed(1)} ms at 120`);
  assert.ok(t.accents[4] > 0.2 && t.accents[12] > 0.2, `backbeats accented: ${t.accents[4]} ${t.accents[12]}`);
  assert.ok(t.accents[1] < 0, "the second sixteenth is a ghost");
});

test("applyGroove moves a hit with a human groove and cleanGroove accepts the name", () => {
  const g = cleanGroove({ name: "human-dance", amount: 1, velocity: 0.5 });
  assert.ok(g && g.name === "human-dance");
  const hit = applyGroove(0.25, 90, g, () => 0.5);
  assert.notEqual(hit.beat, 0.25, "an off sixteenth moved");
  const down = applyGroove(0, 90, g, () => 0.5);
  assert.equal(down.beat, 0, "the downbeat stays put");
});
