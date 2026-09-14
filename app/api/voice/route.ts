// The Voice lane: Haiku 4.5, streamed. NDJSON out: a "say" line per finished sentence
// (the client speaks each one the moment it closes), then a "final" line with the
// control object and the usage. Target: first sentence inside a second.
import { brainClient } from "@/lib/brain/client";
import { VOICE_SYSTEM, parseVoice, voiceUser, type VoiceState } from "@/lib/brain/voice";
import { mockVoice, mockRequested } from "@/lib/brain/mock";

export const maxDuration = 30;
const MODEL = process.env.PRODUCER_VOICE_MODEL || "claude-haiku-4-5";

type Body = { state: VoiceState; utterance: string };

// Errors become one honest spoken line; the raw detail rides along unspoken.
function friendly(e: unknown): { say: string; control: Record<string, never>; detail: string; down: "credits" | "key" | null } {
  const msg = e instanceof Error ? e.message : "unknown error";
  if (/credit|billing/i.test(msg)) return { say: "My brain's account is out of credits. Top it up, or add your own key, and we are back.", control: {}, detail: msg.slice(0, 200), down: "credits" };
  if (/invalid.*api.?key|authentication|401/i.test(msg)) return { say: "That API key is not working. Check it in Settings and we are back.", control: {}, detail: msg.slice(0, 200), down: "key" };
  if (/rate.?limit|429|overloaded|529/i.test(msg)) return { say: "Give me a few seconds, too many requests at once. Say that again.", control: {}, detail: msg.slice(0, 200), down: null };
  return { say: "One second, my brain hiccuped. Say that again?", control: {}, detail: msg.slice(0, 200), down: null };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.state || !body.utterance) return Response.json({ say: "Say that again?", control: {}, detail: "bad request" }, { status: 200 });
  const wantsStream = (req.headers.get("accept") ?? "").includes("ndjson");
  if (mockRequested(req)) {
    // Harness only (PRODUCER_MOCK=1 on the server AND ?mock=1): deterministic answers, same wire shape, no key needed.
    const m = mockVoice(body.state, body.utterance);
    if (!wantsStream) return Response.json({ ...m, model: "mock", ms: 1, keySource: "mock" });
    const lines = [JSON.stringify({ type: "say", text: m.say }), JSON.stringify({ type: "final", ...m, model: "mock", ms: 1, firstSentenceMs: 1, keySource: "mock" })];
    return new Response(lines.join("\n") + "\n", { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const { client, source } = await brainClient(req);
  if (!client) return Response.json({ say: "The studio brain is not connected yet. Add your Anthropic API key in Settings.", control: {}, detail: "no key" });
  const params = {
    model: MODEL,
    max_tokens: 400,
    system: [{ type: "text" as const, text: VOICE_SYSTEM, cache_control: { type: "ephemeral" as const, ttl: "1h" as const } }],
    messages: [{ role: "user" as const, content: voiceUser(body.state, body.utterance) }],
  };
  const t0 = Date.now();
  if (!wantsStream) {
    try {
      const resp = await client.messages.create(params as never);
      const text = (resp as { content: { type: string; text?: string }[] }).content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      const { say, control } = parseVoice(text);
      return Response.json({ say, control, usage: (resp as { usage: unknown }).usage, model: MODEL, ms: Date.now() - t0, keySource: source });
    } catch (e) { return Response.json(friendly(e)); }
  }
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      let buf = "", spoken = 0, firstAt = 0, stopped = false;
      const flushSentences = (final: boolean) => {
        if (stopped) return;
        const cut = buf.indexOf("@@");
        const region = cut >= 0 ? buf.slice(0, cut) : buf;
        // The first words go out at the first clause (a comma after four or more words) so the voice
        // starts before the sentence closes; everything after is spoken sentence by sentence.
        if (!firstAt && spoken === 0) {
          const clause = /^([^.!?,]{12,}?,)\s/.exec(region);
          if (clause && clause[1].split(/\s+/).length >= 4) { firstAt = Date.now() - t0; push({ type: "say", text: clause[1] }); spoken = clause[0].length; }
        }
        const re = /[^.!?]+[.!?]+["')\]]*(\s+|$)/g;
        let m: RegExpExecArray | null; let end = 0;
        while ((m = re.exec(region)) !== null) {
          if (m.index < spoken) continue;
          if (!final && m.index + m[0].length >= region.length && cut < 0) break;   // the last sentence may still be growing
          const s = m[0].trim(); end = m.index + m[0].length;
          if (s) { if (!firstAt) firstAt = Date.now() - t0; push({ type: "say", text: s }); }
          spoken = end;
        }
        if (final) { const rest = region.slice(spoken).trim(); if (rest) { push({ type: "say", text: rest }); spoken = region.length; } }
        if (cut >= 0) stopped = true;
      };
      try {
        const s = client.messages.stream(params as never);
        s.on("text", (delta: string) => { buf += delta; flushSentences(false); });
        const resp = await s.finalMessage();
        flushSentences(true);
        const { say, control } = parseVoice(buf);
        push({ type: "final", say, control, usage: resp.usage, model: MODEL, ms: Date.now() - t0, firstSentenceMs: firstAt, keySource: source });
      } catch (e) {
        const f = friendly(e);
        push({ type: "say", text: f.say });
        push({ type: "final", ...f });
      } finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
