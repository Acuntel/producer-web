// The tracklist screen, end to end in headless Chrome: sign up, find a two hour Essential Mix by name,
// press Tracklist on the first mix candidate, watch entries stream in, wait for the end, screenshot both.
// Costs about 40 to 60 recognitions on the worker's address, so it is a deliberate proof, not a routine gate.
// Usage: node tests/tracklist.ui.mjs [baseUrl] ; env SHOTS=<dir>, MIX_QUERY (default "kettama essential mix")
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const BASE = process.argv[2] ?? "http://localhost:3111";
const QUERY = process.env.MIX_QUERY ?? "kettama essential mix";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9337; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const SB = env.NEXT_PUBLIC_SUPABASE_URL, SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const stamp = Date.now().toString(36);
const EMAIL = `producer-tl-${stamp}@example.com`, PASSWORD = `Test-${stamp}-pass!`;
const shots = process.env.SHOTS ?? "/tmp";
try { (await import("node:child_process")).execSync("pkill -f 'producer-tl-profile' || true", { stdio: "ignore" }); } catch {}
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--disable-gpu", "--mute-audio", `--window-size=1440,1000`, `--user-data-dir=/tmp/producer-tl-profile-${stamp}`, "about:blank"], { stdio: "ignore" });
async function admin(path, init = {}) { const r = await fetch(`${SB}${path}`, { ...init, headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json", ...(init.headers ?? {}) } }); const t = await r.text(); return { status: r.status, body: t ? JSON.parse(t) : null }; }

async function main() {
  let wsUrl; for (let i = 0; i < 40 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(250); } }
  const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}, sessionId) => { const i = ++id; return new Promise((res, rej) => { pending.set(i, (d) => d.error ? rej(new Error(`${method}: ${JSON.stringify(d.error)}`)) : res(d.result)); ws.send(JSON.stringify({ id: i, method, params, sessionId })); }); };
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = (m, p) => send(m, p, sessionId);
  await call("Page.enable"); await call("Runtime.enable"); await call("DOM.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const js = async (expr) => { const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
  const waitFor = async (expr, ms, label) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await js(expr); if (v) return v; await sleep(500); } throw new Error(`timeout waiting for ${label}`); };
  const shot = async (name) => { const { data } = await call("Page.captureScreenshot", { format: "png" }); writeFileSync(`${shots}/${name}.png`, Buffer.from(data, "base64")); console.log(`[tl] shot ${shots}/${name}.png`); };
  const setInput = async (selector, value) => js(`(() => { const i = document.querySelector(${JSON.stringify(selector)}); if (!i) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const clickText = async (text, tag = "button") => js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(tag)})].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true; })()`);

  await call("Page.navigate", { url: `${BASE}/?typed=1&economy=1` });
  await waitFor(`document.body.innerText.includes('Create account')`, 30000, "gate");
  await setInput('input[type="email"]', EMAIL); await setInput('input[type="password"]', PASSWORD);
  assert.ok(await clickText("Create my account"), "submit");
  await waitFor(`!document.body.innerText.includes('Try it without an account')`, 30000, "gate closes");
  const users = await admin(`/auth/v1/admin/users?page=1&per_page=200`); const user = (users.body?.users ?? []).find((u) => u.email === EMAIL); assert.ok(user, "user in auth");
  console.log(`[tl] signed up ${EMAIL}`);
  await js(`document.querySelector('button[aria-label="Start the session"]')?.click(); true`);
  await waitFor(`!!document.querySelector('button[aria-label="Pause"]')`, 30000, "session");
  await js(`document.querySelector('button[aria-label="Analyze a record"]')?.click(); true`);
  await waitFor(`!!document.querySelector('[role="dialog"][aria-label="Analyze a record"] input[aria-label="Find a record"]')`, 8000, "sheet");
  await setInput('[role="dialog"][aria-label="Analyze a record"] input[aria-label="Find a record"]', QUERY);
  assert.ok(await clickText("Find it"), "find");
  const t0 = Date.now();
  await waitFor(`[...document.querySelectorAll('[role="dialog"][aria-label="Analyze a record"] button')].some((b) => b.textContent.trim() === 'Tracklist')`, 40000, "a mix candidate");
  const cands = await js(`[...document.querySelectorAll('[role="dialog"][aria-label="Analyze a record"] li')].map((l) => l.innerText.replace(/\\n/g, ' | ')).slice(0, 5)`);
  console.log(`[tl] candidates in ${Date.now() - t0} ms: ${JSON.stringify(cands)}`);
  await shot("tracklist-0-candidates");
  assert.ok(await clickText("Tracklist"), "tracklist button");
  const t1 = Date.now();
  const first = await waitFor(`document.querySelectorAll('ol[aria-label="Tracklist"] li').length`, 6 * 60 * 1000, "first entries");
  console.log(`[tl] first ${first} entries streamed after ${Math.round((Date.now() - t1) / 1000)} s`);
  await shot("tracklist-1-streaming");
  let last = 0, done = false; const t2 = Date.now();
  while (Date.now() - t2 < 12 * 60 * 1000) {
    await sleep(5000);
    const n = await js(`document.querySelectorAll('ol[aria-label="Tracklist"] li').length`);
    done = await js(`/records named from the sound/i.test(document.querySelector('[role="dialog"][aria-label="Analyze a record"]')?.innerText ?? '')`);
    if (n !== last) { console.log(`[tl]   +${Math.round((Date.now() - t1) / 1000)}s ${n} entries`); last = n; }
    if (done) break;
  }
  await shot("tracklist-2-done");
  const entries = await js(`[...document.querySelectorAll('ol[aria-label="Tracklist"] li')].map((l) => l.innerText.replace(/\\n/g, ' | '))`);
  console.log(`[tl] ${done ? "done" : "still running"} after ${Math.round((Date.now() - t1) / 1000)} s: ${entries.length} entries`);
  for (const e of entries.slice(0, 40)) console.log(`[tl]   ${e}`);
  const jobs = await admin(`/rest/v1/jobs?owner=eq.${user.id}&kind=eq.tracklist&select=status,result&order=created_at.desc&limit=1`);
  const res = jobs.body?.[0]?.result ?? {};
  console.log(`[tl] job: status=${jobs.body?.[0]?.status} duration=${res.durationSec}s timing=${JSON.stringify(res.timing ?? {})} cooldown=${res.cooldownSec ?? 0}`);
  assert.ok(entries.length >= 5, "at least five records named");
  const objs = await admin(`/storage/v1/object/list/clips`, { method: "POST", body: JSON.stringify({ prefix: user.id, limit: 500 }) });
  await admin(`/auth/v1/admin/users/${user.id}`, { method: "DELETE" });
  console.log(`[tl] cleanup user: done (${(objs.body ?? []).length} folders)`);
  console.log("[tl] ALL PASSED");
  ws.close(); chrome.kill();
}
main().catch((e) => { console.error("[tl] FAILED:", e.message); chrome.kill(); process.exit(1); });
