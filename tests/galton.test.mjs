import { test } from "node:test";
import assert from "node:assert/strict";
import { binsFor, binLine, galtonSize, norm } from "../lib/brain/galton.ts";

test("the compact store ships and decodes", () => {
  assert.ok(galtonSize() > 1000, `expected over a thousand bins, got ${galtonSize()}`);
  const house = binsFor({ family: "house", tempo_band: "122-132", mode: "minor" }, 1);
  assert.equal(house.length, 1);
  const b = house[0];
  assert.equal(b.pins.family, "house"); assert.equal(b.pins.tempo_band, "122-132"); assert.equal(b.pins.mode, "minor");
  assert.ok(b.count >= 20 && typeof b.tempo === "number" && b.tempo > 120 && b.tempo < 132, `house bin: ${b.count} songs at ${b.tempo}`);
  assert.ok(b.exemplars.length > 0 && b.exemplars.every((x) => typeof x === "string" && !x.includes(";")), "exemplars resolve to names with & between artists");
  const line = binLine(b);
  assert.ok(/family house/.test(line) && /tempo p50/.test(line), line);
});

test("bins are matched by pin position, largest first, and unknown pins never match a named value", () => {
  const all = binsFor({ family: "hiphop" }, 3);
  assert.ok(all.length >= 1 && all.every((b) => b.pins.family === "hiphop"));
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].count >= all[i].count, "sorted by count");
  assert.equal(binsFor({ family: "no-such-family" }).length, 0);
});

test("norm folds names the way the store does", () => {
  assert.equal(norm("Elvis Presley feat. The Jordanaires"), "elvis presley");
  assert.equal(norm("Sam Smith & Kim Petras"), "sam smith and kim petras");
  assert.equal(norm("  Chloé  Robinson "), "chloe robinson");
});
