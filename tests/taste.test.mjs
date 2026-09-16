import { test } from "node:test";
import assert from "node:assert/strict";

// The ledger lives in localStorage; a small shim stands in for the browser.
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { logMove, setVerdict, mergeLedger, loadLedger, tasteSummary, setTasteSink, logPair, loadPairs } = await import("../lib/taste.ts");

test("moves and verdicts reach the account sink, and account rows merge without duplicates", () => {
  const seen = [];
  setTasteSink({ move: (e) => seen.push(e), pair: (p) => seen.push(p) });
  const a = logMove({ title: "T", said: "darker", move: "cut the highs on the pad" });
  setVerdict(a.id, "liked");
  assert.equal(seen.length, 2, "logMove and setVerdict both mirror");
  assert.equal(seen[1].verdict, "liked");
  // Another device knew two more moves and a verdict on this one.
  const added = mergeLedger([{ ...a, verdict: "killed" }, { id: "x1", at: 1, title: "T", said: "brighter", move: "opened the filter", verdict: "killed" }, { id: "x2", at: 2, title: "T", said: "bass", move: "rolling bass", verdict: null }]);
  assert.equal(added, 2);
  const all = loadLedger();
  assert.equal(all.length, 3);
  assert.equal(all.find((e) => e.id === a.id).verdict, "liked", "a verdict already given locally is kept");
  assert.match(tasteSummary("T"), /LIKED: cut the highs on the pad/);
  assert.match(tasteSummary("T"), /KILLED: opened the filter/);
  logPair({ title: "T", label: "hats", chosen: "b", aDiff: "closed", bDiff: "open" });
  assert.equal(loadPairs().length, 1); assert.equal(seen.length, 3, "pairs mirror too");
  setTasteSink({});
});
