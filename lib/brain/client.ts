// Which Anthropic key answers this request: the signed-in user's own key when
// they saved one in Settings, otherwise the studio's house key. Never logged.
import Anthropic from "@anthropic-ai/sdk";
import { userAnthropicKey } from "@/lib/account/keys";

export type KeySource = "user" | "house" | "none";

export async function brainClient(req: Request): Promise<{ client: Anthropic | null; source: KeySource }> {
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
