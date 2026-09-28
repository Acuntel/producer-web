// Learning where a voice goes, from Brady's verdicts (masterprompt section 6, the browser half). Every placement the
// producer offers is a row with its score terms; a verdict labels it: "in" 1, "next one" 0, three quiet passes 0.5.
// The labels update Beta counts for section-role fit (term S), refit a small logistic P(in) over the terms every 20
// verdicts, track the first-offer keep rate per lane, roll cross-family transfers up by (beat family, voice family),
// and read the A/B pairs in the taste ledger as Bradley-Terry comparisons. Numbers only; nothing leaves the browser
// here (the taste sink mirrors moves and pairs to the account as it always has). Tone-free.
import type { Terms, PhraseRole, SectionRole } from "../song/placing/types";
import { ruleCounts, type RoleCounts } from "../song/placing/score";
import { setLearningSource } from "../engine/ledger";

export type Row = { moveId: string; at: number; lane: string; beatFamily: string | null; voiceFamily: string | null; kind: string; role: PhraseRole; section: SectionRole; terms: Terms; first: boolean; label: number | null };
export type Model = { w: number[]; b: number; lane: Record<string, number>; n: number; fittedAt: number };
export type State = { v: 1; counts: Record<string, [number, number]>; rows: Row[]; model: Model | null; labelsAtFit: number };

const KEY = "producer.placements.v1";
const REFIT_EVERY = 20;
const MAX_ROWS = 600;
type Store = { get: () => string | null; set: (s: string) => void };
let store: Store = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (s) => { try { localStorage.setItem(KEY, s); } catch { /* private window: the rule priors stand */ } },
};
/** Tests hand in their own storage. */
export function setStore(s: Store) { store = s; cache = null; }

let cache: State | null = null;
const fresh = (): State => ({ v: 1, counts: {}, rows: [], model: null, labelsAtFit: 0 });
export function load(): State {
  if (cache) return cache;
  try { const s = JSON.parse(store.get() ?? "null") as State | null; cache = s?.v === 1 ? s : fresh(); } catch { cache = fresh(); }
  return cache;
}
const save = (s: State) => { cache = s; store.set(JSON.stringify(s)); };

/** Beta counts for "a <role> in a <section> is kept": the rules' prior plus every verdict. */
export const roleCounts: RoleCounts = (role, section) => {
  const [a, b] = ruleCounts(role, section);
  const add = load().counts[`${role}|${section}`] ?? [0, 0];
  return [a + add[0], b + add[1]];
};

/** A placement the producer just landed. `first` is the first slot offered for this voice. */
export function recordOffer(r: Omit<Row, "at" | "label">): Row {
  const s = load();
  const row: Row = { ...r, at: Date.now(), label: null };
  s.rows = [...s.rows, row].slice(-MAX_ROWS);
  save(s);
  return row;
}

export type Verdict = "in" | "next" | "quiet";
const LABEL: Record<Verdict, number> = { in: 1, next: 0, quiet: 0.5 };

/** A verdict on a placement: the counts move, and every 20 labels the model is fitted again. */
export function recordVerdict(moveId: string, v: Verdict): Row | null {
  const s = load();
  const i = s.rows.findIndex((x) => x.moveId === moveId);
  if (i < 0 || s.rows[i].label !== null) return null;
  const y = LABEL[v];
  const row = { ...s.rows[i], label: y };
  s.rows = s.rows.map((x, j) => (j === i ? row : x));
  const k = `${row.role}|${row.section}`; const c = s.counts[k] ?? [0, 0];
  s.counts = { ...s.counts, [k]: [c[0] + y, c[1] + (1 - y)] };
  const labels = s.rows.filter((x) => x.label !== null).length;
  if (labels - s.labelsAtFit >= REFIT_EVERY) { s.model = fit(s.rows, pairComparisons()); s.labelsAtFit = labels; }
  save(s);
  return row;
}

export const TERMS: (keyof Terms)[] = ["H", "K", "R", "C", "M", "S", "B", "E", "G"];
const features = (t: Terms) => TERMS.map((k) => (k === "C" ? 1 - Math.min(1, t.C) : t[k]));
const sig = (z: number) => 1 / (1 + Math.exp(-z));

/** Logistic regression over the terms plus a bias per lane, L2-regularized gradient descent; an A/B pick is one
 *  Bradley-Terry comparison (the winner's terms minus the loser's, labelled 1, no bias). */
export function fit(rows: Row[], pairs: { a: Terms; b: Terms; chose: "a" | "b" }[] = [], steps = 400, lr = 0.5, l2 = 0.01): Model | null {
  const data = rows.filter((r) => r.label !== null);
  if (data.length < REFIT_EVERY) return null;
  const w = new Array(TERMS.length).fill(0); let b = 0; const lane: Record<string, number> = {};
  const X = data.map((r) => features(r.terms)), Y = data.map((r) => r.label as number), L = data.map((r) => r.lane);
  const P = pairs.map((p) => ({ x: features(p.a).map((v, i) => v - features(p.b)[i]), y: p.chose === "a" ? 1 : 0 }));
  const n = X.length + P.length;
  for (let it = 0; it < steps; it++) {
    const gw = new Array(w.length).fill(0); let gb = 0; const gl: Record<string, number> = {};
    X.forEach((x, i) => { const z = x.reduce((s, v, j) => s + v * w[j], b + (lane[L[i]] ?? 0)); const e = sig(z) - Y[i]; x.forEach((v, j) => (gw[j] += e * v)); gb += e; gl[L[i]] = (gl[L[i]] ?? 0) + e; });
    P.forEach((p) => { const e = sig(p.x.reduce((s, v, j) => s + v * w[j], 0)) - p.y; p.x.forEach((v, j) => (gw[j] += e * v)); });
    for (let j = 0; j < w.length; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]);
    b -= lr * (gb / n);
    for (const k of Object.keys(gl)) lane[k] = (lane[k] ?? 0) - lr * (gl[k] / n + l2 * (lane[k] ?? 0));
  }
  return { w: w.map((x) => Math.round(x * 1e4) / 1e4), b: Math.round(b * 1e4) / 1e4, lane, n: data.length, fittedAt: Date.now() };
}

/** P(in) for a slot's terms in a lane, once a model is fitted; null while the rules still decide. */
export function pInFor(lane: string): ((t: Terms) => number) | null {
  const m = load().model; if (!m) return null;
  return (t) => sig(features(t).reduce((s, v, j) => s + v * m.w[j], m.b + (m.lane[lane] ?? 0)));
}

/** A/B picks between two placements, from the taste ledger's pairs: a pair whose label starts "vocal:" carries each
 *  side's terms as JSON in its diffs. Other pairs (mix A/Bs) are counted, not used. */
export function pairComparisons(): { a: Terms; b: Terms; chose: "a" | "b" }[] {
  const out: { a: Terms; b: Terms; chose: "a" | "b" }[] = [];
  for (const p of readPairs()) {
    if (!p.label.startsWith("vocal:")) continue;
    try { out.push({ a: JSON.parse(p.aDiff) as Terms, b: JSON.parse(p.bDiff) as Terms, chose: p.chosen }); } catch { /* an older pair */ }
  }
  return out;
}
type PairRow = { label: string; aDiff: string; bDiff: string; chosen: "a" | "b" };
let readPairs: () => PairRow[] = () => { try { return JSON.parse(localStorage.getItem("producer.pairs.v1") ?? "[]") as PairRow[]; } catch { return []; } };
export function setPairsReader(f: () => PairRow[]) { readPairs = f; }

/** What the ledger shows: first-offer keep rate per lane, cross-family transfers by (beat family, voice family), the
 *  Beta counts that moved, the model, and the pairs read. */
export function learningSummary() {
  const s = load();
  const keep: Record<string, { offers: number; labelled: number; kept: number; rate: number | null }> = {};
  for (const r of s.rows) {
    if (!r.first) continue;
    const k = (keep[r.lane] ??= { offers: 0, labelled: 0, kept: 0, rate: null });
    k.offers++; if (r.label !== null) { k.labelled++; k.kept += r.label; }
  }
  for (const k of Object.values(keep)) k.rate = k.labelled ? Math.round((k.kept / k.labelled) * 1000) / 1000 : null;
  const transfers: Record<string, { n: number; labelled: number; liked: number; share: number | null }> = {};
  for (const r of s.rows) {
    if (!r.beatFamily || !r.voiceFamily || r.beatFamily === r.voiceFamily) continue;
    const t = (transfers[`${r.beatFamily}|${r.voiceFamily}`] ??= { n: 0, labelled: 0, liked: 0, share: null });
    t.n++; if (r.label !== null) { t.labelled++; t.liked += r.label; }
  }
  for (const t of Object.values(transfers)) t.share = t.labelled ? Math.round((t.liked / t.labelled) * 1000) / 1000 : null;
  const pairs = readPairs();
  return { rows: s.rows.length, labelled: s.rows.filter((r) => r.label !== null).length, keepRate: keep, transfers, counts: s.counts, model: s.model, pairs: { read: pairs.length, vocal: pairs.filter((p) => p.label.startsWith("vocal:")).length } };
}

// The ledger shows it (window.__ledger().learning under ?e2e=1 or ?trace=1).
setLearningSource(learningSummary);
