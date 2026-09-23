// Taste that follows the account: the local ledger mirrors to the user's Supabase rows (RLS: own rows only) and
// is hydrated from them at sign-in, so a fresh browser remembers what they kept and killed.
import { supabaseBrowser } from "@/lib/account/supabase";
import { loadLedger, mergeLedger, setTasteSink, type LedgerEntry, type Pair } from "./taste";

type Row = { id: string; user_id: string; at: number; title: string | null; said: string | null; move: string | null; listen: string | null; facts_summary: string | null; verdict: string | null };
// A dead idea (three passes, no verdict) rides in the verdict column as "dead"; the thirty second window itself stays in
// this browser's ledger until the table has a column for it.
const toRow = (uid: string, e: LedgerEntry): Row => ({ id: e.id, user_id: uid, at: e.at, title: e.title ?? null, said: e.said ?? null, move: e.move ?? null, listen: e.listen ?? null, facts_summary: e.factsSummary ?? null, verdict: e.verdict ?? (e.dead ? "dead" : null) });
const toEntry = (r: Row): LedgerEntry => ({ id: r.id, at: Number(r.at), title: r.title ?? "", said: r.said ?? "", move: r.move ?? "", listen: r.listen, factsSummary: r.facts_summary ?? undefined, verdict: r.verdict === "liked" || r.verdict === "killed" ? r.verdict : null,
  ...(r.verdict === "dead" ? { dead: { passes: 3, at: Number(r.at) } } : {}) });

let current: string | null = null;

/** Pull the account's ledger into the browser, push what the browser knew that the account did not, arm the sink. */
export async function hydrateTaste(userId: string): Promise<{ pulled: number; pushed: number }> {
  const sb = supabaseBrowser(); if (!sb) return { pulled: 0, pushed: 0 };
  current = userId;
  setTasteSink({
    move: (e) => { void sb.from("taste_moves").upsert(toRow(userId, e)).then(() => undefined, () => undefined); },
    pair: (p: Pair) => { void sb.from("taste_pairs").insert({ user_id: userId, at: p.at, title: p.title, label: p.label, chosen: p.chosen, a_diff: p.aDiff, b_diff: p.bDiff }).then(() => undefined, () => undefined); },
  });
  const { data } = await sb.from("taste_moves").select("*").eq("user_id", userId).order("at", { ascending: false }).limit(300);
  const rows = (data ?? []) as Row[];
  const pulled = mergeLedger(rows.map(toEntry));
  const known = new Set(rows.map((r) => r.id));
  const missing = loadLedger().filter((e) => !known.has(e.id)).slice(-200);
  if (missing.length) await sb.from("taste_moves").upsert(missing.map((e) => toRow(userId, e))).then(() => undefined, () => undefined);
  return { pulled, pushed: missing.length };
}

export function releaseTaste() { current = null; setTasteSink({}); }
export const tasteAccount = () => current;
