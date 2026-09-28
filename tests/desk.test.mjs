import { test } from "node:test";
import assert from "node:assert/strict";
import { SEED_TECH_HOUSE } from "../lib/song/seeds.ts";
import { scheduleEvents } from "../lib/engine/schedule.ts";
import { ownedAt, resyncPoints, valueAt } from "../lib/engine/automation.ts";
import { CEILING, PRESCALE, softCeiling } from "../lib/engine/ceiling.ts";

test("the soft ceiling is near unity at low levels, never reaches -1 dBFS, and bends overs up to +6 dBFS without a clamp", () => {
  for (const x of [0.05, 0.1]) assert.ok(Math.abs(softCeiling(x * PRESCALE) - x) / x < 0.01, `unity at ${x}`);
  assert.ok(Math.abs(softCeiling(0.25 * PRESCALE) - 0.25) / 0.25 < 0.03, "a quarter of a dB at -12 dBFS");
  let prev = -Infinity;
  for (let i = -100; i <= 100; i++) {
    const u = i / 100, y = softCeiling(u);   // the whole range a WaveShaper maps: signal from -2 to +2
    assert.ok(Math.abs(y) < CEILING, `below the ceiling at ${u}`);
    assert.ok(y > prev, "strictly rising: two overs never land on one value"); prev = y;
  }
  assert.ok(softCeiling(1) - softCeiling(0.99) > 1e-4, "still moving at the edge of the curve");
});

test("a cut fill ends every note before its gap: nothing rings into the silence before the drop", () => {
  const sch = scheduleEvents(SEED_TECH_HOUSE);
  for (const s of sch.sectionStarts.filter((x) => x.fill === "cut")) {
    const end = s.startBeat + s.beats;
    for (const [id, evs] of sch.perTrack) {
      const role = SEED_TECH_HOUSE.tracks.find((t) => t.id === id).role;
      const cutAt = end - (["kick", "bass", "sub"].includes(role) ? 2 : 0.5);
      for (const e of evs) {
        if (e.beat < s.startBeat || e.beat >= end) continue;
        const localStart = e.beat - s.startBeat; const written = Math.round(localStart * 4) / 4;
        assert.ok(written + e.note[2] <= (cutAt - s.startBeat) + 0.02 + 1e-9, `${id} at ${e.beat} rings past ${cutAt}`);
      }
    }
  }
});

test("an automation owns its parameter to the end of its section; every section start and the loop wrap put it back", () => {
  const sch = scheduleEvents(SEED_TECH_HOUSE);
  const outro = sch.sectionStarts.find((x) => x.id === "outro");
  const fade = sch.automation.find((a) => a.track === "master" && a.param === "volume");
  assert.ok(ownedAt(sch.automation, sch.sectionStarts, outro.startBeat + 10).get("master")?.has("volume"), "the outro fade owns the master volume");
  assert.ok(!ownedAt(sch.automation, sch.sectionStarts, outro.startBeat - 1).get("master")?.has("volume"), "not before it starts");
  const points = resyncPoints(sch.automation, sch.sectionStarts, 0);
  const atZero = points.find((p) => p.beat === 0);
  assert.ok(atZero.items.some((r) => r.owner === "master" && r.param === "volume" && r.kind === "base"), "the wrap brings the master back to base");
  assert.ok(!atZero.items.some((r) => r.owner === "pad" && r.param === "filter.cutoff"), "the intro's own pad sweep starts there and is left to it");
  const mid = outro.startBeat + 16;
  const inside = resyncPoints(sch.automation, sch.sectionStarts, mid).find((p) => p.beat === mid);
  const ramp = inside.items.find((r) => r.owner === "master" && r.param === "volume");
  assert.equal(ramp.kind, "ramp"); assert.ok(Math.abs(ramp.from - valueAt(fade, mid)) < 1e-9); assert.ok(Math.abs(ramp.from - -9) < 1e-9, "halfway down the fade");
});
