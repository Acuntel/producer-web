import { test } from "node:test";
import assert from "node:assert/strict";
import { Latest, wrapToBar, hitsAddress } from "../lib/engine/steady.ts";
import { scheduleEvents } from "../lib/engine/schedule.ts";
import { SEED_SONG } from "../lib/song/seeds.ts";

const PPQ = 192, BAR = 4 * PPQ;
const later = (ms) => new Promise((r) => setTimeout(r, ms));

test("latest wins: an older record that finishes loading after a newer one never lands", async () => {
  const latest = new Latest();
  const landed = [];
  // The engine's update: take a ticket, prepare (slow for the first record, quick for the second), lay if still newest.
  const update = async (name, ms) => { const t = latest.take(name); await later(ms); if (latest.current(t)) landed.push(name); };
  await Promise.all([update("older", 40), update("newer", 5)]);
  assert.deepEqual(landed, ["newer"]);
  assert.equal(latest.newest, "newer");
});

test("latest wins: a burst of records lands only the last one, whatever order the loads finish in", async () => {
  const latest = new Latest();
  const landed = [];
  const update = async (name, ms) => { const t = latest.take(name); await later(ms); if (latest.current(t)) landed.push(name); };
  await Promise.all([update("a", 30), update("b", 10), update("c", 20), update("d", 1)]);
  assert.deepEqual(landed, ["d"]);
});

test("settle prepares whatever is newest when it finishes, so a start never lays a record that was replaced while it loaded", async () => {
  const latest = new Latest();
  latest.take("first");
  const prepared = [];
  const settled = latest.settle(async (v) => { prepared.push(v); await later(v === "first" ? 20 : 1); });
  await later(5); latest.take("second");   // a change lands while the session is still starting
  assert.equal(await settled, "second");
  assert.deepEqual(prepared, ["first", "second"]);
});

test("a shortened record wraps by whole bars and keeps its place inside the bar", () => {
  // 16 bars playing, the record shrinks to 8: the playhead was at bar 13, beat 3 and a half.
  const pos = 12 * BAR + 2.5 * PPQ;
  const t = wrapToBar(pos, 0, 8 * BAR, BAR);
  assert.equal(t % BAR, 2.5 * PPQ, "the same point of the bar");
  assert.equal(Math.floor(t / BAR), 4, "bar 13 of 16 lands on bar 5 of 8, as the old wrap did");
  assert.ok(t < 8 * BAR);
});

test("the old modulo could land mid-beat on a record that is not whole bars; the snap cannot", () => {
  // A record of 7 and a half bars (the end off the bar grid) and a playhead on a downbeat past it.
  const end = 7.5 * BAR; const pos = 9 * BAR;
  assert.notEqual((pos % end) % BAR, 0, "the modulo moves the downbeat");
  assert.equal(wrapToBar(pos, 0, end, BAR) % BAR, 0, "the snap keeps it");
});

test("entering a loop from outside it starts in the loop's first bar, on the same beat", () => {
  const start = 16 * BAR, end = 20 * BAR;
  assert.equal(wrapToBar(3 * BAR + 1 * PPQ, start, end, BAR), start + 1 * PPQ, "from before the loop");
  const past = wrapToBar(40 * BAR + 3 * PPQ, start, end, BAR);
  assert.ok(past >= start && past < end, "from past the loop, inside it");
  assert.equal(past % BAR, 3 * PPQ, "on beat four, as before");
});

test("a playhead already inside the region is left exactly where it is, and a region under a bar starts from its top", () => {
  assert.equal(wrapToBar(5 * BAR + 17, 0, 8 * BAR, BAR), 5 * BAR + 17);
  assert.equal(wrapToBar(3 * BAR, 0, 2 * PPQ, BAR), 0);
});

test("a tempo move keeps every hits part's address, so the transport rides the change and nothing is relaid", () => {
  // The glitch probe's own tempo moves on the seed record: 128 then 126. A note's length is in beats
  // and the part reads the tempo where the note plays, so the address is the voice and the hits alone.
  const at = (bpm) => scheduleEvents({ ...SEED_SONG, bpm }).perTrack;
  const [a, b, c] = [at(SEED_SONG.bpm), at(128), at(126)];
  assert.ok(a.size > 3, "the seed record has hits on several tracks");
  for (const [id, evs] of a) {
    const sig = `voice:${id}`;
    assert.equal(hitsAddress(sig, b.get(id)), hitsAddress(sig, evs), `${id} at 128 BPM`);
    assert.equal(hitsAddress(sig, c.get(id)), hitsAddress(sig, evs), `${id} at 126 BPM`);
  }
});

test("the hits address still moves when the hits or the voice do", () => {
  const evs = scheduleEvents(SEED_SONG).perTrack;
  const [id, list] = [...evs][0];
  const moved = list.map((e, i) => (i === 0 ? { ...e, beat: e.beat + 0.25 } : e));
  assert.notEqual(hitsAddress("v", moved), hitsAddress("v", list), "a hit moved");
  assert.notEqual(hitsAddress("v2", list), hitsAddress("v", list), `the voice of ${id} changed`);
});
