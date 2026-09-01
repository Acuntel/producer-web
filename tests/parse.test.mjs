import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBrain, extractJson, normalizeAction } from "../lib/brain/parse.ts";

test("parses strict JSON, fenced JSON, and prose-wrapped JSON", () => {
  const strict = parseBrain('{"say":"Bass is darker now.","ops":[{"op":"set","track":"bass","path":"fx.filter.cutoff","value":300}],"song":null,"action":{"type":"goto","section":"drop"},"listen":"the bass"}');
  assert.equal(strict.say, "Bass is darker now."); assert.equal(strict.ops.length, 1); assert.equal(strict.action.type, "goto"); assert.equal(strict.listen, "the bass");
  const fenced = parseBrain('Sure!\n```json\n{"say":"Done","ops":null,"song":null,"action":"pause"}\n```\nAnything else?');
  assert.equal(fenced.say, "Done"); assert.equal(fenced.action.type, "pause"); assert.equal(fenced.ops, null);
  const withBraces = parseBrain('{"say":"Watch {this} bar","ops":[{"op":"note","note":"a } inside a string"}],"song":null,"action":null} trailing');
  assert.equal(withBraces.say, "Watch {this} bar"); assert.equal(withBraces.ops.length, 1);
  const prose = parseBrain("I could not do that.");
  assert.equal(prose.say, "I could not do that."); assert.equal(prose.ops, null); assert.equal(prose.song, null);
});

test("a full song wins only when ops are absent, and gets migrated", () => {
  const r = parseBrain(JSON.stringify({ say: "New one", song: { title: "X", bpm: 130, tracks: [{ id: "k", role: "kick", notes: [[36, 0, 0.2, 120]] }] } }));
  assert.equal(r.song.version, 3); assert.equal(r.song.title, "X"); assert.equal(r.song.sections.length, 1);
  const both = parseBrain(JSON.stringify({ say: "both", ops: [{ op: "tempo", bpm: 120 }], song: { title: "Y", tracks: [{ id: "k", role: "kick", notes: [] }] } }));
  assert.equal(both.song, null); assert.equal(both.ops.length, 1);
});

test("actions normalize", () => {
  assert.deepEqual(normalizeAction("play"), { type: "play" });
  assert.equal(normalizeAction({ type: "dance" }), null);
  assert.deepEqual(normalizeAction({ type: "recordHum", beats: 8, track: "lead" }), { type: "recordHum", section: undefined, bar: undefined, beats: 8, track: "lead" });
  assert.equal(extractJson("no json here"), null);
});
