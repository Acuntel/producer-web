// DAW features: the Groove Pool, pattern playlists (Follow Actions), note chance
// and velocity deviation. Everything is seeded, so every assertion is exact.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps } from "../lib/song/ops.ts";
import { migrateSong, cleanNote } from "../lib/song/migrate.ts";
import { SEED_TECH_HOUSE } from "../lib/song/seeds.ts";
import { scheduleEvents } from "../lib/engine/schedule.ts";
import { templateOffsets, applyGroove, grooveFor, swingOf, songSwing, withReferenceGroove } from "../lib/song/groove.ts";
import { patternFor, resolvePlan, planLabel } from "../lib/song/pattern.ts";
import { extractGroove, grooveTemplateLine } from "../lib/ears/groove.ts";

const seed = () => JSON.parse(JSON.stringify(SEED_TECH_HOUSE));
const T16 = 1 / 12;
const hat = (song) => scheduleEvents(song).perTrack.get("hat");
const kick = (song) => scheduleEvents(song).perTrack.get("kick");
const slotOf = (ev) => Math.round((ev.note[1] % 1) * 4) % 4;
const X16 = "xxxxxxxxxxxxxxxx";

// A drop-only song: 16 bars of hats on every 16th (pattern A) and every 8th (pattern B), a plain kick.
function dropSong(bars = 16, extra = []) {
  const { song, skipped } = applyOps(seed(), [
    { op: "groove", track: "all", name: "straight" },
    { op: "grid", track: "kick", steps: "X...X...X...X..." },
    { op: "grid", track: "hat", steps: X16, midi: 42 },
    { op: "grid", track: "hat", pattern: "B", steps: "x.x.x.x.x.x.x.x.", midi: 42 },
    { op: "grid", track: "hat", pattern: "fill", steps: X16, midi: 49 },
    { op: "section", section: { id: "drop", name: "Drop", bars, active: ["kick", "hat"], fill: "none" } },
    { op: "arrange", arrangement: ["drop"] },
    ...extra,
  ]);
  assert.equal(skipped.length, 0, skipped.join(" | "));
  return song;
}

test("groove pool: mpc16 on the hats moves the odd 16ths exactly a 16th-triplet late, the kick never moves", () => {
  const straight = dropSong();
  const swung = applyOps(straight, [{ op: "groove", track: "hat", name: "mpc16", amount: 1 }]).song;
  assert.equal(swung.tracks.find((t) => t.id === "hat").groove.name, "mpc16");
  const a = hat(straight), b = hat(swung);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    const shift = b[i].beat - a[i].beat;
    if (slotOf(a[i]) % 2 === 1) assert.ok(Math.abs(shift - T16) < 1e-9, `odd slot late by ${shift}`);
    else assert.ok(Math.abs(shift) < 1e-9, `even slot moved by ${shift}`);
  }
  assert.deepEqual(kick(swung), kick(straight), "kick identical to straight");
  const zero = applyOps(straight, [{ op: "groove", track: "hat", name: "mpc16", amount: 0 }]).song;
  assert.deepEqual(hat(zero), a, "amount 0 equals straight");
  assert.deepEqual(hat(swung), hat(swung), "same seed, same events, every time");
  const jitter = applyOps(straight, [{ op: "groove", track: "hat", name: "mpc16", amount: 0, random: 5 }]).song;
  const maxBeats = 0.005 / (60 / straight.bpm);
  const c = hat(jitter);
  assert.ok(c.some((e, i) => Math.abs(e.beat - a[i].beat) > 1e-6), "random 5 actually moves hits");
  assert.ok(c.every((e, i) => Math.abs(e.beat - a[i].beat) <= maxBeats + 1e-9), "random 5 never exceeds 5 ms");
  assert.ok(hat(applyOps(straight, [{ op: "groove", track: "hat", name: "mpc16", amount: 1, velocity: 0.8 }]).song).some((e, i) => e.note[3] !== a[i].note[3]), "velocity shapes accents");
});

test("groove pool: templates, resolution rule, legacy swing mapping and the ops", () => {
  const mpc = templateOffsets("mpc16");
  assert.equal(mpc.timing.length, 16); assert.ok(Math.abs(mpc.timing[1] - T16) < 1e-12); assert.equal(mpc.timing[0], 0); assert.equal(mpc.timing[2], 0);
  assert.ok(Math.abs(templateOffsets("swing8").timing[2] - 1 / 6) < 1e-12);
  assert.ok(templateOffsets("garage-skip").timing[3] > templateOffsets("garage-skip").timing[1]);
  assert.deepEqual(templateOffsets("straight").timing, new Array(16).fill(0));
  const s = seed();
  // humanize.swing 0.56 is swing16 at amount 0.36: the same 0.03-beat push the old engine gave, and the ears still read 0.56.
  assert.ok(Math.abs(grooveFor(s.tracks.find((t) => t.id === "hat"), s).amount - 0.36) < 1e-9);
  assert.equal(grooveFor(s.tracks.find((t) => t.id === "kick"), s), null);
  assert.equal(grooveFor(s.tracks.find((t) => t.id === "sub"), s), null);
  assert.ok(Math.abs(songSwing(s) - 0.56) < 1e-9);
  assert.ok(Math.abs(swingOf({ name: "mpc16", amount: 1 }) - 0.667) < 1e-3);
  const rng = () => 0.5;
  assert.ok(Math.abs(applyGroove(1.25, 100, { name: "mpc16", amount: 0.5 }, rng).beat - (1.25 + T16 / 2)) < 1e-12);
  assert.deepEqual(applyGroove(1.3333, 100, { name: "mpc16", amount: 1 }, rng), { beat: 1.3333, vel: 100 }, "triplets keep their own feel");
  const all = applyOps(s, [{ op: "groove", name: "909", amount: 0.8, velocity: 0.4 }]).song;
  assert.equal(all.groove.name, "909"); assert.equal(all.groove.amount, 0.8); assert.ok(Math.abs(all.humanize.swing - swingOf(all.groove)) < 1e-9);
  const drums = applyOps(s, [{ op: "groove", track: "drums", name: "sp1200", amount: 1 }]).song;
  assert.equal(drums.tracks.find((t) => t.id === "hat").groove.name, "sp1200");
  assert.equal(drums.tracks.find((t) => t.id === "tamb").groove.name, "sp1200");
  assert.equal(drums.tracks.find((t) => t.id === "kick").groove, undefined);
  assert.equal(drums.tracks.find((t) => t.id === "clap").groove, undefined);
  const r = applyOps(s, [{ op: "groove", track: "all", name: "custom", from: "reference" }, { op: "groove", track: "hat", name: "nope" }]);
  assert.equal(r.skipped.length, 2, "no reference loaded and an unknown template are both skipped");
  const timing = new Array(16).fill(0).map((_, i) => (i % 2 ? 0.05 : 0)), accents = new Array(16).fill(0);
  const injected = withReferenceGroove([{ op: "groove", track: "all", name: "custom", from: "reference" }], { timing, accents, confidence: 1 });
  const ref = applyOps(s, injected).song;
  assert.deepEqual(ref.groove.timing, timing); assert.equal(ref.groove.name, "custom");
  const straightHat = dropSong();
  const refHat = applyOps(straightHat, injected).song;
  const a = hat(straightHat), b = hat(refHat);
  assert.ok(b.every((e, i) => Math.abs(e.beat - a[i].beat - (slotOf(a[i]) % 2 ? 0.05 : 0)) < 1e-9), "the reference groove drives the hats");
  const m = migrateSong({ ...ref, tracks: ref.tracks.map((t) => (t.id === "hat" ? { ...t, groove: { name: "bogus" } } : t)) });
  assert.equal(m.groove.name, "custom"); assert.equal(m.tracks.find((t) => t.id === "hat").groove, undefined, "junk grooves are dropped on migrate");
  assert.ok(Math.abs(applyOps(all, [{ op: "humanize", swing: 0.62 }]).song.groove.amount - 0.72) < 1e-9, "the legacy swing dial rescales the song groove");
});

test("ears: extract groove reads a 20 ms delay on the 2nd and 4th 16ths within 3 ms", () => {
  const fps = 400, bpm = 120, beatSec = 60 / bpm, slotSec = beatSec / 4, seconds = 16;
  const env = new Float32Array(Math.round(fps * seconds));
  const t0 = 0.05;
  for (let t = t0; t < seconds - 0.1; t += slotSec) {
    const slot = Math.round((t - t0) / slotSec) % 16;
    const late = slot % 2 === 1 ? 0.02 : 0;
    const at = (t + late) * fps;
    const i = Math.round(at), frac = at - i;
    const amp = slot % 4 === 0 ? 1 : 0.6;
    env[i] += amp * (1 - Math.abs(frac)); env[i + (frac >= 0 ? 1 : -1)] += amp * Math.abs(frac);
  }
  const g = extractGroove(env, fps, bpm, t0);
  const ms = (b) => b * beatSec * 1000;
  assert.ok(Math.abs(ms(g.timing[1]) - 20) <= 3, `slot 1 ${ms(g.timing[1])} ms`);
  assert.ok(Math.abs(ms(g.timing[3]) - 20) <= 3, `slot 3 ${ms(g.timing[3])} ms`);
  assert.ok(Math.abs(ms(g.timing[0])) <= 3 && Math.abs(ms(g.timing[2])) <= 3, "straight slots stay straight");
  assert.ok(g.accents[0] > g.accents[1], "downbeat accents read louder than the offbeats");
  assert.ok(g.confidence > 0.9);
  const line = grooveTemplateLine(g, bpm);
  assert.ok(line.includes("slot 1 +") && !line.includes("slot 0 "), line);
  assert.equal(grooveTemplateLine({ timing: new Array(16).fill(0), accents: new Array(16).fill(0), confidence: 1 }, bpm), "straight (every 16th within 4 ms of the grid)");
});

test("playlists: a sequence of variants cycles inside one section, every-N fills land in the right bars", () => {
  const seq = dropSong(16, [{ op: "variant", section: "drop", track: "hat", pattern: { sequence: ["A", "B"], barsEach: 4 } }]);
  const evs = hat(seq);
  const perBlock = [0, 1, 2, 3].map((k) => evs.filter((e) => e.beat >= k * 16 - 0.2 && e.beat < (k + 1) * 16 - 0.2).length);
  assert.deepEqual(perBlock, [64, 32, 64, 32]);
  assert.equal(kick(seq).length, 64);
  assert.equal(planLabel(seq.sections.find((x) => x.id === "drop").variants.hat), "A B");
  const fill = dropSong(16, [{ op: "fill", section: "drop", track: "hat", every: 4, pattern: "fill", bars: 1 }]);
  const plan = fill.sections.find((x) => x.id === "drop").variants.hat;
  assert.deepEqual(plan, { every: 4, pattern: "fill", bars: 1, base: undefined });
  const fills = hat(fill).filter((e) => e.note[0] === 49);
  assert.equal(fills.length, 64, "16 fill hits in each of 4 fill bars");
  assert.deepEqual([...new Set(fills.map((e) => Math.floor(e.beat / 4) + 1))].sort((a, b) => a - b), [4, 8, 12, 16]);
  assert.equal(hat(fill).filter((e) => e.note[0] === 42).length, 12 * 16, "the base pattern fills the other 12 bars");
  const track = fill.tracks.find((t) => t.id === "hat"), sec = fill.sections.find((x) => x.id === "drop");
  assert.equal(patternFor(track, sec, 3)[0][0], 49); assert.equal(patternFor(track, sec, 4)[0][0], 42);
  assert.equal(resolvePlan({ every: 8, pattern: "fill", bars: 2, base: "B" }, 6, 1, "k"), "fill");
  assert.equal(resolvePlan({ every: 8, pattern: "fill", bars: 2, base: "B" }, 5, 1, "k"), "B");
  assert.equal(resolvePlan("sparse", 9, 1, "k"), "sparse");
  assert.equal(resolvePlan(undefined, 9, 1, "k"), "A");
  // An 8-beat pattern keeps its loop phase across a per-bar playlist: bar 1 plays the second half.
  const long = applyOps(seq, [{ op: "notes", track: "hat", notes: [[42, 0, 0.1, 90], [42, 5, 0.1, 90]], loopBeats: 8 }, { op: "notes", track: "hat", pattern: "B", notes: [[42, 1, 0.1, 90], [42, 6, 0.1, 90]], loopBeats: 8 }]).song;
  assert.deepEqual(hat(long).slice(0, 4).map((e) => e.beat), [0, 5, 8, 13]);
});

test("playlists: any picks are seeded (same seed twice, a different seed differs) and survive migration", () => {
  const plan = { any: ["A", "B"], barsEach: 1 };
  const bars = (song) => { const evs = hat(song); return Array.from({ length: 16 }, (_, b) => evs.filter((e) => e.beat >= b * 4 - 0.2 && e.beat < b * 4 + 3.8).length); };
  const s42 = dropSong(16, [{ op: "variant", section: "drop", track: "hat", pattern: plan }, { op: "humanize", seed: 42 }]);
  const s43 = applyOps(s42, [{ op: "humanize", seed: 43 }]).song;
  const a = bars(s42);
  assert.ok(a.every((n) => n === 16 || n === 8) && a.includes(16) && a.includes(8), `mixed A and B bars: ${a}`);
  assert.deepEqual(bars(s42), a, "seed 42 twice");
  assert.notDeepEqual(bars(s43), a, "seed 43 differs");
  const m = migrateSong(JSON.parse(JSON.stringify(s42)));
  assert.deepEqual(m.sections.find((x) => x.id === "drop").variants.hat, plan);
  assert.equal(migrateSong({ ...s42, sections: s42.sections.map((x) => ({ ...x, variants: { hat: { bogus: 1 } } })) }).sections[0].variants, undefined, "junk plans are dropped");
  assert.equal(applyOps(s42, [{ op: "variant", section: "drop", track: "hat", pattern: { nope: true } }]).skipped.length, 1);
  assert.equal(applyOps(s42, [{ op: "variant", section: "drop", track: "hat", pattern: null }]).song.sections.find((x) => x.id === "drop").variants.hat, undefined);
});

test("chance: seeded per-hit probability thins the hats, never the kick; velDev bounds the velocity life", () => {
  const s = dropSong(8, [{ op: "chance", track: "hat", value: 0.5 }]);
  assert.equal(s.tracks.find((t) => t.id === "hat").chance, 0.5);
  const evs = hat(s);
  assert.ok(evs.length >= 40 && evs.length <= 88, `${evs.length} of 128 hats play at chance 0.5`);
  assert.deepEqual(hat(s), evs, "the same render every play");
  assert.equal(kick(s).length, 32);
  const full = dropSong(8);
  assert.equal(hat(full).length, 128);
  const dev = applyOps(full, [{ op: "velDev", track: "hat", steps: 20 }]).song;
  const vels = hat(dev).map((e) => e.note[3]);
  assert.ok(vels.every((v) => Math.abs(v - 92) <= 20 && v >= 1 && v <= 127), "within 20 of the written 92");
  assert.ok(new Set(vels).size > 5, "velocities actually vary");
  assert.deepEqual(hat(dev).map((e) => e.beat), hat(full).map((e) => e.beat), "velDev never touches timing");
  const hot = applyOps(full, [{ op: "velocity", track: "hat", add: 40 }, { op: "velDev", track: "hat", steps: 40 }]).song;
  assert.ok(hat(hot).every((e) => e.note[3] <= 127 && e.note[3] >= 1));
  // Per-note chance from the grid: ghosts at 0.6, accents always; a 5-tuple survives cleanNote and the notes op.
  const g = applyOps(full, [{ op: "grid", track: "hat", steps: "X.g.x.g.X.g.x.g.", midi: 42, chance: { g: 0.6 } }]).song;
  const notes = g.tracks.find((t) => t.id === "hat").notes;
  assert.deepEqual(notes.filter((n) => n[3] === 45).map((n) => n[4]), [0.6, 0.6, 0.6, 0.6]);
  assert.ok(notes.filter((n) => n[3] !== 45).every((n) => n.length === 4));
  const ghosts = hat(g).filter((e) => e.note[3] < 60).length;
  assert.ok(ghosts > 8 && ghosts < 32, `${ghosts} of 32 ghosts play at chance 0.6`);
  assert.equal(hat(g).filter((e) => e.note[3] >= 60).length, 32, "accented hits always play (the seed's velVar 0.08 still breathes a few steps around them)");
  assert.deepEqual(cleanNote([42, 0, 0.1, 90, 0.6]), [42, 0, 0.1, 90, 0.6]);
  assert.deepEqual(cleanNote([42, 0, 0.1, 90, 1]), [42, 0, 0.1, 90]);
  assert.deepEqual(cleanNote([42, 0, 0.1, 90]), [42, 0, 0.1, 90]);
  const n5 = applyOps(full, [{ op: "notes", track: "hat", notes: [[42, 0, 0.1, 90, 0.3], [42, 1, 0.1, 90]] }]).song.tracks.find((t) => t.id === "hat").notes;
  assert.deepEqual(n5, [[42, 0, 0.1, 90, 0.3], [42, 1, 0.1, 90]]);
  const pat = applyOps(full, [{ op: "chance", track: "hat", value: 0.7, pattern: "B" }]).song.tracks.find((t) => t.id === "hat");
  assert.ok(pat.patterns.B.every((n) => n[4] === 0.7) && pat.notes.every((n) => n.length === 4));
  assert.equal(migrateSong(JSON.parse(JSON.stringify(g))).tracks.find((t) => t.id === "hat").notes.filter((n) => n[4] === 0.6).length, 4);
  assert.equal(applyOps(full, [{ op: "chance", track: "hat", value: 1 }]).song.tracks.find((t) => t.id === "hat").chance, undefined);
});
