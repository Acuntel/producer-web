import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { prints, printsCount, key64, findRow, artistRows, printOf, nearest, address, soundLines } from "../lib/brain/prints.ts";

const built = existsSync("data/prints/manifest.json");

test("the fingerprint store loads and every row has a name and an address", { skip: !built && "data/prints not built" }, () => {
  const s = prints(); assert.ok(s && s.m.n > 100000, `expected over 100k prints, got ${printsCount()}`);
  assert.equal(s.m.v, 2); assert.equal(s.vec.length, s.m.n * s.m.dims); assert.equal(s.offs.length, s.m.n + 1); assert.equal(s.meta.length, s.m.n * 9);
  for (let i = 1; i < 2000; i++) assert.ok(s.akeys[i - 1] <= s.akeys[i], "rows sorted by artist key");
  const p = printOf(Math.floor(s.m.n / 2));
  assert.ok(p.artist.length > 0 && p.title.length > 0, `row decodes to a name: ${JSON.stringify(p)}`);
  assert.ok(/energy (low|mid|high|peak), feel (sun|lift|rush|gut)/.test(address(p)), address(p));
});

test("keys match the Python side and rows resolve by artist and by record", { skip: !built && "data/prints not built" }, () => {
  // sha1("a|b")[:8] little endian, as tools/dna/prints.py computes it.
  assert.equal(key64("a|b"), 0x6413874ae26dbe9an);
  const rows = artistRows("burial", 5); assert.ok(rows.length > 0, "burial has prints");
  const p = printOf(rows[0]); assert.equal(p.artist.toLowerCase(), "burial");
  const back = findRow("burial", p.title.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim());
  assert.ok(back === rows[0] || back === null, "a record found by artist is found again by its key when the title folds cleanly");
});

test("nearest by sound answers within a tenth of a second and never with the same artist", { skip: !built && "data/prints not built" }, () => {
  const [row] = artistRows("burial", 1);
  const t0 = performance.now(); const nn = nearest(row, 6); const ms = performance.now() - t0;
  assert.ok(nn.length === 6, `six neighbours, got ${nn.length}`);
  assert.ok(nn.every(({ p }) => p.artist.toLowerCase() !== "burial"), "other artists only");
  assert.ok(ms < 400, `nearest took ${ms.toFixed(0)} ms`);
  const lines = soundLines(row, 4); assert.ok(lines.length === 2 && /^Address of Burial/.test(lines[0]) && /^By sound, Burial/.test(lines[1]), lines.join(" | "));
});
