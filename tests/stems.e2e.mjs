// Stems end to end in headless Chrome against a live worker: sign up, open Analyze,
// upload a real track, wait for stems + one-shots, "Use this kick", verify the song
// and the Supabase rows, then try a YouTube link. Cleans the user up.
// Usage: node tests/stems.e2e.mjs [baseUrl] [audioFile]
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const BASE = process.argv[2] ?? "http://localhost:3111";
const FILE = process.argv[3] ?? "/Users/bradyschwartz/Music/PioneerDJ/Demo Tracks/Demo Track 1.mp3";
const YT = process.env.YT_URL ?? "https://www.youtube.com/watch?v=jNQXAC9IVRw";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9336; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const SB = env.NEXT_PUBLIC_SUPABASE_URL, SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const stamp = Date.now().toString(36);
const EMAIL = `producer-stems-${stamp}@example.com`, PASSWORD = `Test-${stamp}-pass!`;
const shots = process.env.SHOTS ?? "/tmp";
try { (await import("node:child_process")).execSync("pkill -f 'producer-stems-profile' || true", { stdio: "ignore" }); } catch {}
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--disable-gpu", "--mute-audio", `--window-size=1440,1000`, `--user-data-dir=/tmp/producer-stems-profile-${stamp}`, "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill("SIGKILL"); } catch {} });
async function admin(path, init = {}) { const r = await fetch(`${SB}${path}`, { ...init, headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json", ...(init.headers ?? {}) } }); const t = await r.text(); return { status: r.status, body: t ? JSON.parse(t) : null }; }

async function main() {
  let wsUrl; for (let i = 0; i < 40 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(250); } }
  const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const lines = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === "Runtime.consoleAPICalled") lines.push(d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200)); else if (d.method === "Runtime.exceptionThrown") lines.push("EXCEPTION " + JSON.stringify(d.params.exceptionDetails).slice(0, 300)); };
  const send = (method, params = {}, sessionId) => { const i = ++id; return new Promise((res, rej) => { pending.set(i, (d) => d.error ? rej(new Error(`${method}: ${JSON.stringify(d.error)}`)) : res(d.result)); ws.send(JSON.stringify({ id: i, method, params, sessionId })); }); };
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = (m, p) => send(m, p, sessionId);
  await call("Page.enable"); await call("Runtime.enable"); await call("DOM.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const js = async (expr) => { const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
  const waitFor = async (expr, ms, label) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await js(expr); if (v) return v; await sleep(500); } throw new Error(`timeout waiting for ${label}`); };
  const shot = async (name) => { const { data } = await call("Page.captureScreenshot", { format: "png" }); writeFileSync(`${shots}/${name}.png`, Buffer.from(data, "base64")); console.log(`[stems] shot ${shots}/${name}.png`); };
  const setInput = async (selector, value) => js(`(() => { const i = document.querySelector(${JSON.stringify(selector)}); if (!i) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const clickText = async (text, tag = "button", starts = false) => js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(tag)})].find((x) => ${starts ? "x.textContent.trim().startsWith" : "x.textContent.trim() ==="}(${JSON.stringify(text)})); if (!b) return false; b.click(); return true; })()`);

  await call("Page.navigate", { url: `${BASE}/` });
  await waitFor(`document.body.innerText.includes('Create account')`, 30000, "gate");
  await setInput('input[type="email"]', EMAIL); await setInput('input[type="password"]', PASSWORD);
  assert.ok(await clickText("Create my account"), "submit");
  await waitFor(`!document.body.innerText.includes('Try it without an account')`, 30000, "gate closes");
  const users = await admin(`/auth/v1/admin/users?page=1&per_page=200`); const user = (users.body?.users ?? []).find((u) => u.email === EMAIL); assert.ok(user, "user in auth");
  console.log(`[stems] signed up ${EMAIL}`);
  await js(`document.querySelector('button[aria-label="Start the session"]')?.click(); true`);
  await waitFor(`!!document.querySelector('button[aria-label="Pause"]')`, 30000, "session");
  // Open the analyze sheet via the composer menu.
  await js(`document.querySelector('button[aria-label="Add a reference or sample"]')?.click(); true`);
  await waitFor(`document.body.innerText.includes('Analyze a record')`, 5000, "attach menu");
  assert.ok(await clickText("Analyze a record", "button", true), "menu item");
  await waitFor(`!!document.querySelector('[aria-label="Analyze a record"] input[type="file"]')`, 5000, "sheet");
  await shot("stems-1-sheet");
  const { root } = await call("DOM.getDocument", { depth: -1 });
  const { nodeId } = await call("DOM.querySelector", { nodeId: root.nodeId, selector: '[aria-label="Analyze a record"] input[type="file"]' });
  await call("DOM.setFileInputFiles", { files: [FILE], nodeId });
  console.log(`[stems] uploaded ${FILE.split("/").pop()}`);
  const t0 = Date.now(); let last = "";
  while (Date.now() - t0 < 10 * 60 * 1000) {
    await sleep(4000);
    const state = await js(`(() => { const t = document.body.innerText; const m = t.match(/(\\d+)%\\n?([^\\n]*)/); return JSON.stringify({ pct: m ? m[1] : null, stage: m ? m[2] : '', done: /drums sliced from this record/i.test(t), err: (t.match(/blocked the download[^\\n]*|analysis failed[^\\n]*|waking up[^\\n]*|not yours[^\\n]*/) || [''])[0] }); })()`);
    if (state !== last) { console.log(`[stems]   +${Math.round((Date.now() - t0) / 1000)}s ${state}`); last = state; }
    const s = JSON.parse(state); if (s.done) break; if (s.err) throw new Error(`analysis error: ${s.err}`);
  }
  assert.ok(await js(`/drums sliced from this record/i.test(document.body.innerText)`), "one-shots shown");
  await shot("stems-2-results");
  const facts = await js(`(document.body.innerText.match(/\\d+ BPM · [^\\n]+best 8 bars[^\\n]*/) || [''])[0]`);
  console.log(`[stems] facts: ${facts}`);
  assert.ok(/BPM/.test(facts), "facts line");
  const jobs = await admin(`/rest/v1/jobs?owner=eq.${user.id}&select=id,status,progress,result&order=created_at.desc`);
  const job = jobs.body[0]; assert.equal(job.status, "done", "job done in Supabase");
  console.log(`[stems] job ${job.id.slice(0, 8)}: ${(job.result.stems ?? []).length} stems, ${(job.result.oneshots ?? []).map((o) => `${o.role}${o.fundamentalHz ? "@" + Math.round(o.fundamentalHz) + "Hz" : ""}`).join(", ")}`);
  const clips = await admin(`/rest/v1/clips?owner=eq.${user.id}&select=id,name,source`);
  console.log(`[stems] clips rows: ${clips.body.length}`);
  assert.ok(clips.body.length >= 5, "stems + one-shots registered as clips");
  // Use this kick -> the song's kick track carries the clip.
  assert.ok(await clickText("Use this kick", "button", true), "use kick button");
  await waitFor(`(() => { try { const s = JSON.parse(localStorage.getItem('producer.song.v4')); const k = s.tracks.find((t) => t.role === 'kick'); return !!(k && k.clip && k.clip.clipId); } catch { return false; } })()`, 30000, "kick clip on the song");
  const kick = await js(`JSON.stringify(JSON.parse(localStorage.getItem('producer.song.v4')).tracks.find((t) => t.role === 'kick').clip)`);
  console.log(`[stems] kick clip: ${kick}`);
  await sleep(1500); await shot("stems-3-used");
  const proj = await admin(`/rest/v1/projects?owner=eq.${user.id}&select=id,title,version_count,song`);
  const cloudKick = proj.body[0]?.song?.tracks?.find((t) => t.role === "kick")?.clip;
  console.log(`[stems] cloud project has the kick clip: ${!!cloudKick} (versions ${proj.body[0]?.version_count})`);
  // The brain got the hidden breakdown ask and answered.
  const reply = await waitFor(`(() => { const t = document.body.innerText; const i = t.indexOf('Analyze another'); const msgs = [...document.querySelectorAll('div.rounded-bl-md')].map((d) => d.textContent); return msgs.length >= 2 ? msgs[msgs.length - 1] : ''; })()`, 90000, "brain breakdown reply");
  console.log(`[stems] producer said: ${reply.slice(0, 220)}`);
  // YouTube through the worker (from the signed-in page so the cookie rides along).
  const yt = await js(`fetch('/api/stems', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: ${JSON.stringify(YT)} }) }).then(r => r.json())`);
  console.log(`[stems] youtube job: ${JSON.stringify(yt)}`);
  if (yt.jobId) {
    const t1 = Date.now(); let st = null;
    while (Date.now() - t1 < 5 * 60 * 1000) { await sleep(5000); st = await js(`fetch('/api/stems?id=${yt.jobId}').then(r => r.json())`); if (st.status === "done" || st.status === "error") break; }
    console.log(`[stems] youtube result: status=${st?.status} progress=${st?.progress} error=${st?.error ?? ""} name=${st?.result?.name ?? ""} bpm=${st?.result?.facts?.bpm ?? ""}`);
  }
  // Cleanup: storage objects, then the user (cascades rows).
  const list = await admin(`/storage/v1/object/list/clips`, { method: "POST", body: JSON.stringify({ prefix: `${user.id}`, limit: 1000 }) });
  const paths = [];
  const walk = async (prefix) => { const r = await admin(`/storage/v1/object/list/clips`, { method: "POST", body: JSON.stringify({ prefix, limit: 1000 }) }); for (const o of r.body ?? []) { if (o.id) paths.push(`${prefix}/${o.name}`); else await walk(`${prefix}/${o.name}`); } };
  await walk(user.id);
  if (paths.length) { const del = await admin(`/storage/v1/object/clips`, { method: "DELETE", body: JSON.stringify({ prefixes: paths }) }); console.log(`[stems] cleanup storage: ${paths.length} objects, HTTP ${del.status}`); }
  const du = await admin(`/auth/v1/admin/users/${user.id}`, { method: "DELETE" }); console.log(`[stems] cleanup user: HTTP ${du.status}`);
  void list;
  console.log("[stems] ALL PASSED");
  process.exit(0);
}
main().catch((e) => { console.error("[stems] FAILED:", e.message); process.exit(1); });
