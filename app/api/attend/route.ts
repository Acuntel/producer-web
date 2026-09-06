// Attention classifier: was this sentence meant for the producer? One tiny, fast
// inference. Fails open (command) so a hiccup never eats a real request.
import { brainClient } from "@/lib/brain/client";

export const maxDuration = 15;
const MODEL = process.env.PRODUCER_ATTEND_MODEL || "claude-haiku-4-5-20251001";

const SYSTEM = `You judge one sentence a music studio's microphone picked up while an AI producer was in the room. Decide who it was for.
Reply with exactly one word:
COMMAND = the user asks the producer to do or change something musical or in the studio (any request, instruction, verdict that implies a change, or a direct question about the music).
TALK = the user speaks to the producer but asks for no change: a reaction to the music, a question about what it did, thinking aloud about the track, a greeting to the producer.
IGNORE = not for the producer: talking to another person, a phone call, reading something, TV, unrelated chatter, self-talk about other things.
Rules: when the music is PAUSED the room is usually talking among itself; only clearly studio-directed sentences are COMMAND or TALK. A sentence that starts with the producer's name is always for it. When unsure between TALK and IGNORE while playing, prefer TALK; while paused, prefer IGNORE. Output the one word only.`;

export async function POST(req: Request) {
  const x = (await req.json().catch(() => ({}))) as { text?: string; paused?: boolean; lastProducer?: string; lastAsk?: string; section?: string };
  const text = (x.text ?? "").toString().slice(0, 400).trim();
  if (!text) return Response.json({ intent: "ignore" });
  const { client } = await brainClient(req);
  if (!client) return Response.json({ intent: "command" });
  try {
    const resp = await client.messages.create({
      model: MODEL, max_tokens: 5,
      system: SYSTEM,
      messages: [{ role: "user", content: `Music is ${x.paused ? "PAUSED" : "PLAYING"}${x.section ? ` in the ${x.section}` : ""}.\nProducer's last line: ${(x.lastProducer ?? "").slice(0, 200) || "(none)"}\nUser's last accepted request: ${(x.lastAsk ?? "").slice(0, 160) || "(none)"}\nSentence: "${text}"` }],
    } as never);
    const out = (resp as { content: { type: string; text?: string }[] }).content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim().toUpperCase();
    const intent = out.startsWith("IGNORE") ? "ignore" : out.startsWith("TALK") ? "talk" : "command";
    return Response.json({ intent, model: MODEL });
  } catch (e) {
    return Response.json({ intent: "command", detail: e instanceof Error ? e.message.slice(0, 120) : "error" });
  }
}
