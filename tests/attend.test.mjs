import { test } from "node:test";
import assert from "node:assert/strict";
import { quickGate, stripWake } from "../lib/brain/attend.ts";

test("attention: wake word, fillers, commands, room talk", () => {
  assert.deepEqual(stripWake("hey producer, make the bass darker"), { text: "make the bass darker", woke: true });
  assert.deepEqual(stripWake("producer play"), { text: "play", woke: true });
  assert.equal(stripWake("make it louder").woke, false);
  const playing = { paused: false, recentMove: false }, paused = { paused: true, recentMove: false }, afterMove = { paused: false, recentMove: true };
  assert.equal(quickGate("um", playing), "ignore");
  assert.equal(quickGate("yeah", playing), "ignore");
  assert.equal(quickGate("nice", afterMove), "send");          // a verdict right after a move
  assert.equal(quickGate("nice", playing), "ignore");
  assert.equal(quickGate("make the kick harder", playing), "send");
  assert.equal(quickGate("make the kick harder", paused), "send");
  assert.equal(quickGate("take me to the drop", paused), "send");
  assert.equal(quickGate("what key is this in", playing), "send");
  assert.equal(quickGate("I will be there at eight, order me a burrito and tell him I said hi", playing), "ignore");
  assert.equal(quickGate("yeah I think we should just go tomorrow", paused), "ignore");
  assert.equal(quickGate("that hook is insane though", playing), "ask");
  assert.equal(quickGate("this reminds me of a summit record", playing), "ask");
});
