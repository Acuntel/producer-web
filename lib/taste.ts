// The taste ledger: every move the producer made, and the user's verdict on it.
// Lives in the browser; summarized into every exchange. This is the moat.
export type Verdict = "liked" | "killed" | null;
export type LedgerEntry = {
  id: string; at: number; title: string; said: string; move: string; listen?: string | null;
  factsSummary?: string; verdict: Verdict;
};

const KEY = "producer.taste.v1";

export function loadLedger(): LedgerEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function save(entries: LedgerEntry[]) {
  try { localStorage.setItem(KEY, JSON.stringify(entries.slice(-200))); } catch {}
}

export function logMove(e: Omit<LedgerEntry, "id" | "at" | "verdict">): LedgerEntry {
  const entry: LedgerEntry = { ...e, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), verdict: null };
  save([...loadLedger(), entry]);
  return entry;
}

export function setVerdict(id: string, verdict: Verdict) {
  const all = loadLedger();
  const i = all.findIndex((x) => x.id === id);
  if (i < 0) return;
  all[i] = { ...all[i], verdict };
  save(all);
}

// Infer verdicts from the conversation: a move that was followed by another
// request with no complaint passed; explicit words decide the rest.
export function inferVerdictFromUtterance(text: string): Verdict {
  const t = text.toLowerCase();
  if (/\b(love|perfect|yes+|sick|fire|keep (it|that)|that's it|nice|better|good)\b/.test(t)) return "liked";
  if (/\b(no+|nah|hate|worse|undo|go back|kill|remove that|awful|terrible|nope)\b/.test(t)) return "killed";
  return null;
}

export function tasteSummary(title?: string, max = 14): string {
  const all = loadLedger().filter((e) => e.verdict !== null);
  if (all.length === 0) return "no verdicts yet";
  const mine = title ? all.filter((e) => e.title === title) : all;
  const pick = (mine.length ? mine : all).slice(-max);
  return pick.map((e) => `${e.verdict === "liked" ? "LIKED" : "KILLED"}: ${e.move}${e.factsSummary ? ` (${e.factsSummary})` : ""}`).join("\n");
}
