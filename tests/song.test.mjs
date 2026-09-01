import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps } from "../lib/song/ops.ts";
import { migrateSong } from "../lib/song/migrate.ts";
import { SEED_TECH_HOUSE, SEED_HARD_HOUSE } from "../lib/song/seeds.ts";
import { scheduleEvents, loopBounds, locate, audibleTracks } from "../lib/engine/schedule.ts";

const seed = () => JSON.parse(JSON.stringify(SEED_TECH_HOUSE));

test("ops: set nested path, notes, add/remove track, mute/solo", () => {
  const { song, applied, skipped } = applyOps(seed(), [
    { op: "set", track: "bass", path: "fx.filter.cutoff", value: 420 },
    { op: "set", track: "master", path: "filter.cutoff", value: 900 },
    { op: "set", track: "song", path: "humanize.swing", value: 0.6 },
    { op: "notes", track: "hat", pattern: "B", notes: [[42, 0.5, 0.1, 90], [42, 1.5, 0.1, 80]] },
    { op: "addTrack", track: { id: "lead", name: "Lead", role: "lead", volume: -8, loopBeats: 8, notes: [[74, 0, 0.5, 100]] }, after: "bass" },
    { op: "mute", track: "pad" }, { op: "solo", track: "kick" },
    { op: "bogus" }, { op: "set", track: "nope", path: "volume", value: 0 },
    { op: "set", track: "bass", path: "__proto__.polluted", value: 1 },
  ]);
  assert.equal(applied, 7); assert.equal(skipped.length, 3);
  assert.equal(song.tracks.find((t) => t.id === "bass").fx.filter.cutoff, 420);
  assert.equal(song.master.filter.cutoff, 900);
  assert.equal(song.humanize.swing, 0.6);
  assert.deepEqual(song.tracks.find((t) => t.id === "hat").patterns.B, [[42, 0.5, 0.1, 90], [42, 1.5, 0.1, 80]]);
  assert.equal(song.tracks[song.tracks.findIndex((t) => t.id === "bass") + 1].id, "lead");
  assert.equal(song.tracks.find((t) => t.id === "pad").mute, true);
  assert.equal(song.tracks.find((t) => t.id === "kick").solo, true);
  assert.equal(({}).polluted, undefined);
  const r2 = applyOps(song, [{ op: "removeTrack", track: "lead" }, { op: "unsolo", track: "all" }, { op: "unmute", track: "all" }]);
  assert.ok(!r2.song.tracks.some((t) => t.id === "lead"));
  assert.ok(r2.song.tracks.every((t) => !t.solo && !t.mute));
});

test("ops: sections, arrangement, variants, automation, transpose, tempo, loop", () => {
  const { song, skipped } = applyOps(seed(), [
    { op: "section", section: { id: "drop3", name: "Drop 3", bars: 8, active: ["kick", "bass"], fill: "none" }, after: "drop2" },
    { op: "active", section: "drop3", add: ["clap"], remove: ["bass"] },
    { op: "variant", section: "drop3", track: "hat", pattern: "sparse" },
    { op: "automate", section: "drop3", automation: { track: "bass", param: "filter.cutoff", from: 300, to: 3000, curve: "exp" } },
    { op: "automate", section: "drop3", automation: { track: "bass", param: "filter.cutoff", from: 200, to: 2000 } },
    { op: "transpose", semitones: 2 }, { op: "transpose", track: "kick", semitones: 5 },
    { op: "tempo", bpm: 128 }, { op: "key", key: "E minor" }, { op: "loop", loop: { section: "drop3" } },
    { op: "arrange", arrangement: ["intro", "drop3", "outro", "ghost"] },
    { op: "removeSection", section: "intro" },
    { op: "humanize", swing: 0.9, pocketMs: -8 },
    { op: "shift", track: "clap", beats: 1 }, { op: "velocity", track: "kick", scale: 0.5 },
  ]);
  assert.equal(skipped.length, 0);
  const d3 = song.sections.find((s) => s.id === "drop3");
  assert.deepEqual(d3.active, ["kick", "clap"]);
  assert.equal(d3.variants.hat, "sparse");
  assert.equal(d3.automation.length, 1); assert.equal(d3.automation[0].from, 200);
  assert.equal(song.tracks.find((t) => t.id === "bass").transpose, 2);
  assert.equal(song.tracks.find((t) => t.id === "kick").transpose, 5);
  assert.equal(song.bpm, 128); assert.equal(song.key, "E minor"); assert.deepEqual(song.loop, { section: "drop3" });
  assert.deepEqual(song.arrangement, ["drop3", "outro"]);
  assert.equal(song.humanize.swing, 0.7); assert.equal(song.humanize.pocketMs, -8);
  assert.deepEqual(song.tracks.find((t) => t.id === "clap").notes.map((n) => n[1]), [2, 0]);
  assert.ok(song.tracks.find((t) => t.id === "kick").notes.every((n) => n[3] <= 64));
});

test("ops never mutate the input song", () => {
  const s = seed(); const before = JSON.stringify(s);
  applyOps(s, [{ op: "tempo", bpm: 140 }, { op: "notes", track: "kick", notes: [] }]);
  assert.equal(JSON.stringify(s), before);
});

test("migrate: v2 stored song and garbage", () => {
  const v2 = { title: "old", bpm: 125, key: "D minor", lane: "tech-house", humanize: { swing: 0.55, velVar: 0.1, clapLateMs: 5, seed: 1 },
    tracks: [{ id: "kick", name: "Kick", role: "kick", volume: 0, loopBeats: 4, notes: [[36, 0, 0.2, 120], "bad", [36, 2, 0.2]] }],
    sections: [{ id: "a", name: "A", bars: 8, active: ["kick"] }], arrangement: ["a", "missing"] };
  const m = migrateSong(v2);
  assert.equal(m.version, 3); assert.equal(m.tracks[0].notes.length, 2); assert.deepEqual(m.arrangement, ["a"]);
  const v1 = { title: "loop", bpm: 120, tracks: [{ id: "k", role: "kick", notes: [[36, 0, 0.2, 100]] }] };
  const m1 = migrateSong(v1);
  assert.equal(m1.sections.length, 1); assert.deepEqual(m1.sections[0].active, ["k"]);
  assert.equal(migrateSong(null), null); assert.equal(migrateSong({ tracks: [] }), null); assert.equal(migrateSong("x"), null);
});

test("schedule: seeds tile, cut fills, kicks, sections, automation and loop bounds", () => {
  for (const s of [SEED_TECH_HOUSE, SEED_HARD_HOUSE]) {
    const sch = scheduleEvents(s);
    assert.equal(sch.totalBeats, s.sections.reduce((a, x) => a + x.bars * 4, 0));
    assert.equal(sch.sectionStarts.length, s.arrangement.length);
    const build = sch.sectionStarts.find((x) => x.id === "build");
    const end = build.startBeat + build.beats;
    assert.ok(!sch.kickBeats.some((b) => b >= end - 2 && b < end), "no kick in the cut");
    assert.ok(sch.kickBeats.some((b) => Math.abs(b - build.startBeat) < 1e-9), "kick on the downbeat of the build");
    assert.ok(sch.automation.length >= 2);
    assert.ok(sch.automation.every((a) => a.endBeat > a.startBeat));
    if (s === SEED_TECH_HOUSE) assert.equal(sch.automation.find((a) => a.track === "pad").startBeat, 0);
    assert.deepEqual(loopBounds(s, sch.sectionStarts, sch.totalBeats), { start: 0, end: sch.totalBeats });
    const drop = sch.sectionStarts.find((x) => x.id === "drop");
    assert.deepEqual(loopBounds({ ...s, loop: { section: "Drop" } }, sch.sectionStarts, sch.totalBeats), { start: drop.startBeat, end: drop.startBeat + drop.beats });
    assert.deepEqual(loopBounds({ ...s, loop: { startBar: 3, endBar: 5 } }, sch.sectionStarts, sch.totalBeats), { start: 8, end: 20 });
    const loc = locate(sch.sectionStarts, drop.startBeat + 5);
    assert.equal(loc.sectionId, "drop"); assert.equal(loc.barInSection, 2); assert.equal(loc.beatInBar, 2);
  }
});

test("schedule: variants, solo, mute, transpose, swing determinism", () => {
  const s = seed();
  const sch1 = scheduleEvents(s);
  const introHats = sch1.perTrack.get("hat").filter((e) => e.beat < 32);
  assert.equal(introHats.length, 8 * 4 / 4 * 1 * 4 / 4 * 4, "sparse variant = one hat per beat in the intro (32 beats)");
  const solo = applyOps(s, [{ op: "solo", track: "bass" }]).song;
  const sch2 = scheduleEvents(solo);
  assert.deepEqual([...sch2.perTrack.keys()], ["bass"]);
  assert.equal(sch2.kickBeats.length, 0);
  assert.deepEqual([...audibleTracks(solo)], ["bass"]);
  const tr = applyOps(s, [{ op: "transpose", track: "bass", semitones: 12 }]).song;
  const b1 = sch1.perTrack.get("bass")[0].note[0], b2 = scheduleEvents(tr).perTrack.get("bass")[0].note[0];
  assert.equal(b2, b1 + 12);
  const swung = applyOps(s, [{ op: "humanize", swing: 0.62 }]).song;
  const offbeat = scheduleEvents(swung).perTrack.get("hat").find((e) => Math.abs((e.note[1] % 0.5) - 0.25) < 1e-9);
  assert.ok(Math.abs((offbeat.beat % 0.25) - 0.06) < 1e-6, "offbeat 16th pushed by (0.62-0.5)*0.5 = 0.06 beats");
  assert.deepEqual(scheduleEvents(s).perTrack.get("hat").map((e) => e.note[3]), sch1.perTrack.get("hat").map((e) => e.note[3]), "same seed, same velocities");
});
