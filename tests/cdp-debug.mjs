// Debug helper: open a URL in headless Chrome, stream console messages and
// print #result / body text every few seconds. node tests/cdp-debug.mjs <url> [seconds]
import { spawn } from "node:child_process";
const URL_ = process.argv[2]; const SECS = Number(process.argv[3] ?? 40);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--mute-audio", "--user-data-dir=/tmp/producer-dbg-profile", "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill("SIGKILL"); } catch {} });
let wsUrl; for (let i = 0; i < 40 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(250); } }
const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === "Runtime.consoleAPICalled") console.log("[console]", d.params.type, d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 400)); else if (d.method === "Runtime.exceptionThrown") console.log("[exception]", JSON.stringify(d.params.exceptionDetails).slice(0, 600)); };
const send = (method, params = {}, sessionId) => { const i = ++id; return new Promise((res) => { pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); }); };
const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Runtime.enable", {}, sessionId); await send("Page.enable", {}, sessionId);
await send("Page.navigate", { url: URL_ }, sessionId);
const t0 = Date.now();
while (Date.now() - t0 < SECS * 1000) {
  await sleep(5000);
  const r = await send("Runtime.evaluate", { expression: "(document.querySelector('#result')?.textContent ?? document.body.innerText).slice(0, 300)", returnByValue: true }, sessionId);
  console.log(`[${Math.round((Date.now() - t0) / 1000)}s]`, r.result?.result?.value);
  if ((r.result?.result?.value ?? "").startsWith("{")) break;
}
process.exit(0);
