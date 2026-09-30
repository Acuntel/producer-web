// Which key answers this request. On Claude: the signed-in user's own key when they saved one in Settings,
// otherwise the studio's house key. On GPT (PRODUCER_PROVIDER=openai): the house OpenAI key for everyone, counted
// against the same daily allowance, because a saved Anthropic key cannot drive a GPT model. Never logged.
import Anthropic from "@anthropic-ai/sdk";
import { userAnthropicKey } from "@/lib/account/keys";
import { openaiBrain } from "@/lib/brain/openai";
import { guardSpend, recordUsage } from "@/lib/brain/usage";

export type KeySource = "user" | "house" | "none";
export const brainProvider = (): "openai" | "anthropic" => (process.env.PRODUCER_PROVIDER === "openai" ? "openai" : "anthropic");

export async function brainClient(req: Request): Promise<{ client: Anthropic | null; source: KeySource }> {
  if (brainProvider() === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return { client: null, source: "none" };
    // The research lane keeps no ledger and no allowance of its own, and on GPT it is always house money (a web
    // search each time). So it is capped and counted here; with the allowance used up it gets no brain, which the
    // lane already answers as "nothing found". The four big lanes guard and record themselves.
    if (!/\/api\/research$/.test(new URL(req.url).pathname)) return { client: openaiBrain(key), source: "house" };
    if (await guardSpend(req, "house")) return { client: null, source: "house" };
    return { client: openaiBrain(key, (usage) => recordUsage(req, { route: "research", model: usage.model, usage, source: "house" })), source: "house" };
  }
  const own = await userAnthropicKey(req).catch(() => null);
  if (own) return { client: new Anthropic({ apiKey: own }), source: "user" };
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      client: new Anthropic({ defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } : undefined }),
      source: "house",
    };
  }
  return { client: null, source: "none" };
}
