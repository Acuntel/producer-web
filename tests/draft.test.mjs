// The first draft (docs/MASTERPROMPT_PRODUCER.md section 3): a complete record from a name's DNA in
// milliseconds, different for every name and every take, and the same on every reload of the same record.
// The resolver runs here on the store that ships in the repo (the prints and the Galton bins), with no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileDraft, draftSignature, audibleDistance, draftSeed, modeOf } from "../lib/song/draft.ts";
import { parseProgression, chordsPerBar } from "../lib/song/drafting/theory.ts";
import { normalizeCodes } from "../lib/song/drafting/form.ts";
import { recipeIds } from "../lib/song/drafting/recipes.ts";
import { resolveDraftDna } from "../lib/brain/draftDna.ts";
import { migrateSong } from "../lib/song/migrate.ts";

// Twenty artists the store holds (tests/draft.test.mjs picks them from the prints, data/prints).
export const BATTERY = ["Chris Lake", "Disclosure", "Duke Dumont", "Fisher", "Tiesto", "Armin van Buuren", "Dua Lipa", "The Weeknd", "Tame Impala", "Daft Punk",
  "Calvin Harris", "Avicii", "Skrillex", "Four Tet", "Bicep", "Eric Prydz", "Drake", "Taylor Swift", "Headhunterz", "Artful Dodger"];

const valid = (s) => {
  const ids = new Set(s.tracks.map((t) => t.id));
  for (const sec of s.sections) { assert.ok(sec.bars > 0); for (const a of sec.active) assert.ok(ids.has(a), `${sec.id} names ${a}`); }
  for (const id of s.arrangement) assert.ok(s.sections.some((x) => x.id === id));
  for (const t of s.tracks) for (const n of t.notes) { assert.ok(n[0] >= 12 && n[0] <= 108, `${t.id} pitch ${n[0]}`); assert.ok(n[1] >= 0 && n[1] < t.loopBeats, `${t.id} at ${n[1]} of ${t.loopBeats}`); assert.ok(n[2] > 0 && n[3] >= 1 && n[3] <= 127); }
};

test("twenty names in the store give twenty complete drafts that all sound different", async () => {
  const drafts = [];
  for (const name of BATTERY) {
    const dna = await resolveDraftDna(name);
    assert.ok(dna, `${name} resolves`);
    assert.equal(dna.tier, "artist", `${name} comes from the artist's records`);
    const t0 = performance.now();
    const s = compileDraft(dna, { songId: "rec_battery" });
    const ms = performance.now() - t0;
    assert.ok(ms < 50, `${name} compiled in ${ms.toFixed(1)} ms`);
    valid(s);
    for (const role of ["kick", "bass", "hook", "pad"]) assert.ok(s.tracks.some((t) => t.id === role && t.notes.length), `${name} has a ${role}`);
    assert.ok(s.sections.length >= 6 && s.sections.some((x) => /drop|chorus/i.test(x.name) && (x.energy ?? 0) >= 0.85), `${name} has a whole form with a peak`);
    assert.equal(s.source?.name, dna.name); assert.equal(s.draft?.take, 0);
    drafts.push([name, s]);
  }
  let min = 99, worst = null;
  for (let i = 0; i < drafts.length; i++) for (let j = i + 1; j < drafts.length; j++) {
    const d = audibleDistance(drafts[i][1], drafts[j][1]);
    if (d < min) { min = d; worst = `${drafts[i][0]} / ${drafts[j][0]}`; }
    assert.notEqual(draftSignature(drafts[i][1]).hook, draftSignature(drafts[j][1]).hook, "no two share a hook");
  }
  assert.ok(min >= 4, `every pair differs in at least 4 of 10 audible features (closest: ${worst} at ${min})`);
});

test("the same name on the same record is the same draft, a new take is a new one, and it survives a save", async () => {
  const dna = await resolveDraftDna("Chris Lake");
  const a = compileDraft(dna, { songId: "rec_x" }), b = compileDraft(structuredClone(dna), { songId: "rec_x" });
  assert.deepEqual(a, b);
  const reloaded = migrateSong(JSON.parse(JSON.stringify(a)));
  assert.deepEqual(compileDraft(reloaded.draft.dna, { songId: reloaded.id, take: reloaded.draft.take }), a, "the saved record recompiles to itself");
  const next = compileDraft(dna, { songId: "rec_x", take: 1 });
  assert.ok(audibleDistance(a, next) >= 3, "next one is audibly new");
  assert.equal(next.draft.take, 1); assert.equal(next.bpm, a.bpm, "on the same DNA: the source's tempo holds");
  assert.notEqual(draftSeed("rec_x", "chris lake", 0), draftSeed("rec_y", "chris lake", 0), "another record is another seed");
  const busy = compileDraft(dna, { songId: "rec_x", take: 1, steer: { busy: -1 } });
  const count = (s) => s.tracks.reduce((n, t) => n + t.notes.length, 0);
  assert.ok(count(busy) < count(next), `too busy thins it out (${count(busy)} against ${count(next)})`);
});

test("a lane name drafts from the recipe, and a name nobody knows is not guessed", async () => {
  const lane = await resolveDraftDna("afro house");
  assert.equal(lane?.tier, "lane"); assert.equal(lane?.lane, "afro-house");
  valid(compileDraft(lane, { songId: "rec_lane" }));
  assert.equal(await resolveDraftDna("Qzxv Nobody Plorp"), null);
  for (const id of recipeIds()) valid(compileDraft({ ...lane, lane: id, key: id }, { songId: `rec_${id}` }));
});

test("progressions, modes and forms read the way the store writes them", () => {
  assert.deepEqual(parseProgression("i-bVI-bIII-bVII", 9).map((c) => c.root), [9, 5, 0, 7]);
  assert.deepEqual(parseProgression("I V vi IV", 0).map((c) => [c.root, c.minor]), [[0, false], [7, false], [9, true], [5, false]]);
  assert.equal(parseProgression("i9 (one chord, bass i-iv-v)", 2).length, 1);
  assert.equal(chordsPerBar(parseProgression("i bVI bVII", 0), 8).length, 8);
  assert.equal(modeOf("i-bVII-bVI"), "minor"); assert.equal(modeOf("vi-IV-I-V"), "major"); assert.equal(modeOf("bVI v"), null);
  assert.deepEqual(normalizeCodes(["V", "D", "D", "K", "D", "O"], false), ["I", "V", "B", "D", "K", "B", "D", "O"]);
  const pop = normalizeCodes(["I", "V", "D", "V", "D", "K", "D"], true);
  assert.equal(pop[0], "I"); assert.equal(pop[pop.length - 1], "O"); assert.ok(pop.length <= 9);
});
