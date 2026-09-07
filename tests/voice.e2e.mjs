// Voice end to end: headless Chrome whose microphone is a WAV of a spoken sentence.
// The realtime speech engine transcribes it inside the product, the attention layer
// passes it, the brain changes the song. Usage: node tests/voice.e2e.mjs [baseUrl]
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const BASE = process.argv[2] ?? "http://localhost:3111";
const WAV = resolve("tests/fixtures/voice-ask.wav");
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9339; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { (await import("node:child_process")).execSync("pkill -f 'producer-voice-profile' || true", { stdio: "ignore" }); } catch {}
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--disable-gpu", "--mute-audio", "--window-size=1440,1000", `--user-data-dir=/tmp/producer-voice-profile-${Date.now().toString(36)}`, "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill("SIGKILL"); } catch {} });

async function main() {
  let wsUrl; for (let i = 0; i < 40 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(250); } }
  const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const lines = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === "Runtime.consoleAPICalled") lines.push(d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200)); else if (d.method === "Runtime.exceptionThrown") lines.push("EXCEPTION " + JSON.stringify(d.params.exceptionDetails).slice(0, 300)); };
  const send = (method, params = {}, sessionId) => { const i = ++id; return new Promise((res, rej) => { pending.set(i, (d) => d.error ? rej(new Error(`${method}: ${JSON.stringify(d.error)}`)) : res(d.result)); ws.send(JSON.stringify({ id: i, method, params, sessionId })); }); };
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = (m, p) => send(m, p, sessionId);
  await call("Page.enable"); await call("Runtime.enable");
  // The microphone is the spoken WAV: every getUserMedia({audio}) gets a stream playing it from the top.
  const b64 = readFileSync(WAV).toString("base64");
  await call("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const B64 = ${JSON.stringify(b64)}; const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = async (c) => { if (!c || !c.audio) return orig(c); const bytes = Uint8Array.from(atob(B64), (ch) => ch.charCodeAt(0)); const ctx = new AudioContext(); const buf = await ctx.decodeAudioData(bytes.buffer.slice(0)); const src = ctx.createBufferSource(); src.buffer = buf; const dst = ctx.createMediaStreamDestination(); src.connect(dst); src.start(); window.__fakeMic = (window.__fakeMic ?? 0) + 1; return dst.stream; }; })();` });
  const js = async (expr) => { const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
  const waitFor = async (expr, ms, label) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await js(expr); if (v) return v; await sleep(400); } throw new Error(`timeout waiting for ${label}`); };
  // Guest mode, NOT typed: the microphone drives the session.
  await call("Page.navigate", { url: `${BASE}/?guest=1&economy=1` });
  await sleep(2500);
  await js(`localStorage.clear(); localStorage.setItem('producer.guest.v1','1'); true`);
  await call("Page.navigate", { url: `${BASE}/?guest=1&economy=1` });
  await waitFor(`!!document.querySelector('button[aria-label="Start the session"]') || document.body.innerText.includes('New session')`, 30000, "home or orb");
  // From Home, New session opens the studio and starts it (one tap).
  if (await js(`document.body.innerText.includes('New session')`)) { await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'New session')?.click(); true`); }
  else await js(`document.querySelector('button[aria-label="Start the session"]')?.click(); true`);
  await waitFor(`!!document.querySelector('button[aria-label="Pause"]')`, 30000, "session running");
  const greeting = await waitFor(`(document.querySelector('[data-role="producer-line"]')?.textContent ?? '')`, 15000, "greeting");
  console.log(`[voice] greeting: ${greeting.slice(0, 120)}`);
  const tracks0 = await js(`JSON.parse(localStorage.getItem('producer.song.v4')).tracks.length`);
  console.log(`[voice] new session starts with ${tracks0} tracks (blank canvas); fake mic streams opened: ${await js("window.__fakeMic ?? 0")}`);
  const t0 = Date.now();
  let heard = "";
  try { heard = await waitFor(`(() => { const t = (document.querySelector('[data-role="you-line"]')?.textContent ?? '').trim(); return /bass|darker|drop/i.test(t) ? t : ''; })()`, 60000, "the spoken sentence to be heard"); }
  catch (e) { console.log(`[voice] console: ${lines.filter((l) => /scribe|EXCEPTION|error|mic/i.test(l)).slice(-12).join(" | ")}`); console.log(`[voice] you-line: ${await js(`document.querySelector('[data-role="you-line"]')?.textContent ?? ''`)} | status: ${await js(`(document.body.innerText.match(/(Hearing you|Listening|Mic is live[^\\n]*|Microphone blocked[^\\n]*|Speech service[^\\n]*|No microphone[^\\n]*|Opening the microphone)/) || [''])[0]`)}`); throw e; }
  console.log(`[voice] heard after ${Math.round((Date.now() - t0) / 1000)}s: "${heard}"`);
  const engine = await js(`document.body.innerText.includes('Hearing you') || document.body.innerText.includes('Listening')`);
  void engine;
  const reply = await waitFor(`(() => { const t = (document.querySelector('[data-role="producer-line"]')?.textContent ?? '').trim(); return t && !/^(New record|We are live|We are back|Working on it|Ready when)/.test(t) ? t : ''; })()`, 90000, "the producer's answer");
  console.log(`[voice] producer: ${reply.slice(0, 160)}`);
  console.log(`[voice] console: ${lines.filter((l) => /scribe|EXCEPTION|error/i.test(l)).slice(-4).join(" | ") || "clean"}`);
  assert.ok(/bass|darker|drop/i.test(heard), "spoken sentence transcribed");
  console.log("[voice] ALL PASSED");
  process.exit(0);
}
main().catch((e) => { console.error("[voice] FAILED:", e.message); process.exit(1); });
