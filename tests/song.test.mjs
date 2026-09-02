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

test("harmony: key parsing and exact chords per bar from the notes", async () => {
  const { parseKey, chordsForSection, condense, chordName } = await import("../lib/song/harmony.ts");
  assert.deepEqual(parseKey("D minor"), { tonic: "D", mode: "minor", pc: 2 });
  assert.deepEqual(parseKey("F# major"), { tonic: "F#", mode: "major", pc: 6 });
  assert.equal(parseKey("Bb min").tonic, "Bb"); assert.equal(parseKey("Am").mode, "minor"); assert.equal(parseKey("nope"), null);
  const s = seed();
  const drop = s.sections.find((x) => x.id === "drop");
  const chords = chordsForSection(s, drop, 8);
  assert.equal(chords.length, 8);
  assert.ok(chords.every((c) => c.startsWith("D") || c.startsWith("Bb") || c.startsWith("F")), `chords in D minor land: ${chords}`);
  const prof = new Float64Array(12); prof[2] = 3; prof[5] = 2; prof[9] = 2;
  assert.equal(chordName(prof), "Dm");
  const prof2 = new Float64Array(12); prof2[10] = 3; prof2[2] = 2; prof2[5] = 2;
  assert.equal(chordName(prof2), "Bb");
  assert.deepEqual(condense(["Dm", "Dm", "-", "Bb", "Bb", "Dm"]), ["Dm", "Bb", "Dm"]);
});

test("history: undo/redo and diffs", async () => {
  const { History, diffSongs } = await import("../lib/song/history.ts");
  const h = new History(3);
  const a = seed(); const b = applyOps(a, [{ op: "tempo", bpm: 130 }]).song; const c = applyOps(b, [{ op: "mute", track: "pad" }]).song;
  h.push(a, "start"); h.push(b, "tempo");
  assert.ok(h.canUndo && !h.canRedo);
  const u = h.undo(c); assert.equal(u.song.bpm, 130); assert.ok(h.canRedo);
  const r = h.redo(u.song); assert.equal(r.song.tracks.find((t) => t.id === "pad").mute, true);
  const d = diffSongs(a, c);
  assert.ok(d.includes("tempo 126→130") && d.some((x) => x.startsWith("pad: muted")), d.join(" | "));
});

test("sectionNotes scopes notes to one section via a variant; skeleton songs migrate", async () => {
  const s = seed();
  const { song, skipped } = applyOps(s, [{ op: "sectionNotes", section: "drop2", track: "bass", notes: [[38, 0, 0.5, 120], [45, 1, 0.5, 100]] }]);
  assert.equal(skipped.length, 0);
  const bass = song.tracks.find((t) => t.id === "bass");
  assert.deepEqual(bass.patterns["sec:drop2"].map((n) => n[0]), [38, 45]);
  assert.equal(song.sections.find((x) => x.id === "drop2").variants.bass, "sec:drop2");
  assert.equal(song.tracks.find((t) => t.id === "bass").notes.length, s.tracks.find((t) => t.id === "bass").notes.length, "the main pattern is untouched");
  const skel = migrateSong({ title: "Skeleton", bpm: 128, key: "G minor", tracks: [], sections: [{ id: "intro", name: "Intro", bars: 8, active: [] }, { id: "drop", name: "Drop", bars: 16, active: [] }], arrangement: ["intro", "drop"] });
  assert.equal(skel.tracks.length, 0); assert.equal(skel.sections.length, 2);
  assert.equal(scheduleEvents(skel).totalBeats, 96);
});

test("rollout checks read the song and the facts", async () => {
  const { ROLLOUTS } = await import("../lib/brain/rollouts.ts");
  const s = seed();
  const facts = (drop) => ({ structure: { sections: [{ label: "drop", lufs: drop.lufs ?? -9, bands: drop.bands ?? { sub: 0.55, low: 0.3, lowMid: 0.05, mid: 0.05, highMid: 0.03, air: 0.02 }, kickDensity: drop.kickDensity ?? 4, peak: drop.peak ?? 0 }] } });
  const step = (id) => ROLLOUTS.newSong.find((x) => x.id === id);
  assert.equal(step("blueprint").check({ song: s, facts: null, reference: null, lane: "tech-house" }), null);
  assert.ok(step("blueprint").check({ song: { ...s, sections: s.sections.slice(0, 2) }, facts: null, reference: null, lane: "tech-house" }));
  assert.equal(step("drums").check({ song: s, facts: facts({}), reference: null, lane: "tech-house" }), null);
  assert.ok(step("drums").check({ song: s, facts: facts({ kickDensity: 1 }), reference: null, lane: "tech-house" }).includes("kick density"));
  assert.equal(step("bass").check({ song: s, facts: facts({}), reference: null, lane: "tech-house" }), null);
  const offKey = applyOps(s, [{ op: "notes", track: "bass", notes: [[37, 0, 0.5, 100], [39, 1, 0.5, 100], [42, 2, 0.5, 100], [44, 3, 0.5, 100]] }, { op: "notes", track: "sub", notes: [[25, 0, 0.5, 100], [27, 2, 0.5, 100]] }]).song;
  assert.ok(step("bass").check({ song: offKey, facts: null, reference: null, lane: "tech-house" }).includes("key"));
  assert.equal(step("craft").check({ song: s, facts: null, reference: null, lane: "tech-house" }), null);
  assert.ok(step("mix").check({ song: s, facts: facts({ peak: 1.5 }), reference: null, lane: "tech-house" }).includes("clipping"));
  assert.ok(step("mix").check({ song: s, facts: facts({ bands: { sub: 0.7, low: 0.28, lowMid: 0.01, mid: 0.01, highMid: 0, air: 0 } }), reference: null, lane: "tech-house" }).includes("top"));
  const { referenceDelta } = await import("../lib/scorecard.ts");
  assert.ok(referenceDelta({ lufs: 0, bands: { sub: 0, low: 0 }, tempoRatio: 1, pump: 0 }) === 0);
  assert.ok(referenceDelta({ lufs: 5, bands: { sub: 0.1, low: -0.1 }, tempoRatio: 1.02, pump: 0.1 }) > 0.5);
});

test("grid op: step notation to notes, creates tracks, variants, sections", () => {
  const s = seed();
  const r = applyOps(s, [
    { op: "grid", track: "kick", steps: "X...X...X...X..g" },
    { op: "grid", track: "ride", role: "perc", name: "Ride", volume: -12, steps: "..x...x...x...x." , midi: 51 },
    { op: "grid", track: "hat", pattern: "skip", steps: "X.g.x.g.X.g.x.g." , midi: 42 },
    { op: "grid", track: "clap", section: "drop2", steps: "....X.......X..x", midi: 39 },
    { op: "grid", track: "sub", steps: "o.o.o.o.", midi: 29, stepBeats: 0.5 },
    { op: "grid", track: "nope", steps: "x" },
  ]);
  assert.equal(r.skipped.length, 1);
  const kick = r.song.tracks.find((t) => t.id === "kick");
  assert.equal(kick.notes.length, 5); assert.equal(kick.loopBeats, 4); assert.deepEqual(kick.notes[0], [36, 0, 0.125, 120]); assert.equal(kick.notes[4][3], 45);
  const ride = r.song.tracks.find((t) => t.id === "ride"); assert.equal(ride.role, "perc"); assert.equal(ride.notes.length, 4); assert.equal(ride.notes[0][0], 51); assert.equal(ride.duck, true);
  assert.equal(r.song.tracks.find((t) => t.id === "hat").patterns.skip.length, 8);
  const d2 = r.song.sections.find((x) => x.id === "drop2"); assert.equal(d2.variants.clap, "sec:drop2");
  assert.equal(r.song.tracks.find((t) => t.id === "clap").patterns["sec:drop2"].length, 3);
  const sub = r.song.tracks.find((t) => t.id === "sub"); assert.equal(sub.loopBeats, 4); assert.equal(sub.notes[0][2], 0.8);
  assert.ok(scheduleEvents(r.song).totalBeats > 0);
});
