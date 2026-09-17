import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps } from "../lib/song/ops.ts";
import { SEED_TECH_HOUSE } from "../lib/song/seeds.ts";

test("a transition leans the build into the drop: filter rise, a gap on everything but the kick, an energy nudge", () => {
  const song = JSON.parse(JSON.stringify(SEED_TECH_HOUSE));
  const build = song.sections.find((s) => /build/i.test(s.name)) ?? song.sections[1];
  const next = song.sections.find((s) => s.id === song.arrangement[song.arrangement.indexOf(build.id) + 1]);
  const before = next?.energy ?? 0.6;
  const r = applyOps(song, [{ op: "transition", from: build.id, bars: 4, gap: true, lift: 0.1 }]);
  assert.equal(r.applied, 1, JSON.stringify(r.skipped));
  const b = r.song.sections.find((s) => s.id === build.id);
  const filt = b.automation.find((a) => a.track === "master" && a.param === "filter.cutoff");
  assert.ok(filt && filt.to > filt.from && filt.startBeat === (b.bars - 4) * 4, JSON.stringify(filt));
  const gaps = b.automation.filter((a) => a.param === "volume" && a.to === -60);
  assert.ok(gaps.length >= 1 && gaps.every((g) => r.song.tracks.find((t) => t.id === g.track)?.role !== "kick"), "the kick stays");
  const after = r.song.sections.find((s) => s.id === next.id);
  assert.ok(Math.abs((after.energy ?? 0) - Math.min(1, before + 0.1)) < 1e-9, `energy lifted: ${after.energy}`);
});
