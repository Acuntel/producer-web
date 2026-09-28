// Why does it glitch? Boots the stage on the seed record, lets it play untouched, then fires instant moves
// the way a session does, and measures what the ear would hear: note events that fired late, the thinnest
// scheduling margin, main-thread long tasks, the cost of every rebuild, and whether an older build of the
// record is still alive on the transport. Ends with the open-a-project path, which is where the leak lives.
//   node tests/glitch.probe.mjs [baseUrl]
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.argv[2] ?? "http://localhost:3111";
const PORT = 9337;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--mute-audio", `--user-data-dir=/tmp/producer-glitch-profile-${process.pid}`, "about:blank"], { stdio: "ignore" });
process.on("exit", () => chrome.kill());
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }
const { webSocketDebuggerUrl } = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json());
const ws = new WebSocket(webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiters = new Map();
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); } };
const send = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; waiters.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId); await send("Runtime.enable", {}, sessionId);
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
const errors = [];
ws.addEventListener("message", (m) => {
  const d = JSON.parse(m.data);
  if (d.method === "Runtime.exceptionThrown") errors.push((d.params?.exceptionDetails?.exception?.description ?? d.params?.exceptionDetails?.text ?? "").slice(0, 300));
  if (d.method === "Runtime.consoleAPICalled" && (d.params?.type === "error" || d.params?.type === "warning")) errors.push(`${d.params.type}: ${(d.params.args ?? []).map((a) => a.description ?? a.value ?? "").join(" ").slice(0, 300)}`);
});
const js = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, sessionId); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "eval failed"); return r.result?.result?.value; };
const waitFor = async (expr, ms, what) => { const t0 = Date.now(); for (;;) { const v = await js(expr); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}`); await sleep(400); } };

await send("Page.navigate", { url: `${BASE}/?e2e=1` }, sessionId);
await waitFor(`typeof window.__audio === "function" && !!window.__audio()`, 60000, "the stage and the engine");
await waitFor(`/playing/.test(document.querySelector('[data-role="status"]')?.innerText ?? '')`, 60000, "the transport to play").catch(() => console.log("[glitch] status never said playing; measuring anyway"));
// Long tasks on the main thread (anything over 50 ms blocks the scheduler's tick), and the cost of every rebuild.
await js(`(() => {
  window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ d: Math.round(e.duration), t: Math.round(e.startTime) }); }).observe({ entryTypes: ["longtask"] });
  const P = Object.getPrototypeOf(window.__engine()); const orig = P.update; window.__updates = [];
  P.update = async function (...a) { const t0 = performance.now(); const r = await orig.apply(this, a); window.__updates.push(Math.round(performance.now() - t0)); return r; };
  return true; })()`);
const health = async () => JSON.parse(await js(`JSON.stringify(window.__audio())`));
const longTasks = async () => JSON.parse(await js(`JSON.stringify(window.__lt.splice(0))`));
const sum = (a) => a.reduce((x, y) => x + y, 0);
const line = (label, h0, h1, lt, ups) => {
  const ds = lt.map((x) => x.d);
  const worst = [...lt].sort((a, b) => b.d - a.d).slice(0, 3).map((x) => `${x.d} ms at ${(x.t / 1000).toFixed(1)} s`);
  console.log(`[glitch] ${label}: events ${h1.events - h0.events}, late ${h1.late - h0.late}, thinnest margin ${Number.isFinite(h1.minMarginMs) ? h1.minMarginMs.toFixed(1) : "n/a"} ms, graphs alive ${h1.graphsAlive}, long tasks ${lt.length} (max ${ds.length ? Math.max(...ds) : 0} ms, total ${sum(ds)} ms)${ups ? `, rebuilds ${ups.length} (max ${Math.max(...ups)} ms, mean ${Math.round(sum(ups) / ups.length)} ms)` : ""}`);
  if (worst.length) console.log(`[glitch]   worst blocks: ${worst.join(", ")} (page time)`);
};

// The record on the stage (the seed is only written to this device once a change is committed).
const song = JSON.parse(await js(`JSON.stringify(window.__song ? window.__song() : JSON.parse(localStorage.getItem('producer.song.v4')))`));
console.log(`[glitch] record: ${song.title}, ${song.bpm} BPM, ${song.tracks.length} tracks, ${song.sections.length} sections`);
// 1. Untouched: eight seconds of playback with nothing changing, with the profiler on it so a
// block is named rather than guessed at.
await longTasks();
await send("Profiler.enable", {}, sessionId);
await send("Profiler.setSamplingInterval", { interval: 500 }, sessionId);
await send("Profiler.start", {}, sessionId);
const a0 = await health(); await sleep(8000); const a1 = await health();
const prof = (await send("Profiler.stop", {}, sessionId)).result?.profile;
line("untouched 8 s", a0, a1, await longTasks());
if (prof?.nodes) {
  const self = new Map();
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const dt = prof.timeDeltas ?? [];
  prof.samples.forEach((id, i) => {
    const n = byId.get(id); if (!n) return;
    const f = n.callFrame;
    const name = `${f.functionName || "(anonymous)"} ${String(f.url || "").split("/").pop() ?? ""}:${f.lineNumber}`;
    self.set(name, (self.get(name) ?? 0) + (dt[i] ?? 0) / 1000);
  });
  const top = [...self.entries()].filter(([k]) => !/^\(program\)|^\(idle\)|^\(garbage/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`[glitch]   where the thread went: ${top.map(([k, v]) => `${k} ${Math.round(v)} ms`).join(" · ")}`);
}

// 2. A working session: ten instant moves, each one a full rebuild, spaced the way a person talks.
const MOVES = ["mute the pad", "unmute the pad", "mute the hats", "unmute the hats", "128 bpm", "126 bpm", "louder", "quieter", "mute the clap", "unmute the clap"];
const type = (t) => js(`(() => { const i = document.querySelector('input[aria-label="Message the producer"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(t)}); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
const b0 = await health();
for (const m of MOVES) { await type(m); await sleep(900); }
await sleep(3000);
const b1 = await health();
line("ten moves", b0, b1, await longTasks(), JSON.parse(await js(`JSON.stringify(window.__updates.splice(0))`)));
// How long the studio takes to hear itself, measured rather than assumed.
await waitFor(`(window.__ears?.()?.sections ?? 0) > 0 || (window.__facts?.() ? 1 : 0)`, 120000, "the first listen to land").catch(() => console.log("[glitch] the first listen had not landed after two minutes"));
const ears = JSON.parse(await js(`JSON.stringify(window.__ears?.() ?? null)`) ?? "null");
if (ears) console.log(`[glitch] listening: ${ears.sections} renders (${ears.cached} from cache), render ${ears.renderMs} ms, measure ${ears.hearMs} ms, off the main thread: ${ears.worker ? "yes" : "NO"}`);
const facts = JSON.parse(await js(`(() => { const f = window.__facts?.(); return f ? JSON.stringify({ bpm: Math.round(f.tempo.bpm), key: f.key.name, lufs: Math.round(f.loudness.integrated * 10) / 10, sections: f.structure.sections.length, read: (f.read || "").slice(0, 90) }) : "null"; })()`) ?? "null");
console.log(facts ? `[glitch] the ears heard: ${facts.bpm} BPM, ${facts.key}, ${facts.lufs} LUFS, ${facts.sections} sections. "${facts.read}"` : "[glitch] THE EARS HEARD NOTHING (facts are null)");

// 3. The open-a-project path: the record is loaded (update) before the session starts (start).
const c = JSON.parse(await js(`(async () => { const e = window.__engine(); const E = e.constructor; const s = JSON.parse(localStorage.getItem('producer.song.v4'));
  const e2 = new E(); const before = e.health().graphsAlive; await e2.update(s); const afterUpdate = e.health().graphsAlive; await e2.start(s); const afterStart = e.health().graphsAlive; e2.stop(); const afterStop = e.health().graphsAlive;
  return JSON.stringify({ before, afterUpdate, afterStart, afterStop }); })()`));
console.log(`[glitch] open-then-start: graphs alive before ${c.before}, after load ${c.afterUpdate}, after start ${c.afterStart}, after stop ${c.afterStop}${c.afterStop > c.before ? "  <- LEAK: a graph built by load survives start and stop, and keeps playing" : ""}`);
if (errors.length) { console.log(`[glitch] page errors (${errors.length}):`); for (const e of [...new Set(errors)].slice(0, 5)) console.log("   " + e.replace(/\n/g, " ")); }
const late = (b1.late - b0.late) + (a1.late - a0.late);
console.log(late || c.afterStop > c.before ? `[glitch] GLITCHY: ${late} late events, leak ${c.afterStop > c.before ? "yes" : "no"}` : "[glitch] CLEAN: no late events, no leak");
process.exit(0);
