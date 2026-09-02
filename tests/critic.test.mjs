import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCritic } from "../lib/critic.ts";
test("critic replies parse defensively and cap at 6", () => {
  const r = parseCritic({ headline: "Bass heavy, mids thin.", notes: [{ area: "mix", severity: 3, what: "Drop low end is 13 percent over the reference", why: "sub+low 0.83 vs 0.57", fix: "pull sub -3 dB, raise stabs +3", section: "drop", ops: [{ op: "set", track: "sub", path: "volume", value: -9 }] }, { area: "nope", severity: 9, what: "x" }, "garbage", ...Array.from({ length: 8 }, (_, i) => ({ what: `n${i}` }))] });
  assert.equal(r.headline, "Bass heavy, mids thin.");
  assert.equal(r.notes.length, 6);
  assert.equal(r.notes[0].severity, 3); assert.equal(r.notes[0].section, "drop"); assert.equal(r.notes[0].ops.length, 1); assert.equal(r.notes[0].status, "open");
  assert.equal(r.notes[1].area, "mix"); assert.equal(r.notes[1].severity, 1);
  assert.deepEqual(parseCritic(null).notes, []);
});
