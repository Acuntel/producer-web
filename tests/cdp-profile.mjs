// Profile JS on a page in headless Chrome: node tests/cdp-profile.mjs <url> <startMarker> <seconds>
import { spawn } from "node:child_process";
const [URL_, MARK, SECS] = [process.argv[2], process.argv[3], Number(process.argv[4] ?? 20)];
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; const PORT = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--mute-audio", "--user-data-dir=/tmp/producer-prof-profile", "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill("SIGKILL"); } catch {} });
let wsUrl; for (let i = 0; i < 40 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(250); } }
const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); let marked = false;
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === "Runtime.consoleAPICalled") { const txt = d.params.args.map((a) => a.value ?? "").join(" "); if (txt.includes(MARK)) marked = true; } };
const send = (method, params = {}, sessionId) => { const i = ++id; return new Promise((res) => { pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); }); };
const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Runtime.enable", {}, sessionId); await send("Page.enable", {}, sessionId); await send("Profiler.enable", {}, sessionId);
await send("Profiler.setSamplingInterval", { interval: 1000 }, sessionId);
await send("Page.navigate", { url: URL_ }, sessionId);
const t0 = Date.now(); while (!marked && Date.now() - t0 < 60000) await sleep(200);
console.log(`[prof] marker "${MARK}" seen after ${Date.now() - t0}ms; profiling ${SECS}s`);
await send("Profiler.start", {}, sessionId); await sleep(SECS * 1000);
const { result: { profile } } = await send("Profiler.stop", {}, sessionId);
const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const total = profile.samples.length; const counts = new Map();
for (const s of profile.samples) counts.set(s, (counts.get(s) ?? 0) + 1);
for (const [nid, c] of counts) { const n = byId.get(nid); const cf = n.callFrame; const key = `${cf.functionName || "(anon)"} ${cf.url.split("/").pop()}:${cf.lineNumber}`; self.set(key, (self.get(key) ?? 0) + c); }
console.log(`[prof] samples ${total}`);
for (const [k, c] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`${(100 * c / total).toFixed(1).padStart(5)}%  ${k}`);
process.exit(0);
