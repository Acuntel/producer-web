import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeEcho } from "../hooks/useVoiceLoop.ts";

test("barge-in: the producer's own sentence is echo, a new instruction is not", () => {
  const spoken = "Dropped the bass filter down to 520 and pushed the drive, it growls now instead of buzzing.";
  assert.equal(looksLikeEcho("dropped the bass filter down and pushed the drive", spoken), true);
  assert.equal(looksLikeEcho("it growls now instead of buzzing", spoken), true);
  assert.equal(looksLikeEcho("make the hats louder", spoken), false);
  assert.equal(looksLikeEcho("stop, take me to the drop", spoken), false);
  assert.equal(looksLikeEcho("anything at all", null), false);
});
