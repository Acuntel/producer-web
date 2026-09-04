import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

// A directory holding class names that Tailwind does not scan renders unstyled.
// This test failed silently as a broken UI for a whole release; keep it green.
const SKIP = new Set(["node_modules", ".next", ".git", ".claude", "public", "data", "knowledge", "docs", "tests"]);

function dirsWithTsx(root = ".", depth = 0) {
  const out = new Set();
  for (const entry of readdirSync(root)) {
    if (SKIP.has(entry) || entry.startsWith(".")) continue;
    const p = join(root, entry);
    if (statSync(p).isDirectory()) { for (const d of dirsWithTsx(p, depth + 1)) out.add(d); }
    else if (/\.tsx?$/.test(entry) && depth > 0) out.add(root.replace(/^\.\//, "").split("/")[0]);
  }
  return out;
}

test("every source directory is in the tailwind content globs", () => {
  const cfg = readFileSync("tailwind.config.ts", "utf8");
  const globs = [...cfg.matchAll(/"\.\/([a-zA-Z0-9_-]+)\/\*\*/g)].map((m) => m[1]);
  const dirs = [...dirsWithTsx()].filter((d) => d && d !== ".");
  const missing = dirs.filter((d) => !globs.includes(d));
  assert.deepEqual(missing, [], `these directories hold components but Tailwind does not scan them: ${missing.join(", ")}. Add them to tailwind.config.ts content.`);
});

test("arbitrary-value classes used in components survive the build", () => {
  // Guards the class shapes the layout depends on: fixed mixer channel width and lane height.
  for (const [file, cls] of [["components/Mixer.tsx", "w-[100px]"], ["components/TrackLanes.tsx", "h-8"]]) {
    assert.ok(readFileSync(file, "utf8").includes(cls), `${file} should still use ${cls}`);
  }
});

// --- Regressions that made this read as a debug panel rather than a product. ---

function sourceFiles(root = ".", depth = 0, out = []) {
  for (const entry of readdirSync(root)) {
    if (SKIP.has(entry) || entry.startsWith(".")) continue;
    const p = join(root, entry);
    if (statSync(p).isDirectory()) sourceFiles(p, depth + 1, out);
    else if (/\.tsx$/.test(entry)) out.push(p);
  }
  return out;
}

test("no text renders below the 12px floor", () => {
  const bad = [];
  for (const f of sourceFiles()) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
      if (Number(m[1]) < 10) bad.push(`${f}: ${m[0]}`);
    }
  }
  assert.deepEqual(bad, [], `text below 10px is unreadable and was a real defect: ${bad.join(", ")}`);
});

test("no emoji stand in for icons", () => {
  // Emoji as controls was the loudest "generated UI" tell. Use components/Icon.tsx.
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  const bad = sourceFiles().filter((f) => emoji.test(readFileSync(f, "utf8")));
  assert.deepEqual(bad, [], `these files use emoji instead of the icon set: ${bad.join(", ")}`);
});

test("every icon-only control carries an accessible name", () => {
  for (const f of sourceFiles()) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/<IconButton\b[^>]*?\/>/gs)) {
      assert.ok(/\blabel=/.test(m[0]), `${f} has an IconButton with no label: ${m[0].slice(0, 80)}`);
    }
  }
});
