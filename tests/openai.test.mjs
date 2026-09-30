// The GPT adapter: the routes keep speaking Anthropic's shape, so the request, the reply, the usage and the
// price have to come out the way the ledger and the daily allowance expect. No network: fetch is replaced.
import { test } from "node:test";
import assert from "node:assert/strict";
import { requestBody, toMessage, openaiBrain, openaiModelFor, replyText, citeFilter, settle, tuning } from "../lib/brain/openai.ts";

tuning.baseMs = 1;   // the waits between tries are real; the tests do not need them long
import { costOf } from "../lib/cost.ts";

const realFetch = globalThis.fetch;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const reply = (text, usage = { input_tokens: 10, output_tokens: 2 }) => ({ id: "resp_1", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }], usage });
const withFetch = async (fn, run) => { const calls = []; globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body), headers: init.headers }); return fn(calls.length, calls.at(-1)); }; try { return await run(calls); } finally { globalThis.fetch = realFetch; } };

test("a brain call becomes one Responses call with the same limits", () => {
  const b = requestBody({
    model: "gpt-6-astra", max_tokens: 16000, output_config: { effort: "low" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    system: [{ type: "text", text: "PERSONA" }, { type: "text", text: "MIND", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: "hi" }, { role: "assistant", content: [{ type: "text", text: "yo" }, { type: "tool_use", id: "x" }] }, { role: "assistant", content: [{ type: "server_tool_use" }] }, { role: "user", content: "make it darker" }],
  }, true);
  assert.equal(b.model, "gpt-6-astra"); assert.equal(b.stream, true); assert.equal(b.store, false);
  assert.ok(b.instructions.startsWith("PERSONA\n\nMIND\n\nDELIVERY:"), "the prompts go first and unchanged, so the cached prefix holds");
  assert.match(b.instructions, /no links/, "a lane that searches asks for no links");
  assert.deepEqual(b.input, [{ role: "user", content: "hi" }, { role: "assistant", content: "yo", phase: "final_answer" }, { role: "user", content: "make it darker" }], "a turn with no words is dropped");
  assert.equal(b.max_output_tokens, 16000); assert.deepEqual(b.reasoning, { effort: "low" });
  assert.deepEqual(b.tools, [{ type: "web_search" }]); assert.equal(b.max_tool_calls, 3, "the search limit carries over");
  assert.ok(!("temperature" in b));
  assert.ok(!("temperature" in requestBody({ model: "gpt-6-sol", temperature: 0.2, output_config: { effort: "low" }, messages: [{ role: "user", content: "x" }] }, false)), "a model that is thinking takes no temperature, so none is sent");
  assert.deepEqual(requestBody({ model: "gpt-6-astra", max_tokens: 400, messages: [{ role: "user", content: "x" }] }, false).reasoning, { effort: "low" }, "the flagship cannot run without thinking");
});

test("a lane with no effort asks for no thinking, and the output ceiling never goes under OpenAI's floor", () => {
  const b = requestBody({ model: "gpt-6-luna", max_tokens: 5, temperature: 0.2, system: "one word", messages: [{ role: "user", content: "x" }] }, false);
  assert.deepEqual(b.reasoning, { effort: "none" }); assert.equal(b.max_output_tokens, 16); assert.equal(b.temperature, 0.2); assert.ok(!("tools" in b));
});

test("a Claude model name left in the env runs on the GPT tier that plays the same part", () => {
  assert.equal(openaiModelFor("claude-opus-5"), "gpt-6-astra"); assert.equal(openaiModelFor("claude-sonnet-5"), "gpt-6-sol");
  assert.equal(openaiModelFor("claude-haiku-4-5-20251001"), "gpt-6-luna"); assert.equal(openaiModelFor("gpt-6-sol"), "gpt-6-sol");
});

test("usage comes back in the ledger's terms and prices to OpenAI's list", () => {
  const m = toMessage({ status: "completed", output: [{ type: "web_search_call" }, { type: "web_search_call" }, { type: "message", content: [{ type: "output_text", text: '{"say":"ok"}' }] }],
    usage: { input_tokens: 30000, input_tokens_details: { cached_tokens: 20000, cache_write_tokens: 8000 }, output_tokens: 1000, output_tokens_details: { reasoning_tokens: 300 } } }, "gpt-6-sol");
  assert.equal(m.content[0].text, '{"say":"ok"}'); assert.equal(m.stop_reason, "end_turn");
  assert.deepEqual(m.usage, { model: "gpt-6-sol", input_tokens: 2000, output_tokens: 1000, cache_read_input_tokens: 20000, cache_creation_input_tokens: 8000, output_tokens_details: { thinking_tokens: 300 }, server_tool_use: { web_search_requests: 2 } });
  // 2000 x $2 + 1000 x $10 + 20000 x $0.20 + 8000 x $2.50, per million, plus two searches at a cent each.
  assert.equal(costOf("gpt-6-sol", m.usage), 0.058);
  assert.equal(costOf("claude-opus-5", m.usage), 0.058, "the model that really ran sets the price, whatever the route called it");
  assert.equal(costOf("gpt-6-astra", { input_tokens: 1e6, output_tokens: 1e6 }), 60); assert.equal(costOf("gpt-6-luna", { input_tokens: 1e6, output_tokens: 1e6 }), 0.6);
});

test("no GPT model can be priced under its list price", () => {
  const u = { input_tokens: 30000, output_tokens: 14000 };
  assert.equal(costOf("gpt-6-astra-2026-09-01", u), 1, "a pinned id is priced as its family");
  assert.equal(costOf("gpt-6-sol-latest", u), costOf("gpt-6-sol", u));
  assert.equal(costOf("gpt-7-unknown", u), 1, "an id the table has never seen is priced as the dearest GPT row");
  assert.equal(costOf("claude-sonnet-5", u), 0.2, "Claude prices are as they were"); assert.equal(costOf(undefined, u), 0.2);
  assert.equal(costOf("gpt-6-luna", { input_tokens: 350, output_tokens: 16 }), 0.000043, "the smallest call still costs something");
});

test("a reply cut off at the ceiling says so the way the step route checks it", () => {
  assert.equal(toMessage({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] }, "gpt-6-sol").stop_reason, "max_tokens");
  assert.equal(toMessage({ status: "incomplete", incomplete_details: { reason: "content_filter" }, output: [] }, "gpt-6-sol").stop_reason, "refusal");
});

test("a setting the model refuses is dropped, asked again once, and remembered", async () => {
  await withFetch((n) => (n === 1 ? json(400, { error: { message: "Unsupported parameter: 'temperature' is not supported with this model.", param: "temperature", code: null } }) : json(200, reply("OK"))), async (calls) => {
    const brain = openaiBrain("sk-test");
    const p = { model: "gpt-test-a", max_tokens: 64, temperature: 0.2, messages: [{ role: "user", content: "x" }] };
    const m = await brain.messages.create(p);
    assert.equal(m.content[0].text, "OK"); assert.equal(calls.length, 2);
    assert.equal(calls[0].body.temperature, 0.2); assert.ok(!("temperature" in calls[1].body));
    assert.equal(calls[0].headers.Authorization, "Bearer sk-test");
    await brain.messages.create(p);
    assert.equal(calls.length, 3, "the second exchange does not pay the round trip again"); assert.ok(!("temperature" in calls[2].body));
  });
  await withFetch((n) => (n === 1 ? json(400, { error: { message: "Unsupported value: 'none' is not supported", param: "reasoning.effort", code: "unsupported_value" } }) : json(200, reply("OK"))), async (calls) => {
    await openaiBrain("sk-test").messages.create({ model: "gpt-test-b", max_tokens: 64, messages: [{ role: "user", content: "x" }] });
    assert.equal(calls[0].body.reasoning.effort, "none"); assert.equal(calls[1].body.reasoning.effort, "low");
  });
});

test("failures read the way the routes' spoken lines and the retry expect, and never carry the key", async () => {
  const ask = { model: "gpt-6-sol", output_config: { effort: "low" }, messages: [{ role: "user", content: "x" }] };
  const fail = (status, error, key = "sk-test") => withFetch(() => json(status, { error }), async (calls) => ({ e: await openaiBrain(key).messages.create(ask).then(() => null, (e) => e), calls: calls.length }));
  const bad = await fail(401, { message: "Incorrect API key provided: sk-proj-abcd1234********wxyz. You can find your API key at the dashboard.", code: "invalid_api_key" });
  assert.equal(bad.e.status, 401); assert.match(bad.e.message, /^401 /); assert.ok(!/abcd1234/.test(bad.e.message), "the key is redacted"); assert.equal(bad.calls, 1, "a bad key is not tried again");
  const empty = await fail(429, { message: "You exceeded your current quota, please check your plan and billing details.", code: "insufficient_quota" });
  assert.equal(empty.e.status, 402); assert.match(empty.e.message, /billing/); assert.ok(!/429/.test(empty.e.message)); assert.equal(empty.calls, 1, "an empty account is not tried again");
  const busy = await fail(429, { message: "Rate limit reached for gpt-6-sol in organization org-a401b on tokens per min (TPM): Limit 30000, Used 26401, Requested 5200.", code: "rate_limit_exceeded" });
  assert.equal(busy.e.status, 429); assert.match(busy.e.message, /rate.?limit/i); assert.equal(busy.calls, 3, "a busy signal gets two more tries, as Anthropic's client gave it");
  assert.ok(!/401|5\d\d/.test(busy.e.message.slice(4)), "a counter in OpenAI's words never reads as a status code");
  const long = await fail(400, { message: "Input tokens exceed the configured limit of 272000 tokens. Your messages resulted in 281532 tokens.", code: "context_length_exceeded" });
  assert.equal(long.e.status, 400); assert.ok(!/5\d\d/.test(long.e.message), "and a request that can never pass is not read as worth a retry"); assert.equal(long.calls, 1);

  // A key with a line break inside never reaches fetch, whose own error would quote the whole header.
  const broken = await fail(200, {}, "sk-proj-FAKEFAKE\nfakefake");
  assert.equal(broken.e.status, 401); assert.equal(broken.calls, 0); assert.ok(!/FAKEFAKE|fakefake/.test(broken.e.message));
  // A dropped connection is tried again, and what fetch says about it is scrubbed of the key.
  const dropped = await withFetch((n) => { if (n < 3) throw new TypeError('Headers.append: "Bearer sk-live-SECRETSECRET" is an invalid header value.'); return json(200, reply("OK")); }, async (calls) => ({ m: await openaiBrain("sk-live-SECRETSECRET").messages.create(ask), calls: calls.length }));
  assert.equal(dropped.m.content[0].text, "OK"); assert.equal(dropped.calls, 3);
  const dead = await withFetch(() => { throw new TypeError('Headers.append: "Bearer sk-live-SECRETSECRET" is an invalid header value.'); }, () => openaiBrain("sk-live-SECRETSECRET").messages.create(ask).then(() => null, (e) => e));
  assert.equal(dead.status, 503); assert.match(dead.message, /fetch failed/); assert.ok(!/SECRET/.test(dead.message), "fetch's own words never carry the key");

  // A failure inside a 200: only the kinds that can pass on a second try read as worth one.
  const inBand = (error) => withFetch(() => new Response(`data: ${JSON.stringify({ type: "response.failed", response: { status: "failed", error } })}\n\n`, { status: 200 }), () => openaiBrain("sk-test").messages.stream(ask).finalMessage().then(() => null, (e) => e));
  assert.equal((await inBand({ code: "invalid_prompt", message: "Invalid prompt: flagged." })).status, 400);
  assert.equal((await inBand({ code: "server_error", message: "The server had an error." })).status, 502);
  assert.equal((await inBand({ code: "rate_limit_exceeded", message: "Rate limit reached." })).status, 429);
});

test("a lane with no ledger of its own hands every reply's usage to the meter", async () => {
  const seen = [];
  await withFetch(() => json(200, reply("six sentences", { input_tokens: 9000, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 4000 }, output_tokens: 200 })), async () => {
    await openaiBrain("sk-test", (u) => { seen.push(u); }).messages.create({ model: "gpt-6-sol", max_tokens: 700, tools: [{ type: "web_search_20260209", max_uses: 1 }], messages: [{ role: "user", content: "who is kettama" }] });
  });
  assert.equal(seen.length, 1); assert.equal(seen[0].model, "gpt-6-sol"); assert.equal(seen[0].input_tokens, 5000); assert.equal(seen[0].cache_creation_input_tokens, 4000);
});

test("the stream hands out each delta in order and ends on the full reply", async () => {
  const frames = [
    'event: response.created\ndata: {"type":"response.created"}\n\n',
    'event: response.output_item.added\ndata: {"type":"response.output_item.added","output_index":0,"item":{"type":"message","phase":"final_answer"}}\n\n',
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"{\\"say\\": \\"Dark"}\n\n',
    'event: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","delta":"er.\\"}"}\r\n\r\n',
    `event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: reply('{"say": "Darker."}', { input_tokens: 100, input_tokens_details: { cached_tokens: 60 }, output_tokens: 9 }) })}\n\n`,
  ].join("");
  // Cut the bytes at awkward places: a frame split across reads has to come out whole.
  const bytes = new TextEncoder().encode(frames); const chunks = []; for (let i = 0; i < bytes.length; i += 37) chunks.push(bytes.slice(i, i + 37));
  await withFetch(() => new Response(new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(ch); c.close(); } }), { status: 200 }), async (calls) => {
    const s = openaiBrain("sk-test").messages.stream({ model: "gpt-6-sol", max_tokens: 400, output_config: { effort: "low" }, messages: [{ role: "user", content: "darker" }] });
    const got = []; s.on("text", (d) => got.push(d));
    const m = await s.finalMessage();
    assert.deepEqual(got, ['{"say": "Dark', 'er."}']); assert.equal(calls[0].body.stream, true);
    assert.equal(m.content[0].text, '{"say": "Darker."}'); assert.equal(m.usage.input_tokens, 40); assert.equal(m.usage.cache_read_input_tokens, 60);
  });
  // The same frames with CRLF line ends, cut at every byte: a break that straddles two reads loses nothing.
  const crlf = new TextEncoder().encode(frames.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"));
  for (let cut = 1; cut < crlf.length; cut++) {
    await withFetch(() => new Response(new ReadableStream({ start(c) { c.enqueue(crlf.slice(0, cut)); c.enqueue(crlf.slice(cut)); c.close(); } }), { status: 200 }), async () => {
      const s = openaiBrain("sk-test").messages.stream({ model: "gpt-6-sol", max_tokens: 400, output_config: { effort: "low" }, messages: [{ role: "user", content: "darker" }] });
      let got = ""; s.on("text", (d) => { got += d; });
      const m = await s.finalMessage();
      assert.equal(got, '{"say": "Darker."}', `cut at byte ${cut}`); assert.equal(m.usage.cache_read_input_tokens, 60);
    });
  }
  await withFetch(() => new Response('data: {"type":"response.created"}\n\n', { status: 200 }), async () => {
    await assert.rejects(openaiBrain("sk-test").messages.stream({ model: "gpt-6-sol", messages: [{ role: "user", content: "x" }] }).finalMessage(), /ended without a reply/);
  });
});

test("the final answer is the reply; commentary ahead of it is never said or parsed", async () => {
  const say = "Brightening the hats.", line = '@@ {"task":"Brighten the hats."}', whole = `${say}\n${line}`;
  const draft = `${whole} \n} \nThe control line must be exact JSON. I accidentally added braces?`;   // seen live on gpt-6-luna
  const item = (phase, text) => ({ type: "message", phase, content: [{ type: "output_text", text }] });
  assert.equal(replyText([item("final_answer", whole)]), whole); assert.equal(replyText([item("commentary", say), item("final_answer", whole)]), whole);
  assert.equal(replyText([item("commentary", draft), item("final_answer", whole)]), whole, "a broken draft never reaches the parser");
  assert.equal(replyText([item("final_answer", whole), item("final_answer", whole)]), whole, "a final answer sent twice is read once (seen live on gpt-6-luna)");
  assert.equal(replyText([item("commentary", say), { type: "web_search_call" }]), say, "a reply cut off after the commentary still has its words");
  assert.equal(toMessage({ status: "completed", output: [item("commentary", draft), item("final_answer", whole)] }, "gpt-6-luna").content[0].text, whole);
  assert.equal(toMessage({ status: "completed", output: [item(undefined, whole)] }, "gpt-6-luna").content[0].text, whole, "a model with no phases is read as before");

  const ev = (o) => `data: ${JSON.stringify(o)}\n\n`;
  const streamOf = (frames) => withFetch(() => new Response(frames.join(""), { status: 200 }), async () => {
    const s = openaiBrain("sk-test").messages.stream({ model: "gpt-6-luna", max_tokens: 400, messages: [{ role: "user", content: "brighter hats" }] });
    let buf = ""; s.on("text", (d) => { buf += d; });
    return { buf, text: (await s.finalMessage()).content[0].text, get streamed() { return buf; } };
  });
  const both = await streamOf([ev({ type: "response.output_item.added", output_index: 0, item: { type: "message", phase: "commentary" } }), ev({ type: "response.output_text.delta", output_index: 0, delta: draft }),
    ev({ type: "response.output_item.added", output_index: 1, item: { type: "message", phase: "final_answer" } }), ev({ type: "response.output_text.delta", output_index: 1, delta: say }), ev({ type: "response.output_text.delta", output_index: 1, delta: `\n${line}` }),
    ev({ type: "response.output_item.added", output_index: 2, item: { type: "message", phase: "final_answer" } }), ev({ type: "response.output_text.delta", output_index: 2, delta: whole }),
    ev({ type: "response.completed", response: { status: "completed", output: [item("commentary", draft), item("final_answer", whole), item("final_answer", whole)], usage: { input_tokens: 5, output_tokens: 20 } } })]);
  assert.equal(both.streamed, whole, "only the first final answer is streamed"); assert.equal(both.text, whole);
  const cut = await streamOf([ev({ type: "response.output_item.added", output_index: 0, item: { type: "message", phase: "commentary" } }), ev({ type: "response.output_text.delta", output_index: 0, delta: say }),
    ev({ type: "response.incomplete", response: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [item("commentary", say)] } })]);
  assert.equal(cut.streamed, say, "cut off before the answer: what there is goes out once"); assert.equal(cut.text, say);
});

test("the sources GPT writes into a searched answer never reach the words", async () => {
  const cited = 'Mochakk is Pedro Maia, a Brazilian producer. ([mochakk.com](https://mochakk.com/en/pages/sobre?utm_source=openai)) Hear "Jealous" for the bassline. ([music.apple.com](https://music.apple.com/us/artist/mochakk/1230228889?utm_source=openai))';
  const clean = 'Mochakk is Pedro Maia, a Brazilian producer. Hear "Jealous" for the bassline.';
  assert.equal(replyText([{ type: "web_search_call" }, { type: "message", phase: "final_answer", content: [{ type: "output_text", text: cited }] }]), clean);
  assert.equal(replyText([{ type: "message", content: [{ type: "output_text", text: '{"say": "It sits at 125. ([tunebat.com](https://tunebat.com/x?utm_source=openai))", "ops": [{"op":"setBpm","bpm":125}]}' }] }]), '{"say": "It sits at 125.", "ops": [{"op":"setBpm","bpm":125}]}', "inside the JSON too, and the ops are untouched");
  const plain = '{"ops": [{"op": "setNotes", "notes": [[36, 0, 1], [38, 1, 1]]}], "say": "Done (finally)."}';
  assert.equal(replyText([{ type: "message", content: [{ type: "output_text", text: plain }] }]), plain, "brackets that are not a citation are left alone");
  const mixed = 'See (the [Apple page](https://music.apple.com/x?utm_source=openai) for more) and [this](https://example.com/plain) stays.';
  assert.equal(settle(mixed, true).out, "See (the for more) and [this](https://example.com/plain) stays.", "only OpenAI's own citations go");
  for (const text of [cited, plain, mixed, "No sources here. (Just a note.) [x] (", '{"say": "125. ([tunebat.com](https://tunebat.com/x?utm_source=openai))"}']) {
    for (const size of [1, 2, 3, 7, 50]) {
      let got = ""; const f = citeFilter((d) => { got += d; });
      for (let i = 0; i < text.length; i += size) f.push(text.slice(i, i + size));
      f.end();
      assert.equal(got, settle(text, true).out, `streamed ${size} at a time: ${text.slice(0, 30)}`);
      assert.ok(!/utm_source/.test(got), "no citation is ever handed out");
    }
  }
});
