// Background critic: fast model, low effort, recommendations only. Never touches the song.
import { brainClient } from "@/lib/brain/client";
import { PROCESS } from "@/lib/brain/process";
import { CONTRACT } from "@/lib/brain/contract";
import { extractJson } from "@/lib/brain/parse";
import { parseCritic } from "@/lib/critic";
import { dnaForBrain } from "@/lib/brain/dna";
import { laneRecipe } from "@/lib/brain/lanes";
import { dnaLaneFor } from "@/lib/brain/laneNames";
import { mixerLine } from "@/lib/brain/context";

export const maxDuration = 60;
const MODEL = process.env.PRODUCER_CRITIC_MODEL || "claude-sonnet-5";   // the critic writes notes; the fast tier is plenty

const ROLE = `You are the studio's CRITIC: a second producer listening in the back of the room. You NEVER change the song. You write short, specific recommendations from the measurements, the lane DNA and the reference deltas; the user decides what to do with them. Rules: numbers over adjectives; each note names ONE thing, WHY (the measurement), and ONE concrete move in the studio's own terms (ops in the SongDoc contract when you can write them exactly); severity 3 = it does not sound like a record yet, 2 = clearly better with this, 1 = taste. At most 5 notes, best first. Reading the pump number: "pump" is beat-rate loudness modulation of the WHOLE mix; a sparse synth mix with nothing sustained between kicks reads 0.8+ no matter the sidechain setting, so when pump is high AND sub+low is above 0.8 the move is to add sustained energy (pads, stabs, hats, chords), never to ease the sidechain below 5 dB. Never repeat something the user already dismissed. No em dashes. Output ONLY JSON: {"headline": "<one sentence overall read>", "notes": [{"area": "mix"|"arrangement"|"groove"|"harmony"|"sound"|"reference", "severity": 1|2|3, "what": "...", "why": "...", "fix": "...", "section"?: id, "ops"?: [..]}]}`;

export async function POST(req: Request) {
  const x = (await req.json()) as { song: { lane?: string; title?: string; sections?: unknown[]; tracks?: unknown[] }; facts?: unknown; reference?: { name: string; facts: unknown } | null; deltas?: unknown; recent?: string[]; dismissed?: string[]; taste?: string };
  const { client } = await brainClient(req);
  if (!client) return Response.json({ headline: "", notes: [] });
  const song = x.song as never;
  const parts = [
    `SONG "${x.song.title}" lane ${x.song.lane}: sections ${JSON.stringify((x.song.sections as { id: string; name: string; bars: number; active: string[]; fill?: string; automation?: unknown[] }[] | undefined)?.map((s) => [s.id, s.bars, s.active.length, s.fill, (s.automation ?? []).length]))}`,
    `MIXER:\n${mixerLine(song)}`,
    x.facts ? `MEASURED SOUND (full render): ${JSON.stringify(x.facts)}` : "MEASURED SOUND: none yet",
    x.reference ? `REFERENCE "${x.reference.name}": ${JSON.stringify(x.reference.facts)}` : "",
    x.deltas ? `DELTAS render minus reference: ${JSON.stringify(x.deltas)}` : "",
    laneRecipe(x.song.lane ?? "tech-house") ?? "",
    `LANE DNA (user's collection, closest measured tempo band): ${dnaForBrain(dnaLaneFor(x.song.lane ?? "tech-house")) ?? "none"}`,
    x.recent?.length ? `RECENT MOVES: ${x.recent.join(" | ")}` : "",
    x.dismissed?.length ? `ALREADY DISMISSED BY THE USER (never suggest again): ${x.dismissed.join(" | ")}` : "",
    x.taste ? `TASTE LEDGER:\n${x.taste}` : "",
  ].filter(Boolean).join("\n\n");
  try {
    const resp = await client.messages.create({
      model: MODEL, max_tokens: 2500, output_config: { effort: "low" },
      system: [{ type: "text", text: ROLE }, { type: "text", text: CONTRACT }, { type: "text", text: PROCESS, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: parts }],
    } as never);
    const text = (resp as { content: { type: string; text?: string }[] }).content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    return Response.json(parseCritic(extractJson(text)));
  } catch (e: unknown) {
    return Response.json({ headline: "", notes: [], detail: e instanceof Error ? e.message.slice(0, 200) : "error" });
  }
}
