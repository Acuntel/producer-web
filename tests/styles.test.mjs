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
  // Guards the class shapes the layout depends on: fixed mixer width, tiny labels, lane height.
  for (const [file, cls] of [["components/Mixer.tsx", "w-[74px]"], ["components/Mixer.tsx", "text-[8px]"], ["components/TrackLanes.tsx", "h-7"], ["components/CriticPanel.tsx", "text-[10px]"]]) {
    assert.ok(readFileSync(file, "utf8").includes(cls), `${file} should still use ${cls}`);
  }
});
