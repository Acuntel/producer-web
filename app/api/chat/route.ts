// The producer brain v3: one cached Anthropic call per exchange.
// Reply contract: strict JSON {say, ops|song, action, listen}.
import Anthropic from "@anthropic-ai/sdk";
import { MIND } from "@/lib/mind";
import { PERSONA } from "@/lib/brain/persona";
import { CONTRACT } from "@/lib/brain/contract";
import { parseBrain } from "@/lib/brain/parse";
import { buildUserBlock, type ExchangeInput } from "@/lib/brain/context";
import { PROCESS } from "@/lib/brain/process";
import { dnaForBrain, findReference } from "@/lib/brain/dna";

export const maxDuration = 60;

const MODEL = process.env.PRODUCER_MODEL || "claude-opus-5";

export async function POST(req: Request) {
  const input = (await req.json()) as ExchangeInput;
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ say: "The studio brain is not connected yet. Add the ANTHROPIC_API_KEY in Vercel and redeploy.", ops: null, song: null, action: null });
  }
  const client = new Anthropic({
    defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } : undefined,
  });
  const convo = (input.messages ?? []).slice(-24);
  const last = convo.pop();
  input.dna = dnaForBrain(input.song?.lane ?? "tech-house");
  input.namedRefs = findReference(last?.content ?? "");
  const finalUser = buildUserBlock(input, last?.content ?? "");

  try {
    const params = {
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "low" as const },
      tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 3 }],
      system: [
        { type: "text" as const, text: PERSONA },
        { type: "text" as const, text: CONTRACT },
        { type: "text" as const, text: PROCESS },
        { type: "text" as const, text: `YOUR MIND (compiled producer knowledge: laws, numbers, grammars, song DNA, taste):\n\n${MIND}`, cache_control: { type: "ephemeral" as const } },
      ],
    };
    let msgs = [
      ...convo.map((m) => ({ role: m.role, content: m.content as unknown as never })),
      { role: "user" as const, content: finalUser as unknown as never },
    ];
    let resp = await client.messages.create({ ...params, messages: msgs } as never);
    for (let i = 0; i < 2 && resp.stop_reason === "pause_turn"; i++) {
      msgs = [...msgs, { role: "assistant" as const, content: resp.content as unknown as never }];
      resp = await client.messages.create({ ...params, messages: msgs } as never);
    }
    const text = resp.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    const reply = parseBrain(text);
    return Response.json({ say: reply.say, ops: reply.ops, song: reply.song, action: reply.action, listen: reply.listen, expect: reply.expect, alternative: reply.alternative, usage: resp.usage });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown error";
    let say = "One second, my brain hiccuped. Say that again?";
    if (/workspace/i.test(msg)) say = "Almost there. My brain needs one last setup step on the account. The music side still works while we wait.";
    else if (/credit|billing/i.test(msg)) say = "My brain's account is out of credits. Top it up and we are back.";
    else if (/rate.?limit|429|overloaded|529/i.test(msg)) say = "Give me a few seconds, I am getting too many requests. Try that again.";
    return Response.json({ say, ops: null, song: null, action: null, detail: msg.slice(0, 200) }, { status: 200 });
  }
}
