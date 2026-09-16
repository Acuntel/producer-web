// One rollout step = one inference with only its context. Fast steps route to
// Sonnet, deep steps to Opus. Same persona, same contract, same cached Mind.
import { brainClient } from "@/lib/brain/client";
import { withRetry } from "@/lib/brain/retry";
import { guardSpend, recordUsage } from "@/lib/brain/usage";
import { MIND } from "@/lib/mind";
import { PERSONA } from "@/lib/brain/persona";
import { CONTRACT } from "@/lib/brain/contract";
import { PROCESS } from "@/lib/brain/process";
import { parseBrain, looksTruncated } from "@/lib/brain/parse";
import { compactSong, mixerLine } from "@/lib/brain/context";
import { dnaForBrain } from "@/lib/brain/dna";
import { laneRecipe } from "@/lib/brain/lanes";
import { dnaLaneFor, laneHomeBpm } from "@/lib/brain/laneNames";

export const maxDuration = 90;
const FAST = process.env.PRODUCER_FAST_MODEL || "claude-sonnet-5";
const DEEP = process.env.PRODUCER_MODEL || "claude-opus-5";
// Harness and low-cost runs: everything on the fast model. Set PRODUCER_ECONOMY=1 or send ?economy=1.
const economy = (req: Request) => process.env.PRODUCER_ECONOMY === "1" || new URL(req.url).searchParams.get("economy") === "1";

type StepInput = {
  step: { id: string; title: string; goal: string; scope: string; tier: "fast" | "deep"; fullSong?: boolean };
  kind: string; song: unknown; facts?: unknown; reference?: { name: string; facts: unknown } | null; deltas?: unknown;
  lane: string; askedLane?: string | null; ask: string; prior: { id: string; summary: string }[]; attempt: number; failure?: string | null; section?: string | null; taste?: string;
};

export async function POST(req: Request) {
  const x = (await req.json()) as StepInput;
  const { client, source } = await brainClient(req);
  if (!client) return Response.json({ say: "Brain not connected.", ops: null, song: null });
  const capped = await guardSpend(req, source);
  if (capped) return Response.json({ say: capped, detail: "cap: daily house allowance", down: "cap", keySource: source }, { status: 200 });
  const lane = x.askedLane || x.lane;
  const dna = dnaForBrain(dnaLaneFor(lane));
  const recipe = laneRecipe(lane);
  const home = laneHomeBpm(lane);
  const parts = [
    `ROLLOUT "${x.kind}" for the user's request: "${x.ask}"`,
    x.askedLane ? `THE USER ASKED FOR LANE "${x.askedLane}"${home ? ` (home ${home} BPM)` : ""}: set "lane" to exactly "${x.askedLane}", start at its home tempo unless the reference says otherwise, and follow its LANE RECIPE below.` : "",
    `STEP ${x.step.id.toUpperCase()} (${x.step.title}), attempt ${x.attempt}${x.failure ? `. PREVIOUS ATTEMPT FAILED THE CHECK: ${x.failure}. Fix exactly that.` : ""}`,
    `GOAL: ${x.step.goal}`,
    `ALLOWED OPS THIS STEP: ${x.step.scope}. ${x.step.fullSong ? 'Return a COMPLETE "song" (tracks may be []).' : 'Return "ops" only, never a full song.'}`,
    x.prior.length ? `DONE SO FAR: ${x.prior.map((p) => `${p.id}: ${p.summary}`).join(" | ")}` : "This is the first step.",
    `CURRENT SONG: ${JSON.stringify(compactSong(x.song as never))}`,
    `MIXER:\n${mixerLine(x.song as never)}`,
    x.facts ? `MEASURED SOUND of the current render: ${JSON.stringify(x.facts)}` : "MEASURED SOUND: nothing rendered yet.",
    x.reference ? `REFERENCE "${x.reference.name}" DNA (emulate, never copy): ${JSON.stringify(x.reference.facts)}` : "",
    x.deltas ? `DELTAS render minus reference: ${JSON.stringify(x.deltas)}` : "",
    recipe ?? "",
    dna ? `LANE DNA measured from the user's own record collection (closest measured tempo band): ${dna}` : "",
    x.section ? `TARGET SECTION: ${x.section}` : "",
    x.taste ? `TASTE LEDGER:\n${x.taste}` : "",
    `Respond with the usual JSON. "say" must be ONE short sentence of progress for this step (it may be spoken); keep it natural.`,
  ].filter(Boolean).join("\n\n");
  try {
    const ask = (content: string) => withRetry(() => client.messages.create({
      model: x.step.tier === "deep" && !economy(req) ? DEEP : FAST,
      max_tokens: x.step.fullSong ? 12000 : 14000,
      output_config: { effort: "low" },
      system: [
        { type: "text", text: PERSONA },
        { type: "text", text: CONTRACT },
        { type: "text", text: PROCESS },
        { type: "text", text: `YOUR MIND (compiled producer knowledge):\n\n${MIND}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content }],
    } as never));
    const textOf = (resp: unknown) => (resp as { content: { type: string; text?: string }[] }).content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    let resp = await ask(parts);
    let text = textOf(resp);
    let stop = (resp as { stop_reason?: string }).stop_reason;
    // A cut-off reply is worse than a smaller one: ask again, terser, before the client ever sees it.
    if (stop === "max_tokens" || looksTruncated(text)) {
      console.warn("step reply truncated, retrying terse", x.step.id, stop, text.length);
      resp = await ask(`${parts}\n\nYOUR PREVIOUS REPLY WAS CUT OFF (too long). Reply again with AT MOST 8 ops, short note lists (use "grid" for drums), no production notes, valid JSON only.`);
      text = textOf(resp);
      stop = (resp as { stop_reason?: string }).stop_reason;
    }
    const reply = parseBrain(text);
    if (stop === "max_tokens" || (!reply.ops && !reply.song && !reply.say)) console.warn("step reply problem", x.step.id, stop, text.length, text.slice(0, 200));
    const usage = (resp as { usage?: { output_tokens?: number; output_tokens_details?: { thinking_tokens?: number } } }).usage;
    await recordUsage(req, { route: "step", model: x.step.tier === "deep" && !economy(req) ? DEEP : FAST, usage: usage as never, source });
    return Response.json({ say: reply.say, ops: reply.ops, song: reply.song, listen: reply.listen, model: x.step.tier === "deep" && !economy(req) ? DEEP : FAST, usage, thinking: usage?.output_tokens_details?.thinking_tokens, stop, textLength: text.length, head: reply.ops || reply.song ? undefined : text.slice(0, 300) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return Response.json({ say: "That step hiccuped.", ops: null, song: null, detail: msg.slice(0, 200) }, { status: 200 });
  }
}
