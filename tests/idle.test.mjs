import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { idleWriter } from "../lib/idle.ts";

test("a burst of writes is one write per key, the newest, done later", async () => {
  const w = idleWriter(1500, 20); const done = [];
  for (let i = 0; i < 50; i++) w.schedule("song", () => done.push(`song ${i}`));
  w.schedule("library", () => done.push("library"));
  assert.deepEqual(done, [], "nothing is written inside the burst");
  assert.equal(w.pending(), 2);
  await sleep(60);
  assert.deepEqual(done, ["song 49", "library"]);
  assert.equal(w.pending(), 0);
});

test("flush writes what is waiting at once, and a failed write never blocks the next", () => {
  const w = idleWriter(1500, 10000); const done = [];
  w.schedule("a", () => { throw new Error("store full"); });
  w.schedule("b", () => done.push("b"));
  w.flush();
  assert.deepEqual(done, ["b"]);
  w.flush();
  assert.deepEqual(done, ["b"], "nothing runs twice");
});
