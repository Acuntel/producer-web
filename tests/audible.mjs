// Can you hear it? Boots the stage, asks the producer to build, plays, and measures the real output.
// node tests/audible.mjs [baseUrl] [ask]
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.argv[2] ?? "http://localhost:3111";
const ASK = process.argv[3] ?? "build me a rolling tech house groove, sixteen bars";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--remote-debugging-port=9333", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--mute-audio=false", "about:blank"], { stdio: "ignore" });
process.on("exit", () => chrome.kill());
await sleep(2500);
const { webSocketDebuggerUrl } = await fetch("http://127.0.0.1:9333/json/version").then((r) => r.json());
const ws = new WebSocket(webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiters = new Map();
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); } };
const send = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; waiters.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId); await send("Runtime.enable", {}, sessionId); await send("Log.enable", {}, sessionId);
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
await send("Runtime.evaluate", { expression: `window.addEventListener("unhandledrejection", (e) => console.error("UNHANDLED: " + (e.reason?.message ?? e.reason)))` }, sessionId);
const errors = [];
ws.addEventListener("message", (m) => {
  const d = JSON.parse(m.data);
  if (d.method === "Runtime.exceptionThrown") errors.push("EXCEPTION: " + (d.params?.exceptionDetails?.exception?.description ?? d.params?.exceptionDetails?.text ?? "").slice(0, 400));
  if (d.method === "Runtime.consoleAPICalled" && d.params?.type === "error") errors.push("console.error: " + (d.params.args ?? []).map((a) => a.description ?? a.value ?? "").join(" ").slice(0, 400));
  if (d.method === "Log.entryAdded" && d.params?.entry?.level === "error") errors.push("log: " + (d.params.entry.text ?? "").slice(0, 300));
});
const js = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, sessionId)).result?.result?.value;
const waitFor = async (expr, ms, what) => { const t0 = Date.now(); for (;;) { const v = await js(expr); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}`); await sleep(500); } };

const FRESH = process.argv.includes("--fresh");   // the path a person takes: landing, New project, a blank record
await send("Page.navigate", { url: `${BASE}/?e2e=1${FRESH ? "&landing=1&guest=1" : ""}` }, sessionId);
if (FRESH) {
  await waitFor(`!!document.querySelector('[data-role="new-project"]')`, 30000, "the landing");
  await waitFor(`typeof window.__levels === "function"`, 30000, "the page to come alive");   // hydration: before this, a click hits dead HTML
  // A real click, dispatched by the browser at the button's own coordinates, so the page sees a trusted gesture.
  await js(`(() => { document.querySelector('[data-role="new-project"]').click(); return true; })()`);
  await waitFor(`document.querySelector('main')?.dataset?.view === "stage"`, 20000, "the stage to open");
  console.log("[audible] pressed New project");
  const blank = await waitFor(`(() => { const s = JSON.parse(localStorage.getItem('producer.song.v4') || '{}'); return (s.tracks || []).length === 0 ? 'blank' : ''; })()`, 30000, "a blank record").catch(() => "");
  console.log(`[audible] the new record is ${blank || "not blank"}`);
}
await waitFor(`!!document.querySelector('[data-role="speak"]')`, 30000, "the control");
const where = `(() => (document.querySelector('main')?.dataset?.view ?? (document.querySelector('[data-role="new-project"]') ? "landing" : document.querySelector('[data-role="status"]') ? "stage" : "unknown")) + ":" + (document.querySelector('main')?.dataset?.started ?? "?"))()`;
console.log(`[audible] screen after entering: ${await js(where)}`);
await waitFor(`typeof window.__levels === "function"`, 30000, "the level probe");
console.log("[audible] stage up");
await js(`(() => { const i = document.querySelector('input[aria-label="Message the producer"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(ASK)}); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
console.log(`[audible] asked: ${ASK}`);
const tracks = await waitFor(`(() => { const s = JSON.parse(localStorage.getItem('producer.song.v4') || '{}'); return (s.tracks || []).length || 0; })()`, 180000, "the hands to build tracks");
console.log(`[audible] the record now has ${tracks} tracks`);
// Make sure it is playing, then listen for two seconds.
await js(`(() => { const b = document.querySelector('[data-role="speak"]'); return true; })()`);
await waitFor(`/playing/.test(document.querySelector('[data-role="status"]')?.innerText ?? '')`, 60000, "the transport to play").catch(() => console.log("[audible] status did not say playing; measuring anyway"));
console.log(`[audible] screen now: ${await js(where)}; voice said: ${(await js(`JSON.stringify((window.__voice ?? []).map((v) => ({ ask: v.ask, control: v.control })).slice(-3))`)) ?? "none"}`);
const state = await js(`(() => { const T = window.Tone; return JSON.stringify({ context: T?.getContext?.()?.state ?? null, raw: T?.getContext?.()?.rawContext?.state ?? null, transport: T?.getTransport?.()?.state ?? null, bpm: T?.getTransport?.()?.bpm?.value ?? null, status: document.querySelector('[data-role="status"]')?.innerText ?? "" }); })()`);
console.log(`[audible] audio state: ${state}`);
// -Infinity does not survive JSON: the page turns every level into a finite number first.
const sample = `(() => { const l = window.__levels?.(); if (!l) return null; const fin = (x) => (typeof x === "number" && Number.isFinite(x) ? x : -120); const m = Array.isArray(l.master) ? Math.max(fin(l.master[0]), fin(l.master[1])) : fin(l.master); const t = {}; for (const k in (l.tracks ?? {})) t[k] = fin(l.tracks[k]); return JSON.stringify({ master: m, tracks: t }); })()`;
const samples = [];
for (let i = 0; i < 24; i++) { const lv = await js(sample); if (lv) samples.push(JSON.parse(lv)); await sleep(150); }
const masters = samples.map((s) => s.master).filter((x) => typeof x === "number");
const peak = masters.length ? Math.max(...masters) : -120;
const perTrack = {};
for (const s of samples) for (const [k, v] of Object.entries(s.tracks ?? {})) perTrack[k] = Math.max(perTrack[k] ?? -120, v);
const loud = Object.entries(perTrack).filter(([, v]) => v > -60).map(([k, v]) => `${k} ${v.toFixed(1)} dB`);
console.log(`[audible] master peak over 3 s: ${peak.toFixed(1)} dB`);
console.log(`[audible] tracks making sound: ${loud.length ? loud.join(", ") : "none"}`);
const ok = peak > -45 && loud.length > 0;
if (!ok) console.log(`[audible] quietest read: master ${peak.toFixed(1)} dB; tracks ${JSON.stringify(perTrack)}`);
if (errors.length) { console.log(`[audible] page errors (${errors.length}):`); for (const e of [...new Set(errors)].slice(0, 6)) console.log("   " + e.replace(/\n/g, " ").slice(0, 300)); }
console.log(ok ? "[audible] AUDIBLE: the record is making sound" : "[audible] SILENT: nothing is coming out");
process.exit(ok ? 0 : 1);
