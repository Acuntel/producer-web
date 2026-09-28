// Learning where a voice goes (lib/learn/placement.ts): verdicts label the rows, the Beta counts move, a model is
// fitted every 20 verdicts and ranks like the verdicts did, the keep rate is kept per lane, transfers roll up by
// (beat family, voice family), and A/B pairs are read.
import test from "node:test";
import assert from "node:assert/strict";
import { setStore, setPairsReader, recordOffer, recordVerdict, roleCounts, pInFor, learningSummary, fit, load } from "../lib/learn/placement.ts";

let mem = null;
setStore({ get: () => mem, set: (s) => { mem = s; } });
setPairsReader(() => [{ label: "vocal:drop-hook vs lead-in", aDiff: JSON.stringify({ H: 0.9, K: 0.9, R: 0.9, C: 0.1, M: 0.9, S: 0.8, B: 0.9, E: 0.9, G: 1 }), bDiff: JSON.stringify({ H: 0.3, K: 0.4, R: 0.5, C: 0.5, M: 0.3, S: 0.4, B: 0.5, E: 0.3, G: 0.4 }), chosen: "a" }, { label: "mix a/b", aDiff: "", bDiff: "", chosen: "b" }]);

const terms = (good) => ({ H: good ? 0.85 : 0.3, K: good ? 0.9 : 0.5, R: 0.7, C: good ? 0.1 : 0.6, M: good ? 0.8 : 0.3, S: 0.6, B: good ? 0.9 : 0.4, E: good ? 0.8 : 0.3, G: 0.6 });

test("a verdict moves the section-role counts from the rules' prior", () => {
  const [a0, b0] = roleCounts("hook", "drop");
  recordOffer({ moveId: "m0", lane: "tech-house", beatFamily: "house", voiceFamily: "pop", kind: "drop-hook", role: "hook", section: "drop", terms: terms(true), first: true });
  recordVerdict("m0", "in");
  const [a1, b1] = roleCounts("hook", "drop");
  assert.equal(a1, a0 + 1); assert.equal(b1, b0);
  assert.equal(recordVerdict("m0", "next"), null, "a row is labelled once");
});

test("after 20 verdicts a model is fitted, and it prefers what Brady kept", () => {
  assert.equal(pInFor("tech-house"), null);
  for (let i = 1; i <= 24; i++) {
    const good = i % 2 === 0;
    recordOffer({ moveId: `m${i}`, lane: "tech-house", beatFamily: "house", voiceFamily: i % 3 ? "pop" : "house", kind: "drop-hook", role: good ? "hook" : "verse", section: "drop", terms: terms(good), first: i % 4 === 0 });
    recordVerdict(`m${i}`, good ? "in" : i % 5 === 0 ? "quiet" : "next");
  }
  const p = pInFor("tech-house");
  assert.ok(p, "a model exists after 20 labels");
  assert.ok(p(terms(true)) > p(terms(false)) + 0.1, `kept ${p(terms(true))} vs passed ${p(terms(false))}`);
  assert.ok(load().model.n >= 20);
});

test("the ledger's view: first-offer keep rate per lane, transfers by family pair, pairs read", () => {
  const s = learningSummary();
  assert.ok(s.keepRate["tech-house"].labelled >= 6);
  assert.ok(s.keepRate["tech-house"].rate >= 0 && s.keepRate["tech-house"].rate <= 1);
  assert.ok(s.transfers["house|pop"].n > 0);
  assert.equal(s.pairs.read, 2); assert.equal(s.pairs.vocal, 1);
});

test("an A/B pick counts as a Bradley-Terry comparison in the fit", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ moveId: `x${i}`, at: 0, lane: "l", beatFamily: null, voiceFamily: null, kind: "k", role: "hook", section: "drop", terms: terms(i % 2 === 0), first: false, label: 0.5 }));
  const flat = fit(rows, []);
  const withPairs = fit(rows, Array.from({ length: 10 }, () => ({ a: terms(true), b: terms(false), chose: "a" })));
  const score = (m, t) => ["H", "K", "R", "C", "M", "S", "B", "E", "G"].reduce((s, k, j) => s + m.w[j] * (k === "C" ? 1 - t.C : t[k]), 0);
  assert.ok(score(withPairs, terms(true)) - score(withPairs, terms(false)) > score(flat, terms(true)) - score(flat, terms(false)));
});
