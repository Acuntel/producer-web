import { test } from "node:test";
import assert from "node:assert/strict";
import { progressionOf, harmonyClass, structureOf, grid16, bass16, syncopationOf, familyFromGenres, keyPcOf } from "../lib/brain/harmony.ts";

test("chords in the record's key become a condensed roman progression with its class", () => {
  assert.deepEqual(keyPcOf("A minor"), { pc: 9, mode: "minor" });
  assert.equal(progressionOf(["Am", "Am", "F", "C", "G", "Am"], "A minor"), "i bVI bIII bVII i");
  assert.equal(harmonyClass("i bVI bIII bVII i"), "minor_axis");
  assert.equal(progressionOf(["C", "G", "Am", "F"], "C major"), "I V vi IV"); assert.equal(harmonyClass("I V vi IV"), "axis");
  assert.equal(harmonyClass("i"), "one_chord"); assert.equal(harmonyClass("I IV V I"), "blues"); assert.equal(progressionOf(["-", "-"], "C major"), null);
});

test("energy blocks become structure codes, grids fold to the store's form, genres fold to a family", () => {
  assert.equal(structureOf([{ energy: 0.3 }, { energy: 0.6 }, { energy: 0.95 }, { energy: 0.9 }, { energy: 0.4 }, { energy: 0.92 }, { energy: 0.3 }]), "I B D K D O");
  assert.equal(grid16("X...x...X...g..."), "X...X...X......."); assert.equal(grid16("bad"), null);
  assert.equal(bass16("X.X.X.X."), "X...X...X...X..."); assert.equal(syncopationOf("X..X..X...X....."), 0.75);
  assert.equal(familyFromGenres([["tech house", 0.4], ["techno", 0.3]]), "house"); assert.equal(familyFromGenres(["drum and bass track"]), "dnb"); assert.equal(familyFromGenres([]), null);
});
