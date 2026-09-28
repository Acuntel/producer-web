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
import { samplingFor } from "@/lib/brain/sampling";
import { brainClient } from "@/lib/brain/client";
import { skillsFor, skillsBlock } from "@/lib/brain/skills";
import { flowNotes } from "@/lib/brain/flow";
import { mockHands, mockRequested, mockJson } from "@/lib/brain/mock";
import { withRetry, transient, pause } from "@/lib/brain/retry";
import { guardSpend, recordUsage } from "@/lib/brain/usage";

export const maxDuration = 60;

const MODEL = process.env.PRODUCER_MODEL || "claude-opus-5";
const FAST = process.env.PRODUCER_FAST_MODEL || "claude-sonnet-5";
const economy = (req: Request) => process.env.PRODUCER_ECONOMY === "1" || new URL(req.url).searchParams.get("economy") === "1";
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
const pack = (reply: BrainReply, usage: unknown, model?: string) => ({ say: reply.say, ops: reply.ops, song: reply.song, action: reply.action, listen: reply.listen, expect: reply.expect, alternative: reply.alternative, usage, model });

export async function POST(req: Request) {
  const input = (await req.json()) as ExchangeInput;
  if (!input || typeof input !== "object" || !input.song || !Array.isArray((input.song as { tracks?: unknown }).tracks)) {
    return Response.json({ say: "I need the current song to work on. Reload the studio and try again.", ops: null, song: null, action: null, detail: "missing song" });
  }
  if (mockRequested(req)) {
    const m = mockHands(input.song);
    return mockJson({ say: m.say, ops: m.ops, song: m.song, action: null, listen: m.listen, expect: null, alternative: null, usage: null, model: "mock", keySource: "mock" });
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
  input.flow = flowNotes(input.song, { family: dnaLaneFor(lane) });
  const finalUser = buildUserBlock(input, last?.content ?? "");

  // Five dollars a record (masterprompt section 7). Measured on 09-17: a move on the flagship costs about fourteen
  // cents, a move on the fast model about three. The flagship is worth it where the whole record is decided (the
  // blueprint on a blank record, a rollout, a full-song pass); every ordinary move goes fast. The governor can still
  // force economy, and PRODUCER_FORCE_FLAGSHIP=1 puts everything back on the flagship.
  const blank = (input.song?.tracks?.length ?? 0) === 0;
  const bigAsk = /\b(blueprint|whole (song|record)|full (song|record|arrangement)|build (me |us )?(a|the) (record|song|track)|start (a|the) (record|song)|first (sixteen|8|16|32) bars|arrange the whole)\b/i.test(last?.content ?? "");
  const flagship = process.env.PRODUCER_FORCE_FLAGSHIP === "1" || ((blank || bigAsk) && !economy(req));
  const params = {
    model: flagship ? MODEL : FAST,
    max_tokens: 16000,
    output_config: { effort: "low" as const },
    tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 3 }],
    system: [
      // One cached prefix: persona, contract, process and the mind together. The cache breakpoint sits on the
      // LAST block so the whole prefix is read at a tenth of the price after the first call.
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
      resp = await client.messages.create({ ...params, ...samplingFor(params.model), messages: msgs } as never) as Anthropic.Message;
    }
    return resp;
  };

  const capped = await guardSpend(req, source);
  if (capped) return Response.json({ ...friendly(new Error("cap")), say: capped, detail: "cap: daily house allowance", down: "cap", keySource: source }, { status: 200 });
  // A transient failure gets one more try; the second try runs on the fast model so an overloaded flagship never stalls the room.
  const modelFor = (attempt: number) => (attempt > 0 ? FAST : params.model);   // a retry always drops to the fast model
  if (!wantsStream) {
    try {
      let used = params.model;
      const resp = await withRetry(async (attempt) => { used = modelFor(attempt); return finish(await client.messages.create({ ...params, ...samplingFor(used), model: used, messages: msgs } as never) as Anthropic.Message); });
      await recordUsage(req, { route: "chat", model: used, usage: resp.usage as never, source });
      return Response.json({ ...pack(parseBrain(textOf(resp)), resp.usage, used), keySource: source });
    } catch (e) { return Response.json(friendly(e), { status: 200 }); }
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      let buf = "", saidEarly = false;
      for (let attempt = 0; ; attempt++) {
        const used = modelFor(attempt);
        try {
          const s = client.messages.stream({ ...params, ...samplingFor(used), model: used, messages: msgs } as never);
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
          await recordUsage(req, { route: "chat", model: used, usage: resp.usage as never, source });
          push({ type: "final", ...pack(parseBrain(textOf(resp)), resp.usage, used), saidEarly, keySource: source, retried: attempt });
          break;
        } catch (e) {
          if (attempt === 0 && !saidEarly && transient(e)) { buf = ""; await pause(700 + Math.random() * 400); continue; }
          push({ type: "final", ...friendly(e) });
          break;
        }
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
