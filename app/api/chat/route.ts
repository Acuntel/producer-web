// The producer brain v3: one cached Anthropic call per exchange, STREAMED.
// Reply contract: strict JSON {say, ops|song, action, listen, expect, alternative}.
// The client receives NDJSON: a "say" line the moment the first sentence closes
// (so the producer starts talking in about two seconds), then the "final" reply
// once the ops are complete. Callers without Accept: application/x-ndjson get
// one JSON object, so the harnesses keep working unchanged.
import Anthropic from "@anthropic-ai/sdk";
import { MIND } from "@/lib/mind";
import { PERSONA } from "@/lib/brain/persona";
import { CONTRACT } from "@/lib/brain/contract";
import { parseBrain, type BrainReply } from "@/lib/brain/parse";
import { buildUserBlock, type ExchangeInput } from "@/lib/brain/context";
import { PROCESS } from "@/lib/brain/process";
import { dnaForBrain, findReference, artistDna } from "@/lib/brain/dna";
import { laneRecipe } from "@/lib/brain/lanes";
import { dnaLaneFor, laneNamed } from "@/lib/brain/laneNames";
import { brainClient } from "@/lib/brain/client";
import { skillsFor, skillsBlock } from "@/lib/brain/skills";

export const maxDuration = 60;

const MODEL = process.env.PRODUCER_MODEL || "claude-opus-5";
const SAY_RE = /"say"\s*:\s*"((?:[^"\\]|\\.)*)"/;

type Msg = { role: "user" | "assistant"; content: unknown };

// Errors become one honest spoken line; the raw detail rides along unspoken.
function friendly(e: unknown) {
  const msg = e instanceof Error ? e.message : "unknown error";
  let say = "One second, my brain hiccuped. Say that again?";
  if (/workspace/i.test(msg)) say = "Almost there. My brain needs one last setup step on the account. The music side still works while we wait.";
  else if (/credit|billing/i.test(msg)) say = "My brain's account is out of credits. Top it up and we are back.";
  else if (/invalid.*api.?key|authentication|401/i.test(msg)) say = "That API key is not working. Check it in Settings and we are back.";
  else if (/rate.?limit|429|overloaded|529/i.test(msg)) say = "Give me a few seconds, I am getting too many requests. Try that again.";
  return { say, ops: null, song: null, action: null, detail: msg.slice(0, 200) };
}

const textOf = (resp: Anthropic.Message) => resp.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
const pack = (reply: BrainReply, usage: unknown) => ({ say: reply.say, ops: reply.ops, song: reply.song, action: reply.action, listen: reply.listen, expect: reply.expect, alternative: reply.alternative, usage });

export async function POST(req: Request) {
  const input = (await req.json()) as ExchangeInput;
  if (!input || typeof input !== "object" || !input.song || !Array.isArray((input.song as { tracks?: unknown }).tracks)) {
    return Response.json({ say: "I need the current song to work on. Reload the studio and try again.", ops: null, song: null, action: null, detail: "missing song" });
  }
  const { client, source } = await brainClient(req);
  if (!client) {
    return Response.json({ say: "The studio brain is not connected yet. Add your Anthropic API key in Settings.", ops: null, song: null, action: null, detail: "no key" });
  }
  const wantsStream = (req.headers.get("accept") ?? "").includes("ndjson");
  const convo = (input.messages ?? []).slice(-24);
  const last = convo.pop();
  const lane = input.song?.lane ?? "tech-house";
  const named = laneNamed(last?.content ?? "");
  input.laneRecipe = named && named !== lane ? laneRecipe(named, "the user just named this lane; a switch is a new record via action rollout") : laneRecipe(lane);
  input.dna = dnaForBrain(dnaLaneFor(lane));
  input.namedRefs = findReference(last?.content ?? "");
  input.artist = artistDna(last?.content ?? "");
  input.skills = skillsBlock(skillsFor(last?.content ?? "", input.reference ? ["song-breakdown"] : []));
  const finalUser = buildUserBlock(input, last?.content ?? "");

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
  let msgs: Msg[] = [
    ...convo.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: finalUser },
  ];
  // Server tools (web search) can pause the turn; continue until the model is done.
  const finish = async (first: Anthropic.Message) => {
    let resp = first;
    for (let i = 0; i < 2 && resp.stop_reason === "pause_turn"; i++) {
      msgs = [...msgs, { role: "assistant" as const, content: resp.content }];
      resp = await client.messages.create({ ...params, messages: msgs } as never) as Anthropic.Message;
    }
    return resp;
  };

  if (!wantsStream) {
    try {
      const resp = await finish(await client.messages.create({ ...params, messages: msgs } as never) as Anthropic.Message);
      return Response.json({ ...pack(parseBrain(textOf(resp)), resp.usage), keySource: source });
    } catch (e) { return Response.json(friendly(e), { status: 200 }); }
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        let buf = "", saidEarly = false;
        const s = client.messages.stream({ ...params, messages: msgs } as never);
        s.on("text", (delta: string) => {
          buf += delta;
          if (saidEarly) return;
          const m = SAY_RE.exec(buf);
          if (!m) return;
          saidEarly = true;
          let say = m[1];
          try { say = JSON.parse(`"${m[1]}"`); } catch { /* keep the raw text */ }
          push({ type: "say", say });
        });
        const resp = await finish(await s.finalMessage());
        push({ type: "final", ...pack(parseBrain(textOf(resp)), resp.usage), saidEarly, keySource: source });
      } catch (e) {
        push({ type: "final", ...friendly(e) });
      } finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
