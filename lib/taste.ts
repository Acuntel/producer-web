// The taste ledger: every move the producer made, and the user's verdict on it.
// Lives in the browser; summarized into every exchange. This is the moat.
export type Verdict = "liked" | "killed" | null;
// A move is judged by what is said in the thirty seconds after it lands (docs/MASTERPROMPT_SMOOTH.md law 4): when it
// landed, when the judging words came and what they were, and the call. "none" is a window that closed with no
// verdict in it; it closes on time, on a verdict, or early when a newer move lands and takes the room's attention.
export type VerdictWindow = { landedAt: number; windowMs: number; saidAt: number | null; words: string | null; verdict: "liked" | "rejected" | "none"; closedBy: "verdict" | "time" | "next move" };
export type LedgerEntry = {
  id: string; at: number; title: string; said: string; move: string; listen?: string | null;
  factsSummary?: string; verdict: Verdict;
  window?: VerdictWindow;
  dead?: { passes: number; at: number };   // three passes of the loop and no verdict: the idea was wrong, not unfinished
};

const KEY = "producer.taste.v1";

// The account sink (lib/tasteSync.ts registers it after sign-in): every move, verdict and pair is mirrored to
// the user's rows in Supabase, and the local ledger is hydrated from them, so taste follows the account.
export type Pair = { at: number; title: string; label: string; chosen: "a" | "b"; aDiff: string; bDiff: string };
type Sink = { move?: (e: LedgerEntry) => void; pair?: (p: Pair) => void };
let sink: Sink = {};
export function setTasteSink(s: Sink) { sink = s; }

/** Merge rows from the account into the local ledger: union by id; a verdict on record wins over none. */
export function mergeLedger(rows: LedgerEntry[]): number {
  const local = loadLedger(); const byId = new Map(local.map((e) => [e.id, e]));
  let added = 0;
  for (const r of rows) {
    const have = byId.get(r.id);
    if (!have) { byId.set(r.id, r); added++; }
    else if (have.verdict === null && r.verdict !== null) byId.set(r.id, { ...have, verdict: r.verdict });
    else if (!have.dead && r.dead && have.verdict === null) byId.set(r.id, { ...have, dead: r.dead });
  }
  save([...byId.values()].sort((a, b) => a.at - b.at));
  return added;
}

export function loadLedger(): LedgerEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function save(entries: LedgerEntry[]) {
  try { localStorage.setItem(KEY, JSON.stringify(entries.slice(-200))); } catch {}
}

export function logMove(e: Omit<LedgerEntry, "id" | "at" | "verdict">): LedgerEntry {
  const entry: LedgerEntry = { ...e, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), verdict: null };
  save([...loadLedger(), entry]);
  sink.move?.(entry);
  return entry;
}

export function setVerdict(id: string, verdict: Verdict) {
  const all = loadLedger();
  const i = all.findIndex((x) => x.id === id);
  if (i < 0) return;
  all[i] = { ...all[i], verdict };
  save(all);
  sink.move?.(all[i]);
}

/** A verdict in the words people use for one. The one we watched was "I kinda like that", so liking counts, and a
 *  dislike is read first: "I don't like that" is a no. "Sounds like that record" is a reference, not a call, and
 *  "in" or "out" count only as the whole answer. Anything else is talk, and talk is not a verdict. */
export function judgeWords(text: string): "liked" | "rejected" | null {
  const t = text.toLowerCase().replace(/[\u2019]/g, "'").trim();
  if (/^(it'?s |that'?s )?out[.!]*$/.test(t) || /\b(no+|nah|nope|hate|worse|undo|go back|kill (it|that)|remove that|awful|terrible|not it|not feeling it|(do not|don'?t) (like|love))\b/.test(t)) return "rejected";
  if (/^(it'?s |that'?s |keep it )?in[.!]*$/.test(t) || /\b(love|perfect|yes+|sick|fire|keep (it|that)|that'?s it|nice|better|good|slaps|keeper|(that'?s|goes) hard|(i|we) (kinda |kind of |really |do |actually )?like (it|that|this)|(kinda|kind of|really) like (it|that|this))\b/.test(t)) return "liked";
  return null;
}
// The ledger's own words for the same call, kept for callers that speak them.
export function inferVerdictFromUtterance(text: string): Verdict {
  const v = judgeWords(text);
  return v === "liked" ? "liked" : v === "rejected" ? "killed" : null;
}

/** A move's window closed: what was said about it, if anything, rides on the move. A verdict in it is the move's verdict. */
export function attachWindow(id: string, w: VerdictWindow): LedgerEntry | null {
  const all = loadLedger();
  const i = all.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const verdict: Verdict = w.verdict === "liked" ? "liked" : w.verdict === "rejected" ? "killed" : all[i].verdict;
  all[i] = { ...all[i], window: w, verdict };
  save(all);
  sink.move?.(all[i]);
  return all[i];
}

/** Three passes of the loop and no verdict: the idea is marked dead, and dead ideas stay dead. */
export function markDead(id: string, passes: number, at = Date.now()): LedgerEntry | null {
  const all = loadLedger();
  const i = all.findIndex((x) => x.id === id);
  if (i < 0 || all[i].verdict !== null) return null;
  all[i] = { ...all[i], dead: { passes, at } };
  save(all);
  sink.move?.(all[i]);
  return all[i];
}

/** What the patience watch decided (lib/ritual/patience.ts), written onto the move. */
export function recordJudgement(j: { id: string; window: VerdictWindow } | { id: string; dead: number }): LedgerEntry | null {
  return "window" in j ? attachWindow(j.id, j.window) : markDead(j.id, j.dead);
}

export function tasteSummary(title?: string, max = 14): string {
  const all = loadLedger().filter((e) => e.verdict !== null || e.dead);
  if (all.length === 0) return "no verdicts yet";
  const mine = title ? all.filter((e) => e.title === title) : all;
  const pick = (mine.length ? mine : all).slice(-max);
  return pick.map((e) => `${e.verdict === "liked" ? "LIKED" : e.verdict === "killed" ? "KILLED" : `DEAD (${e.dead?.passes ?? 3} passes, no verdict)`}: ${e.move}${e.window?.words && e.window.verdict !== "none" ? ` ("${e.window.words.slice(0, 60)}")` : ""}${e.factsSummary ? ` (${e.factsSummary})` : ""}`).join("\n");
}

// Pairwise preferences from A/B auditions: the training set for a preference model later.

const PAIRS = "producer.pairs.v1";
export function loadPairs(): Pair[] { try { return JSON.parse(localStorage.getItem(PAIRS) ?? "[]"); } catch { return []; } }
export function logPair(p: Omit<Pair, "at">) { const full = { ...p, at: Date.now() }; try { localStorage.setItem(PAIRS, JSON.stringify([...loadPairs(), full].slice(-300))); } catch {} sink.pair?.(full); }
