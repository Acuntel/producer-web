// Does the free voice load and how fast does it speak? Headless Chrome (WASM, no GPU) on the
// stage with ?voice=local: the greeting is synthesized by Kokoro; the model downloads once.
// node tests/kokoro.probe.mjs [baseUrl]   (server: PRODUCER_MOCK=1 next start -p 3111)
import { spawn, execSync } from "node:child_process";
const BASE = process.argv[2] ?? "http://localhost:3111";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; const PORT = 9344;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { execSync("pkill -f 'producer-kokoro-profile' || true", { stdio: "ignore" }); } catch {}
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", "--no-first-run", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--window-size=1200,900", "--user-data-dir=/tmp/producer-kokoro-profile", "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill("SIGKILL"); } catch {} });
let wsUrl; for (let i = 0; i < 40 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(250); } }
const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const lines = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === "Runtime.consoleAPICalled") { const t = d.params.args.map((a) => a.value ?? a.description ?? "").join(" "); if (/kokoro/i.test(t)) { lines.push(t.slice(0, 200)); console.log("  ", t.slice(0, 160)); } } };
const send = (method, params = {}, sessionId) => { const i = ++id; return new Promise((res) => { pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); }); };
const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId); await send("Runtime.enable", {}, sessionId);
const t0 = Date.now();
await send("Page.navigate", { url: `${BASE}/?e2e=1&voice=local&mock=1&economy=1` }, sessionId);
let out = "[]";
for (let i = 0; i < 60; i++) { await sleep(3000); out = (await send("Runtime.evaluate", { expression: `JSON.stringify(window.__kokoro ?? [])`, returnByValue: true }, sessionId)).result?.result?.value ?? "[]"; if (JSON.parse(out).length) break; }
console.log(`kokoro after ${Math.round((Date.now() - t0) / 1000)} s:`, out.slice(0, 400));
console.log("console lines:", lines.length ? lines.join(" || ").slice(0, 600) : "none");
process.exit(0);
