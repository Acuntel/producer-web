// Screenshot a page in headless Chrome: node tests/cdp-shot.mjs <url> <out.png> [width] [height]
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const [URL_, OUT, W = "1200", H = "1600", START] = process.argv.slice(2);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; const PORT = 9337;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { (await import("node:child_process")).execSync("pkill -f 'producer-.*-profile' || true", { stdio: "ignore" }); } catch {}
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", "--no-first-run", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--window-size=${W},${H}`, "--user-data-dir=/tmp/producer-shot-profile", "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill("SIGKILL"); } catch {} });
let wsUrl; for (let i = 0; i < 40 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(250); } }
const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}, sessionId) => { const i = ++id; return new Promise((res) => { pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); }); };
const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId); await send("Runtime.enable", {}, sessionId);
await send("Emulation.setDeviceMetricsOverride", { width: Number(W), height: Number(H), deviceScaleFactor: 2, mobile: false }, sessionId);
await send("Page.navigate", { url: URL_ }, sessionId);
await sleep(4000);
if (START === "--start") { await send("Runtime.evaluate", { expression: `document.querySelector('button[aria-label="Start the session"]')?.click(); true` }, sessionId); await sleep(Number(process.env.SHOT_WAIT ?? 7000)); }
const probe = await send("Runtime.evaluate", { expression: `(() => { const lane = document.querySelector('main section .relative.h-7'); const ch = document.querySelector('main .w-\\\\[74px\\\\]'); const r = (e) => e ? { w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) } : null; return JSON.stringify({ lane: r(lane), mixerChannel: r(ch), notes: document.querySelectorAll('main section .relative.h-7 > div').length, bodyW: document.body.scrollWidth, viewportW: window.innerWidth }); })()`, returnByValue: true }, sessionId);
console.log("layout:", probe.result?.result?.value);
const { result: { data } } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, sessionId);
writeFileSync(OUT, Buffer.from(data, "base64"));
console.log("saved", OUT);
process.exit(0);
