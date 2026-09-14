// The real push-to-talk path, end to end, in headless Chrome whose microphone is a WAV
// of a spoken sentence: landing -> New project -> greeting -> hold the Speak button ->
// release -> the engine commits -> the Voice answers -> the Hands change the song.
// Usage: node tests/speak.e2e.mjs [baseUrl]   (fixture: tests/fixtures/voice-ask.wav)
import { spawn, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const BASE = process.argv[2] ?? "http://localhost:3111";
const WAV = resolve("tests/fixtures/voice-ask.wav");
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9341; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { execSync("pkill -f 'producer-speak-profile' || true", { stdio: "ignore" }); } catch {}
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--disable-gpu", "--mute-audio", "--window-size=1440,1000", `--user-data-dir=/tmp/producer-speak-profile-${Date.now().toString(36)}`, "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill("SIGKILL"); } catch {} });

async function main() {
  let wsUrl; for (let i = 0; i < 40 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(250); } }
  const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const lines = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === "Runtime.consoleAPICalled") lines.push(d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 220)); else if (d.method === "Runtime.exceptionThrown") lines.push("EXCEPTION " + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text ?? "").slice(0, 300)); };
  const send = (method, params = {}, sessionId) => { const i = ++id; return new Promise((res, rej) => { pending.set(i, (d) => d.error ? rej(new Error(`${method}: ${JSON.stringify(d.error)}`)) : res(d.result)); ws.send(JSON.stringify({ id: i, method, params, sessionId })); }); };
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = (m, p) => send(m, p, sessionId);
  await call("Page.enable"); await call("Runtime.enable");
  const b64 = readFileSync(WAV).toString("base64");
  await call("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const B64 = ${JSON.stringify(b64)}; const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = async (c) => { if (!c || !c.audio) return orig(c); const bytes = Uint8Array.from(atob(B64), (ch) => ch.charCodeAt(0)); const ctx = new AudioContext(); const buf = await ctx.decodeAudioData(bytes.buffer.slice(0)); const src = ctx.createBufferSource(); src.buffer = buf; const dst = ctx.createMediaStreamDestination(); src.connect(dst); src.start(ctx.currentTime + 0.4); window.__fakeMic = (window.__fakeMic ?? 0) + 1; return dst.stream; }; })();` });
  const js = async (expr) => { const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
  const waitFor = async (expr, ms, label) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await js(expr); if (v) return v; await sleep(300); } throw new Error(`timeout waiting for ${label}`); };

  await call("Page.navigate", { url: `${BASE}/?guest=1&voice=1&economy=1` });
  await sleep(2000);
  await js(`localStorage.clear(); localStorage.setItem('producer.guest.v1','1'); true`);
  // voice=1 records __stt/__voice/__brain without the harness auto-stage, so the landing is real.
  await call("Page.navigate", { url: `${BASE}/?guest=1&voice=1&economy=1` });
  await waitFor(`!!document.querySelector('[data-role="new-project"]')`, 30000, "landing");
  await js(`document.querySelector('[data-role="new-project"]').click(); true`);
  const greeting = await waitFor(`(() => { const els = document.querySelectorAll('[data-role="producer-line"] p'); return els.length ? els[els.length - 1].textContent : ''; })()`, 30000, "greeting");
  console.log(`[speak] greeting: ${greeting.slice(0, 100)}`);
  await sleep(1500);
  // Hold the button for four seconds (the WAV is about three), then release.
  const pointer = (type) => js(`(() => { const b = document.querySelector('[data-role="speak"]'); b.dispatchEvent(new PointerEvent('${type}', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 })); return true; })()`);
  await pointer("pointerdown");
  await waitFor(`document.querySelector('[data-role="speak"]')?.getAttribute('aria-pressed') === 'true'`, 5000, "holding state");
  console.log(`[speak] holding; fake mic streams: ${await js("window.__fakeMic ?? 0")}`);
  await sleep(4200);
  const interim = await js(`document.querySelector('[data-role="interim"] p')?.textContent ?? ''`);
  console.log(`[speak] interim while holding: "${interim.slice(0, 80)}"`);
  const tRelease = Date.now();
  await pointer("pointerup");
  let heard;
  try { heard = await waitFor(`(() => { const s = window.__stt ?? []; return s.length ? JSON.stringify(s[s.length - 1]) : ''; })()`, 15000, "committed transcript"); }
  catch (e) { console.log(`[speak] console: ${lines.filter((l) => /speak|scribe|EXCEPTION|error/i.test(l)).slice(-10).join(" | ")}`); throw e; }
  const stt = JSON.parse(heard);
  console.log(`[speak] committed ${Date.now() - tRelease} ms after release (engine ${stt.engine}, ${stt.ms} ms measured): "${stt.text}"`);
  assert.ok(/bass|darker|drop/i.test(stt.text), `the spoken sentence should be transcribed, got "${stt.text}"`);
  const voice = JSON.parse(await waitFor(`(() => { const v = window.__voice ?? []; return v.length ? JSON.stringify(v[v.length - 1]) : ''; })()`, 30000, "voice reply"));
  console.log(`[speak] voice first sentence ${voice.firstWord} ms after the commit, route ${voice.voiceMs} ms: "${voice.say.slice(0, 120)}" control ${JSON.stringify(voice.control).slice(0, 160)}`);
  assert.ok(voice.control.task || voice.control.audition, "the voice should hand the hands a task");
  await waitFor(`(window.__brain ?? []).length >= 1`, 120000, "hands reply");
  const brain = JSON.parse(await js(`JSON.stringify((window.__brain ?? []).slice(-1)[0])`));
  console.log(`[speak] hands (${brain.model}): ${(brain.say ?? "").slice(0, 120)} | ops ${Array.isArray(brain.ops) ? brain.ops.length : 0}`);
  assert.ok(Array.isArray(brain.ops) && brain.ops.length > 0 || brain.song, "the hands should have changed the song");
  console.log(`[speak] speak log: ${lines.filter((l) => /^speak:/.test(l)).join(" | ")}`);
  console.log(`[speak] cost: ${await js(`document.querySelector('[data-role="cost"]')?.innerText ?? ''`)}`);
  console.log("[speak] ALL PASSED");
  process.exit(0);
}
main().catch((e) => { console.error("[speak] FAILED:", e.message); process.exit(1); });
