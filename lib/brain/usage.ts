// The server-side ledger: one row per model exchange, and the house key's daily allowance. The browser meter
// stays for the feel of the number; this is what the cap is enforced on, so a reload cannot reset it.
import { supabaseAdmin, userFromRequest } from "@/lib/account/supabase";
import { costOf, type Usage } from "@/lib/cost";

export type KeySource = "user" | "house" | "none" | "mock";
export const HOUSE_USER_DAILY_USD = Number(process.env.HOUSE_USER_DAILY_USD ?? 5);
export const HOUSE_GLOBAL_DAILY_USD = Number(process.env.HOUSE_GLOBAL_DAILY_USD ?? 40);
export const CAP_LINE = "Today's house allowance is used up. Add your own key in Settings, or come back tomorrow.";

/** Today's house-key spend for this user and for everyone, in dollars. */
export async function spendToday(req: Request): Promise<{ mine: number; all: number; userId: string | null }> {
  const sb = supabaseAdmin(); if (!sb) return { mine: 0, all: 0, userId: null };
  const user = await userFromRequest(req).catch(() => null);
  const { data } = await sb.rpc("usage_today", { uid: user?.id ?? null });
  const row = (Array.isArray(data) ? data[0] : data) as { mine?: number; all?: number } | null;
  return { mine: Number(row?.mine ?? 0), all: Number(row?.all ?? 0), userId: user?.id ?? null };
}

/** null when the exchange may proceed; otherwise the line the producer says instead. */
export async function guardSpend(req: Request, source: KeySource): Promise<string | null> {
  if (source !== "house") return null;
  try {
    const s = await spendToday(req);
    if (s.all >= HOUSE_GLOBAL_DAILY_USD) return CAP_LINE;
    if (s.userId && s.mine >= HOUSE_USER_DAILY_USD) return CAP_LINE;
    return null;
  } catch { return null; }
}

/** Write the row. Awaited by the routes so the function does not end before the insert lands. */
export async function recordUsage(req: Request, x: { route: string; model?: string; usage?: Usage | null; source: KeySource }): Promise<void> {
  const sb = supabaseAdmin(); if (!sb || !x.usage) return;
  try {
    const user = await userFromRequest(req).catch(() => null);
    const u = x.usage;
    await sb.from("usage_events").insert({
      user_id: user?.id ?? null, key_source: x.source, route: x.route, model: x.model ?? null,
      input_tokens: u.input_tokens ?? 0, output_tokens: u.output_tokens ?? 0, cache_read: u.cache_read_input_tokens ?? 0, cache_write: u.cache_creation_input_tokens ?? 0,
      searches: u.server_tool_use?.web_search_requests ?? 0, usd: costOf(x.model, u),
    });
  } catch { /* the ledger never breaks an exchange */ }
}
