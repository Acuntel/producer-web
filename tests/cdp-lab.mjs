// Run timed experiments against window.__lab on /selftest?lab=1. node tests/cdp-lab.mjs <baseUrl> <expr...>
import { spawn } from "node:child_process";
const BASE = process.argv[2]; const EXPRS = process.argv.slice(3);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; const PORT = 9336;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--mute-audio", "--user-data-dir=/tmp/producer-lab-profile", "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill("SIGKILL"); } catch {} });
let wsUrl; for (let i = 0; i < 40 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(250); } }
const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === "Runtime.exceptionThrown") console.log("[exception]", JSON.stringify(d.params.exceptionDetails).slice(0, 400)); };
const send = (method, params = {}, sessionId) => { const i = ++id; return new Promise((res) => { pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); }); };
const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Runtime.enable", {}, sessionId); await send("Page.enable", {}, sessionId);
await send("Page.navigate", { url: `${BASE}/selftest?lab=1` }, sessionId);
for (let i = 0; i < 60; i++) { const r = await send("Runtime.evaluate", { expression: "document.querySelector('#result')?.textContent", returnByValue: true }, sessionId); if (r.result?.result?.value === "lab ready") break; await sleep(500); }
for (const expr of EXPRS) {
  const t0 = Date.now();
  const r = await send("Runtime.evaluate", { expression: `(async () => { const L = window.__lab; const t0 = performance.now(); const v = await (${expr}); return { ms: Math.round(performance.now() - t0), v: typeof v === 'object' && v && v.length !== undefined && v.sampleRate ? { len: v.length, sr: v.sampleRate } : v }; })()`, awaitPromise: true, returnByValue: true, timeout: 280000 }, sessionId);
  const out = r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? JSON.stringify(r).slice(0, 300);
  console.log(`[lab ${Date.now() - t0}ms] ${expr.slice(0, 90)} => ${JSON.stringify(out).slice(0, 300)}`);
}
process.exit(0);
