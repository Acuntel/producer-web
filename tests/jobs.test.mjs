// The job queue: FIFO, a job lands when its change lands, and a new epoch cancels the work made before it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JobQueue, jobLine } from "../lib/jobs/queue.ts";
import { initialQ, nextAsk, askOffer, readAnswer, QUESTION_GAP_MS, BEAT_LINE } from "../lib/ritual/questions.ts";
import { gapsOf, offerLine, offerOps } from "../lib/song/drafting/gaps.ts";
import { compileDraft } from "../lib/song/draft.ts";
import { applyOps } from "../lib/song/ops.ts";
import { resolveDraftDna } from "../lib/brain/draftDna.ts";

const landing = (bar) => { let fire; const landed = new Promise((r) => (fire = r)); return { l: { landsAtBar: bar, landsAtTime: 1, landed }, fire }; };

test("jobs run one at a time in order, and resolve only when their landing lands", async () => {
  const q = new JobQueue(); const order = [];
  const a = landing(17);
  const ja = q.enqueue({ text: "a", origin: "task", songId: "r" }, async () => { order.push("a"); return { landing: a.l }; });
  const jb = q.enqueue({ text: "b", origin: "task", songId: "r" }, async () => { order.push("b"); return {}; });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(order, ["a"], "b waits for a to land");
  assert.equal(q.current().state, "landing"); assert.equal(q.current().landsAtBar, 17);
  assert.equal(jobLine(q.current()), "It lands on bar 17.");
  a.fire(true);
  assert.equal((await ja.done).state, "landed");
  assert.equal((await jb.done).state, "landed"); assert.deepEqual(order, ["a", "b"]);
  await q.whenIdle(); assert.ok(q.idle());
});

test("a new epoch (stop, undo, new, open) cancels queued and running work, and a runner sees it", async () => {
  const q = new JobQueue(); let saw = null;
  const ja = q.enqueue({ text: "slow", origin: "task", songId: "r" }, async (_j, alive) => { await new Promise((r) => setTimeout(r, 20)); saw = alive(); return {}; });
  const jb = q.enqueue({ text: "queued", origin: "task", songId: "r" }, async () => ({}));
  q.bump("undo");
  assert.equal((await jb.done).state, "cancelled");
  assert.equal((await ja.done).state, "cancelled", "a cancelled job resolves at once");
  await new Promise((r) => setTimeout(r, 40)); assert.equal(saw, false, "the runner still in flight sees it and drops its result");
  const jc = q.enqueue({ text: "after", origin: "task", songId: "r" }, async () => ({}));
  assert.equal((await jc.done).state, "landed");
});

test("the beat question comes once between 16 and 32 bars, then one offer, never two in 30 s, silence is not a no", async () => {
  const song = compileDraft(await resolveDraftDna("Chris Lake"), { songId: "rec_q" });
  const offers = () => gapsOf(song);
  let s = initialQ(), t = 0;
  assert.equal(nextAsk(s, "d0", 8, t, false, offers).ask, null, "not before 16 bars");
  assert.equal(nextAsk(s, "d0", 18, t, true, offers).ask, null, "never while someone talks");
  let r = nextAsk(s, "d0", 18, t, false, offers); assert.equal(r.ask.line, BEAT_LINE); s = r.state;
  assert.equal(nextAsk(s, "d0", 20, t + 10_000, false, offers).ask, null, "one question at a time");
  r = nextAsk(s, "d0", 34, t + QUESTION_GAP_MS, false, offers);   // nobody answered: it closes, and the offer is next
  assert.equal(r.ask.kind, "offer"); assert.ok(r.ask.offers.length >= 1); s = r.state;
  assert.equal(nextAsk(s, "d0", 60, t + QUESTION_GAP_MS * 3, false, offers).ask, null, "one offer per draft");
  assert.equal(askOffer(s, "Try it another way?", t + QUESTION_GAP_MS + 5000, false).ask, null, "the 30 s rule holds for every question");
  const late = nextAsk(initialQ(), "d1", 40, 0, false, offers); assert.equal(late.ask, null); assert.equal(late.state.beatFor, "d1");
  assert.match(offerLine(gapsOf(song)), /^Want .+\?$/);
});

test("answers: yes keeps, no and a reason steer the next seed, an option picks the offer and its ops apply", async () => {
  const beat = { kind: "beat", line: BEAT_LINE, at: 0, draft: "d" };
  assert.equal(readAnswer("yeah I love it", beat).verdict, "yes");
  assert.equal(readAnswer("nah", beat).verdict, "no");
  assert.deepEqual(readAnswer("too busy", beat), { verdict: "no", option: null, steer: { busy: -1 } });
  assert.equal(readAnswer("turn the hats up", beat), null, "not an answer");
  const song = compileDraft(await resolveDraftDna("Tiesto"), { songId: "rec_o" });
  const offer = { kind: "offer", line: "", at: 0, draft: "d", offers: gapsOf(song) };
  const want = offer.offers.find((o) => o.id === "roll") ?? offer.offers[0];
  assert.equal(readAnswer(`the ${want.id === "roll" ? "snare roll" : want.id}`, offer).option, want.id);
  for (const o of offer.offers.filter((x) => x.id !== "vocal")) { const r = applyOps(song, offerOps(song, o.id)); assert.ok(r.applied >= 2 && !r.skipped.length, `${o.id}: ${r.skipped}`); }
});
