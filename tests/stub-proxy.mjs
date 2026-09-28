// npm run stub: a pass-through in front of the mock server for harnesses that do not intercept
// their own requests. The producer's voice gets 0.4 s of silent 24 kHz PCM (no ElevenLabs
// characters), its warm-up gets a 204, and the speech engine, the worker, the music model and
// every production write get a 503. Everything else, the mock-guarded model routes included, is
// piped to the server as is.
//   node tests/stub-proxy.mjs [listenPort=3112] [target=http://127.0.0.1:3111]
import http from "node:http";

const PORT = Number(process.argv[2] ?? 3112);
const TARGET = new URL(process.argv[3] ?? "http://127.0.0.1:3111");
const SILENT = Buffer.alloc(24000 * 2 * 0.4);
const BLOCK = /^\/api\/(stt|music|stems|find|identify|match|learn)(\/|\?|$)/;
const WRITES = /^\/api\/(dna|account|usage)(\/|\?|$)/;
let stubbed = 0, chars = 0, blocked = 0;

http.createServer((req, res) => {
  const url = req.url ?? "/";
  if (url.startsWith("/api/speak")) {
    if (req.method !== "POST") { req.resume(); res.writeHead(204); res.end(); return; }
    let body = ""; req.on("data", (d) => (body += d));
    req.on("end", () => { stubbed++; try { chars += (JSON.parse(body).text ?? "").length; } catch { /* no body */ } res.writeHead(200, { "Content-Type": "audio/pcm; rate=24000", "Cache-Control": "no-store" }); res.end(SILENT); });
    return;
  }
  if (BLOCK.test(url) || (WRITES.test(url) && req.method !== "GET")) { blocked++; req.resume(); res.writeHead(503, { "Content-Type": "application/json" }); res.end('{"error":"blocked by the stub proxy"}'); return; }
  const up = http.request({ host: TARGET.hostname, port: TARGET.port, method: req.method, path: url, headers: { ...req.headers, host: `${TARGET.hostname}:${TARGET.port}` } }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
  up.on("error", () => { try { res.writeHead(502); res.end(); } catch { /* closed */ } });
  req.pipe(up);
}).listen(PORT, () => console.log(`[stub-proxy] :${PORT} -> ${TARGET.href}`));

const bye = () => { console.log(`[stub-proxy] stubbed ${stubbed} voice requests (${chars} chars never sent), blocked ${blocked}`); process.exit(0); };
process.on("SIGTERM", bye); process.on("SIGINT", bye);
