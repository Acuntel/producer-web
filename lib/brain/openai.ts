// The GPT side of the brain. Every route speaks Anthropic's Messages shape (system blocks, messages, max_tokens,
// output_config, the web search tool) and reads Anthropic's reply shape (content, stop_reason, usage). This adapter
// takes the same call, sends it to OpenAI's Responses API and hands back the same shape, so the routes, the ledger
// and the daily allowance work unchanged. One fetch and no SDK, so the lockfile stays as it is. The key is never logged.
import type Anthropic from "@anthropic-ai/sdk";
import { pause } from "./retry";

const ENDPOINT = "https://api.openai.com/v1/responses";

type Block = { type: string; text?: string };
export type BrainParams = {
  model: string; max_tokens?: number; temperature?: number;
  system?: string | Block[];
  messages: { role: "user" | "assistant"; content: string | Block[] }[];
  output_config?: { effort?: string };
  tools?: { type: string; max_uses?: number }[];
};
type GptUsage = { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number }; output_tokens_details?: { reasoning_tokens?: number } };
type GptError = { message?: string; param?: string | null; code?: string | null };
type GptItem = { type: string; phase?: string | null; content?: { type: string; text?: string; refusal?: string }[] };
type GptResponse = { id?: string; status?: string; incomplete_details?: { reason?: string } | null; error?: GptError | null; output?: GptItem[]; usage?: GptUsage };
export type BrainUsage = ReturnType<typeof toMessage>["usage"];

export class BrainError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; this.name = "BrainError"; }
}

// Anthropic's client tried a busy or dropped call twice more on its own before a route ever saw it fail. Same here.
export const tuning = { retries: 2, baseMs: 500 };

export const isOpenAIModel = (model: string) => /^(gpt-|chatgpt-|o\d)/.test(model);
// A lane whose model env was never set still names a Claude model. It runs on the GPT tier that plays the same part.
export const openaiModelFor = (model: string): string => {
  if (isOpenAIModel(model)) return model;
  if (/haiku/.test(model)) return "gpt-6-luna";
  if (/opus|fable|mythos/.test(model)) return "gpt-6-astra";
  return "gpt-6-sol";
};

// What a model refused once is remembered for the life of the server. The flagship is known to refuse "none".
const NO_TEMPERATURE = new Set<string>();
const NO_EFFORT_NONE = new Set<string>(["gpt-6-astra"]);

// GPT-6 can send a "commentary" message ahead of its answer (a draft, a note to self, sometimes a broken copy of
// the reply), and now and then it sends the final answer twice. Every lane here wants one reply in one format, so
// the adapter asks for exactly that and reads one message: the first final answer. Commentary is used only when a
// reply was cut off before any final answer arrived.
const ONE_MESSAGE = "DELIVERY: answer in one single message, the final answer, in exactly the format asked for above. Do not send a commentary, preamble or progress message before it.";

// With web search on, GPT writes its sources into the text as "([site](url))". Claude kept them apart from the
// words. Nothing here reads a link and the producer would say it out loud, so GPT is asked for none and any that
// come anyway are taken out, in the reply and in the stream.
const NO_LINKS = "Write no links, URLs or source citations anywhere in the answer.";
const CITED = /^(?:\(\[[^\]]*\]\([^)\s]*\)\)|\[[^\]]*\]\([^)\s]*utm_source=openai[^)\s]*\))/;
const CITING = /^\(?(?:\[[^\]]*(?:\](?:\([^)\s]*\)?)?)?)?$/;   // the start of one, as far as it has come
/** Text with the citations out. Unless this is the last of it, a bracket that may still turn into a citation is
 *  held back, along with the space before it, until the next piece settles it. */
export function settle(text: string, last: boolean): { out: string; held: string } {
  let out = "", i = 0;
  while (i < text.length) {
    const at = text.slice(i).search(/[([]/);
    if (at < 0) { out += text.slice(i); i = text.length; break; }
    out += text.slice(i, i + at); i += at;
    const rest = text.slice(i), cited = CITED.exec(rest);
    if (cited) { out = out.replace(/\s+$/, ""); i += cited[0].length; continue; }
    if (!last && rest.length < 600 && CITING.test(rest)) break;
    out += rest[0]; i += 1;
  }
  if (last) return { out, held: "" };
  const space = /\s+$/.exec(out)?.[0] ?? "";
  return { out: out.slice(0, out.length - space.length), held: space + text.slice(i) };
}
export function citeFilter(emit: (delta: string) => void) {
  let held = "";
  const pass = (last: boolean) => { const s = settle(held, last); held = s.held; if (s.out) emit(s.out); };
  return { push(delta: string) { held += delta; pass(false); }, end() { pass(true); } };
}

const textOf = (c: string | Block[] | undefined): string => (typeof c === "string" ? c : (c ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n\n"));
// Nothing that leaves this file may carry the key: not OpenAI's words, not fetch's own complaint about a header.
const scrub = (s: string, key = "") => (key ? s.split(key).join("sk-***") : s).replace(/Bearer\s+\S+/g, "Bearer sk-***").replace(/sk-[A-Za-z0-9_*.-]{6,}/g, "sk-***");

export function requestBody(p: BrainParams, stream: boolean) {
  const model = openaiModelFor(p.model);
  // A route that sets no effort was written for a model that does not think first (the Voice lane, the attention
  // check), so it asks for none here. OpenAI counts thinking inside the output ceiling and refuses one under 16.
  const effort = p.output_config?.effort ?? (NO_EFFORT_NONE.has(model) ? "low" : "none");
  const search = (p.tools ?? []).find((t) => t.type.startsWith("web_search"));
  const system = textOf(p.system);
  // GPT-6 takes a temperature only when it is not thinking (measured on luna, sol and astra).
  const steady = typeof p.temperature === "number" && effort === "none" && !NO_TEMPERATURE.has(model);
  return {
    model, stream, store: false,
    instructions: [system, ONE_MESSAGE, search ? NO_LINKS : ""].filter(Boolean).join("\n\n"),
    // What the producer said before was an answer, not a note to self; OpenAI asks for that to be said on each turn.
    input: p.messages.map((m) => ({ role: m.role, content: textOf(m.content), ...(m.role === "assistant" ? { phase: "final_answer" } : {}) })).filter((m) => m.content),
    max_output_tokens: Math.max(16, p.max_tokens ?? 4096),
    reasoning: { effort },
    ...(steady ? { temperature: p.temperature } : {}),
    ...(search ? { tools: [{ type: "web_search" }], max_tool_calls: search.max_uses ?? 1 } : {}),
  };
}

const wordsOf = (o: GptItem) => (o.content ?? []).map((c) => (c.type === "output_text" ? settle(c.text ?? "", true).out : c.type === "refusal" ? c.refusal ?? "" : "")).join("");
const isFinal = (o: GptItem) => o.type === "message" && o.phase !== "commentary";
export function replyText(output: GptItem[]): string {
  const final = output.filter(isFinal).map(wordsOf).find((t) => t.trim());
  return final ?? output.filter((o) => o.type === "message").map(wordsOf).join("\n");
}

/** OpenAI's reply in Anthropic's shape. OpenAI counts cached and cache-written tokens inside input_tokens; the
 *  ledger prices them apart, so they are taken back out here. The model that really ran rides on the usage. */
export function toMessage(d: GptResponse, model: string) {
  const text = replyText(d.output ?? []);
  const u = d.usage ?? {};
  const read = u.input_tokens_details?.cached_tokens ?? 0;
  const write = u.input_tokens_details?.cache_write_tokens ?? 0;
  const searches = (d.output ?? []).filter((o) => o.type === "web_search_call").length;
  const cut = d.status === "incomplete";
  return {
    id: d.id ?? "", type: "message" as const, role: "assistant" as const, model,
    content: [{ type: "text" as const, text }],
    stop_reason: cut ? (d.incomplete_details?.reason === "max_output_tokens" ? "max_tokens" : "refusal") : "end_turn",
    stop_sequence: null,
    usage: {
      model,
      input_tokens: Math.max(0, (u.input_tokens ?? 0) - read - write),
      output_tokens: u.output_tokens ?? 0,
      cache_read_input_tokens: read,
      cache_creation_input_tokens: write,
      output_tokens_details: { thinking_tokens: u.output_tokens_details?.reasoning_tokens ?? 0 },
      ...(searches ? { server_tool_use: { web_search_requests: searches } } : {}),
    },
  };
}

// The message opens with the status code and keeps OpenAI's own words, so the routes' spoken lines and the one
// retry read it the way they read an Anthropic failure. OpenAI's words carry live counters and ids ("Used 26401"),
// and a number in them must never read as a status code, so long numbers are masked. An empty account is a 402.
function failure(status: number, err: GptError, key: string, raw = ""): BrainError {
  const code = err.code === "insufficient_quota" ? 402 : status;
  const words = scrub(err.message ?? raw.slice(0, 300), key).replace(/\d{3,}/g, "N");
  return new BrainError(code, `${code} ${words}${err.code ? ` (${err.code})` : ""}`);
}
// A failure that arrives inside a 200 (a failed stream, an error event) has no status of its own. Only the kinds
// that can pass on a second try are given one the retry acts on.
const inBand = (err: GptError, key: string) => failure(err.code === "rate_limit_exceeded" ? 429 : !err.code || err.code === "server_error" ? 502 : 400, err, key);

const worthAnother = (status: number, code?: string | null) => code !== "insufficient_quota" && (status === 408 || status === 409 || status === 429 || status >= 500);
const waitFor = (res: Response | null, attempt: number) => {
  const ms = Number(res?.headers.get("retry-after-ms")), s = Number(res?.headers.get("retry-after"));
  const asked = ms > 0 ? ms : s > 0 ? s * 1000 : 0;
  return Math.min(8000, asked || tuning.baseMs * 2 ** attempt) + Math.random() * (tuning.baseMs / 2);
};

async function post(p: BrainParams, stream: boolean, key: string): Promise<{ res: Response; model: string }> {
  // fetch quotes the whole header in its own error when the value has a break in it, so a bad key never gets that far.
  if (!/^[\x21-\x7E]+$/.test(key)) throw new BrainError(401, "401 invalid api key: the OpenAI key in the server env is empty or has a space or a line break inside it");
  for (let attempt = 0, repairs = 0; ;) {
    const body = requestBody(p, stream);
    let res: Response;
    try { res = await fetch(ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
    catch (e) {
      if (attempt < tuning.retries) { await pause(waitFor(null, attempt++)); continue; }
      throw new BrainError(503, `fetch failed: ${scrub(e instanceof Error ? e.message : String(e), key)}`);
    }
    if (res.ok) return { res, model: body.model };
    const raw = await res.text();
    let err: GptError = {};
    try { err = (JSON.parse(raw) as { error?: GptError }).error ?? {}; } catch { /* not JSON; the raw text is the detail */ }
    if (res.status === 400 && repairs < 2) {
      if (err.param === "temperature" && "temperature" in body) { NO_TEMPERATURE.add(body.model); repairs++; continue; }
      if (err.param === "reasoning.effort" && body.reasoning.effort === "none") { NO_EFFORT_NONE.add(body.model); repairs++; continue; }
    }
    if (worthAnother(res.status, err.code) && attempt < tuning.retries) { await pause(waitFor(res, attempt++)); continue; }
    throw failure(res.status, err, key, raw);
  }
}

type Meter = (usage: BrainUsage) => Promise<void> | void;

async function create(p: BrainParams, key: string, meter?: Meter) {
  const { res, model } = await post(p, false, key);
  const d = (await res.json()) as GptResponse;
  if (d.error) throw inBand(d.error, key);
  const message = toMessage(d, model);
  await meter?.(message.usage);
  return message;
}

// The same two handles the routes use on Anthropic's stream: on("text") for each delta, finalMessage() for the reply.
function stream(p: BrainParams, key: string, meter?: Meter) {
  const listeners: ((delta: string) => void)[] = [];
  const done = (async () => {
    const { res, model } = await post(p, true, key);
    if (!res.body) throw new BrainError(502, "fetch failed: the brain stream had no body");
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", final: GptResponse | null = null;
    const say = (delta: string) => listeners.forEach((cb) => cb(delta));
    const cites = p.tools?.length ? citeFilter(say) : null;
    const emit = (delta: string) => (cites ? cites.push(delta) : say(delta));
    let answer = -1, streamed = false;   // the output index of the one message that is streamed: the first final answer
    const notes = new Set<number>();     // the output indexes of the commentary messages
    for (;;) {
      const { value, done: ended } = await reader.read();
      if (ended) break;
      buf = (buf + dec.decode(value, { stream: true })).replace(/\r\n/g, "\n");   // on the whole buffer: a break can straddle two reads
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, i); buf = buf.slice(i + 2);
        const data = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
        if (!data || data === "[DONE]") continue;
        let ev: { type?: string; delta?: unknown; output_index?: number; item?: GptItem; response?: GptResponse; message?: string; code?: string };
        try { ev = JSON.parse(data); } catch { continue; }
        const at = ev.output_index ?? 0;
        if (ev.type === "response.output_item.added" && ev.item?.type === "message") { if (!isFinal(ev.item)) notes.add(at); else if (answer < 0) answer = at; }
        else if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") {
          if (answer < 0 && !notes.has(at)) answer = at;
          if (at === answer) { streamed = true; emit(ev.delta); }
        }
        else if (ev.type === "response.completed" || ev.type === "response.incomplete") final = ev.response ?? null;
        else if (ev.type === "response.failed") throw inBand(ev.response?.error ?? { message: "the response failed" }, key);
        else if (ev.type === "error") throw inBand({ message: ev.message, code: ev.code }, key);
      }
    }
    cites?.end();
    if (!final) throw new BrainError(502, "fetch failed: the brain stream ended without a reply");
    const message = toMessage(final, model);
    if (!streamed && message.content[0].text) say(message.content[0].text);   // cut off before the answer: what there is goes out once
    await meter?.(message.usage);
    return message;
  })();
  done.catch(() => { /* finalMessage() carries the failure to the route */ });
  const handle = {
    on(event: string, cb: (delta: string) => void) { if (event === "text") listeners.push(cb); return handle; },
    finalMessage: () => done,
  };
  return handle;
}

/** A client the routes can hold where they hold Anthropic's: messages.create and messages.stream. A lane that
 *  keeps no ledger of its own passes a meter, and every reply's usage is handed to it before the route sees it. */
export function openaiBrain(key: string, meter?: Meter): Anthropic {
  return { messages: { create: (p: BrainParams) => create(p, key, meter), stream: (p: BrainParams) => stream(p, key, meter) } } as unknown as Anthropic;
}
