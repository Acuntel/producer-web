// The vocal map contract (docs/VOCAL_MAP.md), read the way the browser reads it.
import test from "node:test";
import assert from "node:assert/strict";
import { parseVocalMap, hookPhrase, repeatsOf, phraseSaying, anchorOf, sectionAt } from "../lib/song/vocalMap.ts";

const phrase = (id, start, end, text, hookScore, more = {}) => ({
  id, start, end, loudest: [start, end], text, words: text.split(" ").map((w, i) => ({ w, start: start + i * 0.3, end: start + i * 0.3 + 0.25, p: 0.9 })),
  notes: [{ start, end, midi: 64 }], keyRelToSource: 0, inKey: 1, section: "verse", repeats: 1, repeatsWords: 1, repeatsMelody: 1,
  hookScore, sourceBar: 0, sourceBeat: 0, pickupBeats: 0.5, stressOnset: start + 0.25, rmsDb: -20, peakDb: -10, ...more,
});

const map = () => ({
  version: 1,
  source: { name: "test", bpm: 120, key: "A minor", durationSec: 60, grid: "tempo", beatSec: 0.5, downbeats: [0, 2, 4, 6] },
  words: { model: "large-v3-turbo", language: "en", count: 12 },
  melody: { model: "pyin" },
  sections: [{ label: "verse", startBar: 0, endBar: 8, start: 0, end: 16, energy: 0.5, low: 0.5 }, { label: "chorus", startBar: 8, endBar: 16, start: 16, end: 32, energy: 0.9, low: 0.9 }],
  hook: 1,
  phrases: [
    phrase(0, 1, 3, "walking down the street tonight", 0.2),
    phrase(1, 17, 19, "break it down for me now", 0.9, { section: "chorus", repeats: 2, repeatsWords: 2 }),
    phrase(2, 25, 27, "break it down for me", 0.7, { section: "chorus", repeats: 2, repeatsWords: 2 }),
  ],
});

test("a worker map parses, and anything else is refused", () => {
  assert.ok(parseVocalMap(map()));
  assert.equal(parseVocalMap(null), null);
  assert.equal(parseVocalMap({ ...map(), version: 2 }), null);
  const bad = map(); bad.phrases[0].end = 0.5;
  assert.equal(parseVocalMap(bad), null, "a phrase that ends before it starts is not a map");
});

test("the hook is the phrase the worker named, and the rest rank by hook score", () => {
  const m = parseVocalMap(map());
  assert.equal(hookPhrase(m).id, 1);
  assert.equal(hookPhrase(m, 1).id, 2);
  assert.equal(hookPhrase({ ...m, hook: null }).id, 1);
});

test("a line's repeats are the phrases that sing the same words, in order", () => {
  const m = parseVocalMap(map());
  assert.deepEqual(repeatsOf(m, m.phrases[1]).map((p) => p.id), [1, 2]);
  assert.deepEqual(repeatsOf(m, m.phrases[0]).map((p) => p.id), [0]);
});

test("a quoted lyric finds its phrase, and a line nobody sings finds nothing", () => {
  const m = parseVocalMap(map());
  assert.equal(phraseSaying(m, "Break it down for me now!").id, 1);
  assert.equal(phraseSaying(m, "sweet caroline"), null);
});

test("the anchor and the section come straight from the map", () => {
  const m = parseVocalMap(map());
  assert.deepEqual(anchorOf(m.phrases[1]), { leadSec: 0.25, pickupBeats: 0.5 });
  assert.equal(sectionAt(m, 20).label, "chorus");
  assert.equal(sectionAt(m, 40), null);
});
