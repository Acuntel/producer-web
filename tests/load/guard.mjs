// What a probe lets through, and proof that it spent nothing. Every /api request is paused in the
// browser and decided here: the producer's voice gets silent PCM, the speech engine and the worker
// routes get a 503, production writes get a 503, and the model routes go to the mock server, whose
// answers carry x-producer-mock. A model route that answers without that header is a paid call.
// The same hook counts every native Web Audio node per realtime context (the DevTools WebAudio domain).
const SILENT_PCM = Buffer.alloc(24000 * 2 * 0.4).toString("base64");   // 0.4 s of 24 kHz 16-bit silence
const MODEL = /^\/api\/(chat|voice|critic|research|attend|step)(\/|$)/;
const BLOCK = /^\/api\/(stt|music|stems|find|identify|match|learn)(\/|$)/;
const WRITES = /^\/api\/(dna|account|usage)(\/|$)/;
const EXTERNAL = /huggingface|hf\.co|jsdelivr/;

export async function guard(page) {
  const spend = { speakStubbed: 0, speakChars: 0, blocked: {}, mocked: {}, paid: {}, external: 0 };
  const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
  const net = new Map();
  const audio = { contexts: new Map(), nodes: new Map() };
  page.on(async (msg) => {
    const p = msg.params; if (!p) return;
    if (msg.method === "Fetch.requestPaused") {
      const u = new URL(p.request.url); const path = u.pathname; const method = p.request.method;
      const answer = (code, type, body, headers = []) => page.call("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: code, responseHeaders: [{ name: "Content-Type", value: type }, ...headers], body });
      if (EXTERNAL.test(u.hostname)) { spend.external++; return answer(503, "text/plain", Buffer.from("blocked by the probe").toString("base64")); }
      if (path.startsWith("/api/speak")) {
        if (method === "POST") { spend.speakStubbed++; try { spend.speakChars += (JSON.parse(p.request.postData ?? "{}").text ?? "").length; } catch { /* no body */ } return answer(200, "audio/pcm; rate=24000", SILENT_PCM, [{ name: "Cache-Control", value: "no-store" }]); }
        return page.call("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 204, responseHeaders: [] });
      }
      if (BLOCK.test(path) || (WRITES.test(path) && method !== "GET")) { bump(spend.blocked, path); return answer(503, "application/json", Buffer.from('{"error":"blocked by the probe"}').toString("base64")); }
      return page.call("Fetch.continueRequest", { requestId: p.requestId });
    }
    if (msg.method === "Network.requestWillBeSent") net.set(p.requestId, { url: p.request.url, method: p.request.method, t: p.timestamp });
    if (msg.method === "Network.responseReceived") {
      const r = net.get(p.requestId); if (!r) return;
      const path = new URL(r.url).pathname; r.status = p.response.status; r.fromCache = !!p.response.fromDiskCache || !!p.response.fromMemoryCache || !!p.response.fromPrefetchCache;
      if (MODEL.test(path) && r.method !== "GET" && r.status < 500) {
        const h = Object.fromEntries(Object.entries(p.response.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
        bump(h["x-producer-mock"] === "1" ? spend.mocked : spend.paid, path);
      }
    }
    if (msg.method === "Network.loadingFinished") { const r = net.get(p.requestId); if (r) r.bytes = p.encodedDataLength; }
    if (msg.method === "Network.requestServedFromCache") { const r = net.get(p.requestId); if (r) r.fromCache = true; }
    if (msg.method === "WebAudio.contextCreated") audio.contexts.set(p.context.contextId, { type: p.context.contextType, sr: p.context.sampleRate, alive: true, nodes: 0, peak: 0 });
    if (msg.method === "WebAudio.contextWillBeDestroyed") { const c = audio.contexts.get(p.contextId); if (c) c.alive = false; }
    // A closed context (Tone's own, disposed when the studio's is installed) is no longer open.
    if (msg.method === "WebAudio.contextChanged") { const c = audio.contexts.get(p.context.contextId); if (c) { c.state = p.context.contextState; if (c.state === "closed") c.alive = false; } }
    if (msg.method === "WebAudio.audioNodeCreated") { const c = audio.contexts.get(p.node.contextId); if (c) { c.nodes++; c.peak = Math.max(c.peak, c.nodes); } audio.nodes.set(p.node.nodeId, p.node.contextId); }
    if (msg.method === "WebAudio.audioNodeWillBeDestroyed") { const cid = audio.nodes.get(p.nodeId) ?? p.contextId; const c = audio.contexts.get(cid); if (c) c.nodes--; audio.nodes.delete(p.nodeId); }
  });
  await page.call("Network.enable", { maxTotalBufferSize: 100_000_000 });
  await page.call("WebAudio.enable");
  await page.call("Fetch.enable", { patterns: [{ urlPattern: "*/api/*", requestStage: "Request" }, { urlPattern: "*huggingface*" }, { urlPattern: "*hf.co*" }, { urlPattern: "*jsdelivr*" }] });
  const realtime = () => [...audio.contexts.values()].filter((c) => c.type === "realtime" && c.alive);
  const paidCalls = () => Object.values(spend.paid).reduce((a, b) => a + b, 0);
  const requests = () => [...net.values()];
  const capacity = async () => {
    const out = [];
    for (const [id, c] of audio.contexts) if (c.type === "realtime" && c.alive) { const r = await page.call("WebAudio.getRealtimeData", { contextId: id }); if (r.result?.realtimeData) out.push({ sr: c.sr, nodes: c.nodes, capacity: Math.round(r.result.realtimeData.renderCapacity * 1000) / 10 }); }
    return out;
  };
  // A navigation ends the page's contexts without DevTools saying so, so the count starts again.
  const resetAudio = () => { audio.contexts.clear(); audio.nodes.clear(); };
  return { spend, paidCalls, realtime, requests, capacity, resetNet: () => net.clear(), resetAudio };
}
