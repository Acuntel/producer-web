import { test } from "node:test";
import assert from "node:assert/strict";
import { euclid, rotateGrid, density, polymeter, describe, contour, goldenBar, degreesToMidi, NAMED } from "../lib/song/patterns.ts";

test("Euclid makes the rhythms the world dances to", () => {
  assert.equal(euclid(4, 16), "X...X...X...X...");
  assert.equal(euclid(3, 8), "X..X..X.");                 // the tresillo in eighths
  assert.equal(euclid(5, 8), "X.XX.XX.");                 // the cinquillo
  assert.equal(euclid(7, 16, 2), rotateGrid(euclid(7, 16), 2));
  assert.equal(euclid(0, 8), "........"); assert.equal(euclid(8, 8), "XXXXXXXX");
});

test("density, polymeter, description and contour behave", () => {
  assert.equal(density("X...X...X...X...", 8).split("").filter((c) => c === "X").length, 8);
  assert.equal(density("XXXXXXXXXXXXXXXX", 4), "X...X...X...X...");
  assert.equal(polymeter("X..", "X...X...", 8), "X..XX.X.");
  assert.equal(describe("X...X...X...X..."), "four floor (4 of 16)");
  assert.equal(describe(euclid(7, 16, 2)), "E(7,16) rotated by 2");
  assert.equal(describe(NAMED.son_clave), "son clave (5 of 16)");
  assert.deepEqual(contour("flat", 4), [0, 0, 0, 0]); assert.equal(contour("rise", 8).at(-1), 7); assert.equal(contour("arch", 9)[4], 7);
  assert.equal(goldenBar(64), 40);
  assert.deepEqual(degreesToMidi([0, 2, 4, 7, -1], 57, "minor"), [57, 60, 64, 69, 55]);
});
