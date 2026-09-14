// Screenshots of the V11 screens in headless Chrome, plus the DOM audit that catches
// clipping and tiny text. node tests/stage.shot.mjs <baseUrl> <outDir> [w h]
// Shots: landing, stage idle (harness boot with the seed), stage mid-conversation.
import { spawn, execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
const [BASE = "http://localhost:3111", OUT = "/tmp", W = "1440", H = "900"] = process.argv.slice(2);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; const PORT = 9338;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { execSync("pkill -f 'producer-.*-profile' || true", { stdio: "ignore" }); } catch {}
mkdirSync(OUT, { recursive: true });
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
await send("Emulation.setDeviceMetricsOverride", { width: Number(W), height: Number(H), deviceScaleFactor: 2, mobile: Number(W) < 600 }, sessionId);
const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, sessionId)).result?.result?.value;
const shot = async (name) => { const { result: { data } } = await send("Page.captureScreenshot", { format: "png" }, sessionId); const f = `${OUT}/${name}-${W}.png`; writeFileSync(f, Buffer.from(data, "base64")); console.log("saved", f); };
const audit = async (name) => {
  const r = await evalJs(`(() => {
    const tiny = [], clipped = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el); const fs = parseFloat(cs.fontSize);
      if (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && fs < 12) tiny.push(el.tagName + ':' + fs + ':' + el.textContent.trim().slice(0, 20));
      if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && cs.overflowX !== 'hidden' && el.clientWidth > 0 && !el.querySelector(':scope > [aria-hidden]')) clipped.push(el.tagName + '.' + String(el.className).slice(0, 30));
    }
    return JSON.stringify({ bodyW: document.body.scrollWidth, viewportW: innerWidth, tiny: tiny.slice(0, 8), clipped: clipped.slice(0, 8) });
  })()`);
  console.log(`audit ${name}:`, r);
};

await send("Page.navigate", { url: `${BASE}/?guest=1` }, sessionId); await sleep(3500);
await shot("landing"); await audit("landing");
await send("Page.navigate", { url: `${BASE}/?e2e=1&economy=1` }, sessionId); await sleep(9000);
await shot("stage-idle"); await audit("stage-idle");
// A typed ask so the ribbon, the work cards and the cost line are populated.
await evalJs(`(() => { const i = document.querySelector('input[aria-label="Message the producer"]'); if (!i) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(i, "make the bass darker and take me to the drop"); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
await sleep(Number(process.env.SHOT_WAIT ?? 12000));
await shot("stage-live"); await audit("stage-live");
console.log("voice:", await evalJs(`JSON.stringify((window.__voice ?? []).slice(-1))`));
process.exit(0);
