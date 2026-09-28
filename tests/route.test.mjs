// Routing in code on Brady's own words (masterprompt section 4): draft, next, voice, take, refine, small op, question.
import { test } from "node:test";
import assert from "node:assert/strict";
import { route, steerFrom } from "../lib/brain/route.ts";
import { localIntent } from "../lib/brain/local.ts";
import { SEED_SONG } from "../lib/song/seeds.ts";

const drafted = { ...SEED_SONG, draft: { name: "Chris Lake", key: "chris lake", take: 0, seed: 1, tier: "artist", lane: "tech-house", dna: { bpm: 126 } } };
const withVocal = { ...SEED_SONG, tracks: [...SEED_SONG.tracks, { id: "vox", name: "Vocal", role: "audio", volume: 0, loopBeats: 4, notes: [], clip: { clipId: "c1", name: "v" } }] };

test("a draft is named the ways he names one", () => {
  for (const [t, name] of [["make a song like Chris Lake", "chris lake"], ["Make me something like Fred again..", "fred again"], ["can you make a track in the style of John Summit", "john summit"], ["drake type beat", "drake"], ["make me a chris lake record", "chris lake"], ["build me a tech house record", "tech house"]]) {
    assert.deepEqual(route(t, SEED_SONG), { kind: "draft", name }, t);
  }
  assert.equal(route("make it afro house", SEED_SONG).kind, "draft");
  assert.deepEqual(route("new song", SEED_SONG), { kind: "draft", name: null });
  assert.deepEqual(route("surprise me", SEED_SONG), { kind: "draft", name: null, surprise: true });
  assert.notEqual(route("make it darker", SEED_SONG).kind, "draft");
  assert.notEqual(route("i like it", SEED_SONG).kind, "draft");
});

test("next one is the draft's next take only on a drafted record with no chop seed", () => {
  for (const t of ["next one", "nah, next one", "give me another one", "go again"]) assert.equal(route(t, drafted).kind, "next", t);
  assert.notEqual(route("next one", SEED_SONG).kind, "next");
});

test("isolate the vocal from X is a voice off a record, never a solo", () => {
  assert.deepEqual(route("isolate the vocal from Sweet Caroline", withVocal), { kind: "voice", from: "sweet caroline", what: null, where: null });
  assert.equal(localIntent("isolate the vocal from sweet caroline", withVocal), null, "the local SOLO catch lets it through");
  assert.equal(route("isolate the vocal from sweet caroline and put it before the drop", withVocal).where, "before the drop");
  assert.equal(route("go find Sweet Caroline, pull just the voice and isolate that", SEED_SONG).from, "sweet caroline");
  assert.equal(route("put Sweet Caroline in it", SEED_SONG).kind, "voice");
  assert.notEqual(route("put a snare roll in it", SEED_SONG).kind, "voice");
  assert.equal(route("isolate the vocals", withVocal).kind, "small", "a bare isolate with a vocal on the record is a solo");
});

test("takes, named refines, small ops and questions", () => {
  assert.deepEqual(route("record me", SEED_SONG), { kind: "take", what: "record" });
  assert.deepEqual(route("put what I just said in the song", SEED_SONG), { kind: "take", what: "said" });
  assert.deepEqual(route("make the drums hit harder", SEED_SONG), { kind: "refine", step: "drums" });
  assert.deepEqual(route("rebuild the drop", SEED_SONG), { kind: "refine", step: "fixSection", section: "drop" });
  assert.deepEqual(route("finish it", SEED_SONG), { kind: "refine", step: "finish" });
  assert.equal(route("turn the hats up", SEED_SONG).kind, "small");
  assert.equal(route("what key is this in?", SEED_SONG).kind, "question");
  assert.deepEqual(steerFrom("too busy, and darker"), { busy: -1, dark: 1 });
  assert.equal(steerFrom("yes"), null);
});
