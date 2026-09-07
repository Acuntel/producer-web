// The client side of a streamed exchange. /api/chat answers in NDJSON: a "say"
// line the moment the producer's first sentence closes, then the "final" reply
// with the ops. Harness callers that receive plain JSON still work.
export type StreamReply = { say: string; ops?: unknown[] | null; song?: unknown; action?: unknown; listen?: string | null; expect?: unknown[] | null; alternative?: unknown[] | null; detail?: string; usage?: unknown; saidEarly?: boolean };

export const economyQuery = () => (typeof window !== "undefined" && /[?&]economy=1/.test(window.location.search) ? "?economy=1" : "");

export async function exchange(body: unknown, onSay: (say: string) => void, url = "/api/chat"): Promise<StreamReply> {
  const r = await fetch(url + economyQuery(), { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify(body) });
  const ct = r.headers.get("content-type") ?? "";
  if (!ct.includes("ndjson") || !r.body) return (await r.json()) as StreamReply;
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", final: StreamReply | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let o: { type?: string; say?: string } & StreamReply;
      try { o = JSON.parse(line); } catch { continue; }
      if (o.type === "say" && typeof o.say === "string" && o.say.trim()) onSay(o.say.trim());
      else if (o.type === "final") final = o;
    }
  }
  if (!final) throw new Error("the brain stream ended without a reply");
  return final;
}
