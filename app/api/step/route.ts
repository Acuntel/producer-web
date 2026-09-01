// One rollout step = one inference with only its context. Fast steps route to
// Sonnet, deep steps to Opus. Same persona, same contract, same cached Mind.
import Anthropic from "@anthropic-ai/sdk";
import { MIND } from "@/lib/mind";
import { PERSONA } from "@/lib/brain/persona";
import { CONTRACT } from "@/lib/brain/contract";
import { PROCESS } from "@/lib/brain/process";
import { parseBrain } from "@/lib/brain/parse";
import { compactSong, mixerLine } from "@/lib/brain/context";
import { dnaForBrain } from "@/lib/brain/dna";

export const maxDuration = 90;
const FAST = process.env.PRODUCER_FAST_MODEL || "claude-sonnet-5";
const DEEP = process.env.PRODUCER_MODEL || "claude-opus-5";

type StepInput = {
  step: { id: string; title: string; goal: string; scope: string; tier: "fast" | "deep"; fullSong?: boolean };
  kind: string; song: unknown; facts?: unknown; reference?: { name: string; facts: unknown } | null; deltas?: unknown;
  lane: string; ask: string; prior: { id: string; summary: string }[]; attempt: number; failure?: string | null; section?: string | null; taste?: string;
};

export async function POST(req: Request) {
  const x = (await req.json()) as StepInput;
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ say: "Brain not connected.", ops: null, song: null });
  const client = new Anthropic({ defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } : undefined });
  const dna = dnaForBrain(x.lane);
  const parts = [
    `ROLLOUT "${x.kind}" for the user's request: "${x.ask}"`,
    `STEP ${x.step.id.toUpperCase()} (${x.step.title}), attempt ${x.attempt}${x.failure ? `. PREVIOUS ATTEMPT FAILED THE CHECK: ${x.failure}. Fix exactly that.` : ""}`,
    `GOAL: ${x.step.goal}`,
    `ALLOWED OPS THIS STEP: ${x.step.scope}. ${x.step.fullSong ? 'Return a COMPLETE "song" (tracks may be []).' : 'Return "ops" only, never a full song.'}`,
    x.prior.length ? `DONE SO FAR: ${x.prior.map((p) => `${p.id}: ${p.summary}`).join(" | ")}` : "This is the first step.",
    `CURRENT SONG: ${JSON.stringify(compactSong(x.song as never))}`,
    `MIXER:\n${mixerLine(x.song as never)}`,
    x.facts ? `MEASURED SOUND of the current render: ${JSON.stringify(x.facts)}` : "MEASURED SOUND: nothing rendered yet.",
    x.reference ? `REFERENCE "${x.reference.name}" DNA (emulate, never copy): ${JSON.stringify(x.reference.facts)}` : "",
    x.deltas ? `DELTAS render minus reference: ${JSON.stringify(x.deltas)}` : "",
    dna ? `LANE DNA measured from the user's own record collection: ${dna}` : "",
    x.section ? `TARGET SECTION: ${x.section}` : "",
    x.taste ? `TASTE LEDGER:\n${x.taste}` : "",
    `Respond with the usual JSON. "say" must be ONE short sentence of progress for this step (it may be spoken); keep it natural.`,
  ].filter(Boolean).join("\n\n");
  try {
    const resp = await client.messages.create({
      model: x.step.tier === "deep" ? DEEP : FAST,
      max_tokens: x.step.fullSong ? 12000 : 9000,
      system: [
        { type: "text", text: PERSONA },
        { type: "text", text: CONTRACT },
        { type: "text", text: PROCESS },
        { type: "text", text: `YOUR MIND (compiled producer knowledge):\n\n${MIND}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: parts }],
    } as never);
    const text = (resp as { content: { type: string; text?: string }[] }).content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    const reply = parseBrain(text);
    return Response.json({ say: reply.say, ops: reply.ops, song: reply.song, listen: reply.listen, model: x.step.tier === "deep" ? DEEP : FAST, usage: (resp as { usage?: unknown }).usage });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return Response.json({ say: "That step hiccuped.", ops: null, song: null, detail: msg.slice(0, 200) }, { status: 200 });
  }
}
