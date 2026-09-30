// The meter. Anthropic list prices per million tokens on 2026-09-13, OpenAI list prices on 2026-09-29 (a cache
// read is a tenth of the input price, a cache write is 1.25 times it), and a running total per record kept in
// the browser. A target without a meter is a wish.
export type Usage = { model?: string; input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; server_tool_use?: { web_search_requests?: number } };

const PRICES: Record<string, { in: number; out: number; read: number; write: number }> = {
  "claude-opus-5": { in: 5, out: 25, read: 0.5, write: 6.25 },
  "claude-sonnet-5": { in: 2, out: 10, read: 0.2, write: 2.5 },
  "claude-haiku-4-5": { in: 1, out: 5, read: 0.1, write: 1.25 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5, read: 0.1, write: 1.25 },
  "gpt-6-astra": { in: 10, out: 50, read: 1, write: 12.5 },
  "gpt-6-sol": { in: 2, out: 10, read: 0.2, write: 2.5 },
  "gpt-6-luna": { in: 0.1, out: 0.5, read: 0.01, write: 0.125 },
};
const SEARCH = 0.01;

// A pinned or renamed id (gpt-6-astra-2026-09-01) is priced as its family. A GPT id the table has never seen is
// priced as the dearest GPT row, so an unknown model can only over-count against the allowance, never under.
function priceFor(model: string) {
  if (PRICES[model]) return PRICES[model];
  const family = Object.keys(PRICES).filter((k) => model.startsWith(`${k}-`)).sort((a, b) => b.length - a.length)[0];
  if (family) return PRICES[family];
  return /^(gpt-|chatgpt-|o\d)/.test(model) ? PRICES["gpt-6-astra"] : PRICES["claude-sonnet-5"];
}

export function costOf(model: string | undefined, u: Usage | undefined | null): number {
  if (!u) return 0;
  // The GPT adapter stamps the model that really ran on the usage; that one sets the price.
  const p = priceFor(u.model ?? model ?? "");
  const usd = ((u.input_tokens ?? 0) * p.in + (u.output_tokens ?? 0) * p.out + (u.cache_read_input_tokens ?? 0) * p.read + (u.cache_creation_input_tokens ?? 0) * p.write) / 1e6
    + (u.server_tool_use?.web_search_requests ?? 0) * SEARCH;
  return Math.round(usd * 1e6) / 1e6;   // the ledger's column holds six places; four priced the smallest calls at zero
}

const KEY = "producer.cost.v1";
type Ledger = Record<string, { usd: number; calls: number }>;
function load(): Ledger { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } }
export function addCost(record: string, usd: number, calls = 1): number {
  if (typeof window === "undefined") return usd;
  const l = load(); const k = record || "untitled";
  l[k] = { usd: (l[k]?.usd ?? 0) + usd, calls: (l[k]?.calls ?? 0) + calls };
  try { localStorage.setItem(KEY, JSON.stringify(l)); } catch {}
  return l[k].usd;
}
export function costFor(record: string): number { if (typeof window === "undefined") return 0; return load()[record || "untitled"]?.usd ?? 0; }
export function costTotal(): number { if (typeof window === "undefined") return 0; return Object.values(load()).reduce((a, x) => a + x.usd, 0); }
