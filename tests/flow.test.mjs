import { test } from "node:test";
import assert from "node:assert/strict";
import { flowNotes } from "../lib/brain/flow.ts";

const song = (sections) => ({ title: "T", bpm: 126, key: "A minor", lane: "tech-house", tracks: [], arrangement: sections.map((s) => s.id), sections: sections.map((s) => ({ active: [], ...s })), humanize: { seed: 1 } });

test("the flow check names a short section, a louder second drop, a shallow break, and a hard boundary", () => {
  const notes = flowNotes(song([
    { id: "intro", name: "Intro", bars: 16, energy: 0.3 }, { id: "build", name: "Build", bars: 4, energy: 0.5 }, { id: "drop", name: "Drop", bars: 16, energy: 0.9 },
    { id: "break", name: "Breakdown", bars: 8, energy: 0.85 }, { id: "drop2", name: "Drop 2", bars: 16, energy: 1.0 }, { id: "verse", name: "Verse", bars: 16, energy: 0.3 }, { id: "outro", name: "Outro", bars: 16, energy: 0.2 },
  ]));
  assert.ok(notes.some((n) => /Drop 2 into Verse jumps/.test(n)), notes.join(" | "));
  assert.ok(notes.some((n) => /Build is 4 bars/.test(n)), notes.join(" | "));
  assert.ok(notes.some((n) => /Drop 2 is set louder/.test(n)), notes.join(" | "));
  assert.ok(notes.some((n) => /Breakdown only falls/.test(n)), notes.join(" | "));
  
});

test("a record shaped like the store passes quietly", () => {
  const notes = flowNotes(song([
    { id: "intro", name: "Intro", bars: 16, energy: 0.3 }, { id: "build", name: "Build", bars: 8, energy: 0.6 }, { id: "drop", name: "Drop", bars: 16, energy: 0.9 },
    { id: "break", name: "Breakdown", bars: 16, energy: 0.55 }, { id: "drop2", name: "Drop 2", bars: 16, energy: 0.88 }, { id: "outro", name: "Outro", bars: 16, energy: 0.5 },
  ]));
  assert.deepEqual(notes, []);
});
