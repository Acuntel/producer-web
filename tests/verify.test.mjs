import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyMove } from "../lib/brain/verify.ts";

const facts = (o = {}) => ({
  spectrum: { centroidHz: o.centroid ?? 1600, mud: 0.05, harshness: 0.01, width: 0.3, bands: { sub: 0.55, low: 0.3, lowMid: 0.05, mid: 0.05, highMid: 0.03, air: o.air ?? 0.02 } },
  loudness: { integrated: o.lufs ?? -9 }, groove: { pump: o.pump ?? 0.6 },
  structure: { sections: [{ label: "drop", lufs: o.dropLufs ?? -9, energy: 1, centroidHz: o.dropCentroid ?? 1500, bands: { sub: 0.55, low: 0.3, lowMid: 0.05, mid: 0.05, highMid: 0.03, air: 0.02 } }] },
});

test("verifyMove: holds, contradicts, and flat", () => {
  assert.equal(verifyMove(facts(), facts({ centroid: 1200 }), [{ metric: "centroidHz", dir: "down" }]), null);
  const wrong = verifyMove(facts(), facts({ centroid: 1900 }), [{ metric: "centroidHz", dir: "down" }]);
  assert.ok(wrong && wrong.includes("supposed to go down"), wrong);
  const flat = verifyMove(facts(), facts({ centroid: 1610 }), [{ metric: "centroidHz", dir: "down" }]);
  assert.ok(flat && flat.includes("did not move"), flat);
  assert.equal(verifyMove(facts(), facts({ dropLufs: -7 }), [{ section: "drop", metric: "lufs", dir: "up" }]), null);
  assert.ok(verifyMove(facts(), facts({ dropLufs: -11 }), [{ section: "drop", metric: "lufs", dir: "up" }]));
  assert.equal(verifyMove(null, facts(), [{ metric: "pump", dir: "up" }]), null, "no baseline = nothing to contradict");
  assert.equal(verifyMove(facts(), facts({ air: 0.06 }), [{ metric: "air", dir: "up" }]), null);
});
