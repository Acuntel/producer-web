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

// The ledger learns from verdicts (docs/MASTERPROMPT_SMOOTH.md phase 5): a move is judged by what is said in the thirty
// seconds after it lands, and three passes of the loop with no verdict mark the idea dead. Driven through the same
// tick the studio runs twice a second (lib/ritual/patience.ts step), with the loop count a transport would give.
const { watchFor, step, hearWords, judged, superseded } = await import("../lib/ritual/patience.ts");
const { judgeWords, recordJudgement } = await import("../lib/taste.ts");
const { verdictSummary } = await import("../lib/scorecard.ts");

// A transport looping `passSec` seconds, started `phase` of the way into a pass when the move landed.
const run = (w, from, to, passSec, phase, talking = () => false) => {
  const events = [];
  for (let t = from; t <= to; t += 500) {
    const loops = Math.floor(((t - w.landedAt) / 1000 + phase * passSec) / passSec);
    const r = step(w, t, loops, talking(t));
    w = r.watch;
    if (r.judge) recordJudgement(r.judge);
    if (r.what) events.push({ what: r.what, at: t - w.landedAt, say: r.say });
  }
  return { w, events };
};

test("three passes of a loop with no verdict mark the idea dead, after its thirty seconds are over", () => {
  store.clear();
  const t0 = 5_000_000;
  const beat = logMove({ title: "FLIP", said: "to the beat", move: "drums and bass under the chop at 128" });
  // A two bar loop at 128 is 3.75 s a pass. Nobody says a word.
  const { events } = run(watchFor("beat", beat.id, t0, 0, 0.2), t0, t0 + 45000, 3.75, 0.2);
  const e = loadLedger().find((x) => x.id === beat.id);
  assert.deepEqual(events.map((x) => x.what), ["prompt", "close", "swap"], "asked, the window closed empty, then the idea died");
  const [prompt, close, swap] = events;
  assert.ok(prompt.at >= 8000 && prompt.at <= 20000, `the prompt comes at the first pass after 8 s: ${prompt.at} ms`);
  assert.equal(close.at, 30000, "the window is thirty seconds");
  assert.ok(swap.at >= 30000, "never dead inside its own window, however short the loop");
  assert.match(swap.say, /Three times round and no verdict/);
  assert.deepEqual(e.window, { landedAt: t0, windowMs: 30000, saidAt: null, words: null, verdict: "none", closedBy: "time" });
  assert.ok(e.dead && e.dead.passes >= 3, `dead after ${e.dead?.passes} passes`);
  assert.equal(e.verdict, null, "dead is not a verdict somebody said; it is its own mark");
  assert.match(tasteSummary("FLIP"), /DEAD \(\d+ passes, no verdict\): drums and bass under the chop at 128/);

  // A long loop (16 bars at 128, 30 s a pass) is not dead at thirty seconds: three passes is a minute and a half.
  const slow = logMove({ title: "FLIP", said: "next one", move: "a sixteen bar loop" });
  const s = run(watchFor("next", slow.id, t0, 0, 0.1), t0, t0 + 100000, 30, 0.1);
  const swapAt = s.events.find((x) => x.what === "swap")?.at;
  assert.ok(swapAt >= 3 * 30000 - 0.1 * 30000, `dead only after three passes of the long loop: ${swapAt} ms`);
});

test("a verdict inside the window rides on its move with the window; words after it, or a newer move, judge nothing", () => {
  store.clear();
  const t0 = 9_000_000;
  const chop = logMove({ title: "FLIP", said: "I'm making a chop", move: "chopped: 2 bars of Summer at 0:07" });
  const next = logMove({ title: "FLIP", said: "next one", move: "went to the next line: 2 bars of Summer at 0:14" });
  let wc = watchFor("chop", chop.id, t0, 0, 0.1);
  wc = hearWords(wc, "loop it alone", judgeWords("loop it alone"), t0 + 3000);   // talk, not a verdict
  // The next line lands five seconds later: the chop's window closes early, with what was said over it.
  recordJudgement(superseded(wc));
  let wn = watchFor("next", next.id, t0 + 5000, 1, 0.4);
  const before = wn;
  wn = hearWords(wn, "I kinda like that", judgeWords("I kinda like that"), t0 + 5000 + 12000);
  recordJudgement(judged(before, wn));
  const late = hearWords(wn, "no", judgeWords("no"), t0 + 5000 + 31000);
  assert.equal(late, wn, "a verdict already said is not overwritten, and nothing is judged after thirty seconds");
  const { events } = run(wn, t0 + 17000, t0 + 80000, 3.75, 0.4);
  assert.deepEqual(events, [], "a judged idea is never prompted again and never dies");
  const [c, n] = [chop.id, next.id].map((id) => loadLedger().find((x) => x.id === id));
  assert.deepEqual(c.window, { landedAt: t0, windowMs: 30000, saidAt: t0 + 3000, words: "loop it alone", verdict: "none", closedBy: "next move" });
  assert.deepEqual(n.window, { landedAt: t0 + 5000, windowMs: 30000, saidAt: t0 + 17000, words: "I kinda like that", verdict: "liked", closedBy: "verdict" });
  assert.equal(n.verdict, "liked");
  assert.match(tasteSummary("FLIP"), /LIKED: went to the next line: 2 bars of Summer at 0:14 \("I kinda like that"\)/);
  const v = verdictSummary();
  assert.deepEqual({ ...v }, { windows: 2, liked: 1, rejected: 0, none: 1, dead: 0, medianMs: 12000 });
  assert.equal(judgeWords("sounds like that Michael Jordan song"), null, "a reference is not a call");
  assert.equal(judgeWords("I don't like that"), "rejected");
  // An account that knew the idea died marks it dead here too.
  mergeLedger([{ ...c, dead: { passes: 3, at: t0 + 40000 } }]);
  assert.equal(loadLedger().find((x) => x.id === chop.id).dead.passes, 3);
});
