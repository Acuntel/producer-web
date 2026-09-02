import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { laneRecipe, laneRecipeData, laneList, RECIPE_MAX_CHARS } from "../lib/brain/lanes.ts";
import { LANE_INDEX, laneNamed, laneHomeBpm, dnaLaneFor, laneKicksPerBar } from "../lib/brain/laneNames.ts";
import { rolloutIntent, rolloutLine, localIntent } from "../lib/brain/local.ts";
import { kitStyleFor } from "../lib/engine/kits.ts";
import { migrateSong } from "../lib/song/migrate.ts";
import { ROLLOUTS } from "../lib/brain/rollouts.ts";
import { scheduleEvents } from "../lib/engine/schedule.ts";
import { SEED_MELODIC_HOUSE, SEED_DEEP_HOUSE } from "../lib/song/seedsLanes.ts";
import { SEED_TECH_HOUSE } from "../lib/song/seeds.ts";
import { normalizeAction } from "../lib/brain/parse.ts";

const RESEARCHED = ["melodic-house", "afro-house", "deep-house", "uk-garage", "jersey-club", "trap-club", "techno", "trance"];
const isGrid = (s) => typeof s === "string" && /^[XxgoO.1-9|\s]+$/.test(s);

test("lanes.json parses and every lane carries bpm, drums, arrangement and mix", () => {
  const raw = JSON.parse(readFileSync(new URL("../knowledge/lanes/lanes.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(raw.lanes) && raw.lanes.length >= 8);
  for (const id of RESEARCHED) {
    const l = raw.lanes.find((x) => x.id === id);
    assert.ok(l, `lane ${id} present`);
    assert.ok(Array.isArray(l.bpm) && l.bpm.length === 3 && l.bpm[0] <= l.bpm[1] && l.bpm[1] <= l.bpm[2], `${id} bpm lo <= home <= hi`);
    assert.ok(isGrid(l.drums.kick), `${id} kick grid`);
    assert.ok(Object.values(l.drums).length >= 3, `${id} has a drum kit`);
    assert.ok(Array.isArray(l.arrangement) && l.arrangement.length >= 5, `${id} arrangement`);
    assert.ok(l.arrangement.some((s) => /drop/i.test(s.name)), `${id} has a drop`);
    assert.ok(l.arrangement.every((s) => typeof s.bars === "number" && s.bars > 0), `${id} section bars`);
    assert.ok(Array.isArray(l.mix.lufs) && Array.isArray(l.mix.subLow) && typeof l.mix.sidechainDb === "number", `${id} mix targets`);
    assert.ok(l.bass && l.bass.wave, `${id} bass recipe`);
    assert.ok(l.harmony && Array.isArray(l.harmony.progressions), `${id} progressions`);
    assert.ok(!/[–—]/.test(JSON.stringify(l)), `${id} has no em or en dashes`);
  }
});

test("laneRecipe stays under 2.5 KB and carries the numbers; laneList covers every lane with its home tempo", () => {
  assert.equal(RECIPE_MAX_CHARS, 2500);
  for (const id of RESEARCHED) {
    const r = laneRecipe(id);
    const d = laneRecipeData(id);
    assert.ok(r && r.length <= RECIPE_MAX_CHARS, `${id} recipe ${r?.length} chars`);
    assert.ok(r.startsWith(`LANE RECIPE "${id}"`));
    assert.ok(r.includes(`home ${d.bpm[1]}`), `${id} home tempo in the block`);
    assert.ok(r.includes(d.drums.kick), `${id} kick grid in the block`);
    for (const label of ["DRUMS", "BASS", "HARMONY", "ARRANGEMENT", "MIX TARGETS", "FEEL WORDS"]) assert.ok(r.includes(label), `${id} ${label}`);
    assert.ok(!/[–—]/.test(r));
  }
  assert.equal(laneRecipe("tech-house"), null, "the home lanes live in the persona");
  assert.equal(laneRecipe("nope"), null);
  assert.ok(laneRecipe("afro-house", "the user just named this lane").includes("the user just named this lane"));
  const list = laneList();
  assert.ok(list.length >= 10);
  for (const l of LANE_INDEX) {
    const row = list.find((x) => x.id === l.id);
    assert.ok(row, `${l.id} listed`);
    assert.equal(row.home, l.home, `${l.id} home tempo agrees between the index and lanes.json`);
    assert.equal(laneHomeBpm(l.id), l.home);
  }
  assert.deepEqual(list.map((l) => l.id).slice(0, 2), ["tech-house", "hard-house"]);
});

test("rolloutIntent maps lane names and aliases to a newSong rollout in that lane", () => {
  const lane = (t) => rolloutIntent(t, false);
  assert.deepEqual(lane("make it afro house"), { kind: "newSong", lane: "afro-house" });
  assert.deepEqual(lane("make it melodic techno"), { kind: "newSong", lane: "melodic-house" });
  assert.deepEqual(lane("jersey club style"), { kind: "newSong", lane: "jersey-club" });
  assert.deepEqual(lane("let's do some uk garage"), { kind: "newSong", lane: "uk-garage" });
  assert.deepEqual(lane("give me a trap edit"), { kind: "newSong", lane: "trap-club" });
  assert.deepEqual(lane("go techno"), { kind: "newSong", lane: "techno" });
  assert.deepEqual(lane("switch to trance"), { kind: "newSong", lane: "trance" });
  assert.deepEqual(lane("make it deep house"), { kind: "newSong", lane: "deep-house" });
  assert.deepEqual(lane("make it sound like kettama"), { kind: "newSong", lane: "hard-house" });
  assert.deepEqual(lane("new song, KETTAMA style, surprise me"), { kind: "newSong", lane: "hard-house" });
  assert.deepEqual(lane("make it speed garage"), { kind: "newSong", lane: "hard-house" }, "speed garage is the 4x4 lane, not 2-step");
  assert.deepEqual(lane("make it garage"), { kind: "newSong", lane: "uk-garage" });
  assert.deepEqual(lane("flip this"), { kind: "newSong", lane: "jersey-club" });
  assert.deepEqual(lane("amapiano"), { kind: "newSong", lane: "afro-house" });
  assert.deepEqual(lane("make it like the reference"), { kind: "newSong" }, "the reference rule wins");
  assert.equal(lane("make it darker"), null, "feel words stay ops");
  assert.equal(lane("make it epic"), null, "epic is a move inside a lane, not a lane switch");
  assert.equal(lane("the trance gate on the pad"), null);
  assert.equal(lane("what do techno kicks usually sound like"), null, "questions about a lane are conversation");
  assert.equal(lane("turn the hats down"), null);
  assert.equal(laneNamed("something with black coffee energy"), "afro-house");
  assert.equal(laneNamed("nothing here"), null);
  assert.ok(rolloutLine({ kind: "newSong", lane: "afro-house" }).includes("122"));
  assert.ok(!/[–—]/.test(rolloutLine({ kind: "newSong", lane: "jersey-club" })));
  assert.equal(localIntent("make it trance", SEED_TECH_HOUSE), null, "lane asks are not local mixer moves");
  assert.equal(normalizeAction({ type: "rollout", kind: "newSong", lane: "techno" }).lane, "techno");
  assert.equal(normalizeAction({ type: "rollout", kind: "newSong", lane: "Afro House" }).lane, "afro-house", "display names normalize to ids");
  assert.equal(normalizeAction({ type: "rollout", kind: "newSong", lane: "custom" }).lane, "custom");
  assert.equal(normalizeAction({ type: "rollout", kind: "newSong" }).lane, undefined);
});

test("engine kit follows the lane's home tempo; unknown lanes survive migration; DNA bands map", () => {
  assert.equal(kitStyleFor("tech-house"), "tech-house");
  assert.equal(kitStyleFor("hard-house"), "hard-house");
  assert.equal(kitStyleFor("jersey-club"), "hard-house");
  assert.equal(kitStyleFor("trap-club"), "hard-house");
  assert.equal(kitStyleFor("trance"), "hard-house");
  assert.equal(kitStyleFor("techno"), "tech-house");
  assert.equal(kitStyleFor("uk-garage"), "tech-house");
  assert.equal(kitStyleFor("deep-house"), "tech-house");
  assert.equal(kitStyleFor("custom", 142), "hard-house");
  assert.equal(kitStyleFor("custom", 124), "tech-house");
  assert.equal(kitStyleFor("custom"), "tech-house");
  const m = migrateSong({ ...SEED_TECH_HOUSE, lane: "afro-house" });
  assert.equal(m.lane, "afro-house");
  assert.equal(migrateSong({ ...SEED_TECH_HOUSE, lane: 7 }).lane, "tech-house");
  assert.equal(dnaLaneFor("afro-house"), "melodic");
  assert.equal(dnaLaneFor("jersey-club"), "hard-house");
  assert.equal(dnaLaneFor("tech-house"), "tech-house");
  assert.equal(laneKicksPerBar("uk-garage"), 2);
  assert.equal(laneKicksPerBar("nope"), 4);
});

test("the drums check is lane-gated on kick density", () => {
  const drums = ROLLOUTS.newSong.find((s) => s.id === "drums");
  const facts = (kickDensity) => ({ structure: { sections: [{ label: "drop", kickDensity, bands: { sub: 0.3, low: 0.3 }, lufs: -8 }] } });
  const s = SEED_TECH_HOUSE;
  assert.equal(drums.check({ song: s, facts: facts(4), reference: null, lane: "tech-house" }), null);
  assert.ok(drums.check({ song: s, facts: facts(1.5), reference: null, lane: "tech-house" }).includes("want 4"));
  assert.equal(drums.check({ song: s, facts: facts(2), reference: null, lane: "uk-garage" }), null, "2-step is allowed two kicks");
  assert.ok(drums.check({ song: s, facts: facts(4), reference: null, lane: "trap-club" }).includes("not four on the floor"));
  assert.equal(drums.check({ song: s, facts: facts(1.5), reference: null, lane: "trap-club" }), null);
  assert.ok(drums.check({ song: s, facts: facts(2), reference: null, lane: "jersey-club" }).includes("want 5"));
});

test("the two lane seeds schedule, stay in key and pass the rollout checks", () => {
  const step = (id) => ROLLOUTS.newSong.find((s) => s.id === id);
  for (const s of [SEED_MELODIC_HOUSE, SEED_DEEP_HOUSE]) {
    const sch = scheduleEvents(s);
    assert.equal(sch.totalBeats, s.sections.reduce((a, x) => a + x.bars * 4, 0));
    assert.ok(sch.kickBeats.length > 100, `${s.title} has a kick`);
    for (const t of s.tracks) {
      for (const n of [...t.notes, ...Object.values(t.patterns ?? {}).flat()]) assert.ok(n[1] >= 0 && n[1] < t.loopBeats && n[3] >= 1 && n[3] <= 127, `${s.title} ${t.id} note inside its loop`);
    }
    for (const sec of s.sections) for (const id of sec.active) assert.ok(s.tracks.some((t) => t.id === id), `${s.title} ${sec.id} activates ${id}`);
    const ctx = { song: s, facts: null, reference: null, lane: s.lane };
    for (const id of ["blueprint", "bass", "harmony", "hook", "craft"]) assert.equal(step(id).check(ctx), null, `${s.title} passes ${id}`);
    assert.ok(!/[–—]/.test(JSON.stringify(s)));
  }
  assert.equal(SEED_MELODIC_HOUSE.lane, "melodic-house");
  assert.equal(SEED_DEEP_HOUSE.lane, "deep-house");
  assert.equal(kitStyleFor(SEED_MELODIC_HOUSE.lane, SEED_MELODIC_HOUSE.bpm), "tech-house");
});
