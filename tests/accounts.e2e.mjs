// Accounts end to end in real headless Chrome: the gate, sign-up with a throwaway
// user, a session, an edit, then the project and its versions in Supabase, the
// Projects sheet, rename, sign out. Usage: node tests/accounts.e2e.mjs [baseUrl]
// Needs .env.local (SUPABASE url, anon, service role). Cleans the user up at the end.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const BASE = process.argv[2] ?? "http://localhost:3111";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const SB = env.NEXT_PUBLIC_SUPABASE_URL, SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const stamp = Date.now().toString(36);
const EMAIL = `producer-e2e-${stamp}@example.com`, PASSWORD = `Test-${stamp}-pass!`;
const shots = process.env.SHOTS ?? "/tmp";

try { (await import("node:child_process")).execSync("pkill -f 'producer-acct-profile' || true", { stdio: "ignore" }); } catch {}
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--disable-gpu", "--mute-audio", `--window-size=1440,1000`, `--user-data-dir=/tmp/producer-acct-profile-${stamp}`, "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill("SIGKILL"); } catch {} });

async function adminFetch(path, init = {}) {
  const r = await fetch(`${SB}${path}`, { ...init, headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

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
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const js = async (expr) => { const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
  const waitFor = async (expr, ms, label) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await js(expr); if (v) return v; await sleep(300); } throw new Error(`timeout waiting for ${label}`); };
  const shot = async (name) => { const { data } = await call("Page.captureScreenshot", { format: "png" }); writeFileSync(`${shots}/${name}.png`, Buffer.from(data, "base64")); console.log(`[acct] shot ${shots}/${name}.png`); };
  const setInput = async (selector, value) => js(`(() => { const i = document.querySelector(${JSON.stringify(selector)}); if (!i) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const clickText = async (text, tag = "button") => js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(tag)})].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true; })()`);

  // 1. Gate
  console.log(`[acct] ${BASE}/ (no guest flag): expect the account gate`);
  await call("Page.navigate", { url: `${BASE}/` });
  await waitFor(`document.body.innerText.includes('Create account') && document.body.innerText.includes('Try it without an account')`, 30000, "gate");
  await shot("acct-1-gate");
  // 2. Sign up
  assert.ok(await setInput('input[type="email"]', EMAIL), "email input");
  assert.ok(await setInput('input[type="password"]', PASSWORD), "password input");
  assert.ok(await clickText("Create my account"), "submit");
  await waitFor(`!document.body.innerText.includes('Try it without an account')`, 30000, "gate to close after sign-up");
  console.log(`[acct] signed up as ${EMAIL}`);
  const users = await adminFetch(`/auth/v1/admin/users?page=1&per_page=200`);
  const user = (users.body?.users ?? []).find((u) => u.email === EMAIL);
  assert.ok(user, "user exists in auth");
  const profile = await adminFetch(`/rest/v1/profiles?id=eq.${user.id}&select=id,email`);
  assert.equal(profile.body?.[0]?.email, EMAIL, "profile row created by trigger");
  // 3. Session + edit
  await js(`document.querySelector('button[aria-label="Start the session"]')?.click(); true`);
  await waitFor(`!!document.querySelector('button[aria-label="Pause"]')`, 30000, "session start");
  await waitFor(`document.body.innerText.includes('We are live') || document.body.innerText.includes('We are back')`, 15000, "greeting");
  // The current song is adopted as a project on first sign-in.
  const adopted = await (async () => { for (let i = 0; i < 40; i++) { const r = await adminFetch(`/rest/v1/projects?owner=eq.${user.id}&select=id,title,version_count`); if (r.body?.length) return r.body; await sleep(500); } return []; })();
  assert.ok(adopted.length >= 1, "current song adopted as a project");
  console.log(`[acct] projects after sign-in: ${JSON.stringify(adopted)}`);
  const ask = "turn the hats down a bit";   // a local move: instant, no brain, still a save
  await setInput('input[aria-label="Message the producer"]', ask);
  await sleep(200);
  await js(`(() => { const i = document.querySelector('input[aria-label="Message the producer"]'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
  await sleep(3500);
  const afterEdit = await adminFetch(`/rest/v1/projects?owner=eq.${user.id}&select=id,title,version_count,song`);
  const proj = afterEdit.body[0];
  console.log(`[acct] after edit: version_count=${proj.version_count} hats=${proj.song.tracks.find((t) => t.role === 'hat')?.volume}`);
  assert.ok(proj.version_count >= 2, "the edit became a version");
  const versions = await adminFetch(`/rest/v1/versions?project_id=eq.${proj.id}&select=id,label,created_at&order=created_at.desc`);
  console.log(`[acct] versions: ${versions.body.map((v) => v.label).join(" | ")}`);
  assert.ok(versions.body.length >= 2, "versions recorded");
  // 4. Projects sheet
  await js(`document.querySelector('button[aria-label="Projects"]')?.click(); true`);
  await waitFor(`document.body.innerText.includes('New project')`, 10000, "projects sheet");
  await sleep(600);
  await shot("acct-2-projects");
  const cardTitle = await js(`document.querySelector('[aria-label="Projects"] li .text-sm.font-semibold')?.textContent ?? ''`);
  console.log(`[acct] first card: ${cardTitle}`);
  assert.equal(cardTitle, proj.title, "the project card shows the song");
  // rename via the card menu
  await js(`document.querySelector('button[aria-label^="Options for"]')?.click(); true`);
  await sleep(300);
  assert.ok(await clickText("Rename"), "rename item");
  await sleep(200);
  await setInput('input[aria-label="Project title"]', "RENAMED RECORD");
  await js(`(() => { const f = document.querySelector('input[aria-label="Project title"]')?.closest('form'); f?.requestSubmit(); return true; })()`);
  await waitFor(`document.body.innerText.includes('RENAMED RECORD')`, 10000, "renamed card");
  const renamed = await adminFetch(`/rest/v1/projects?id=eq.${proj.id}&select=title`);
  assert.equal(renamed.body[0].title, "RENAMED RECORD", "rename persisted");
  console.log("[acct] rename persisted in Supabase");
  await js(`document.querySelector('[aria-label="Projects"] button[aria-label="Close"]')?.click(); true`);
  // 5. Account sheet: key hints and sign out
  await js(`document.querySelector('button[aria-label="Your account"]')?.click(); true`);
  await waitFor(`document.body.innerText.includes('Your Anthropic API key')`, 10000, "account sheet");
  await shot("acct-3-account");
  const keys = await js(`fetch('/api/account/keys').then(r => r.json())`);
  console.log(`[acct] key hints: ${JSON.stringify(keys)}`);
  assert.equal(keys.signedIn, true, "keys route sees the session cookie");
  const bad = await js(`fetch('/api/account/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ anthropic: 'sk-ant-api03-not-a-real-key' }) }).then(r => r.json())`);
  console.log(`[acct] bad key rejected: ${JSON.stringify(bad)}`);
  assert.equal(bad.ok, false, "an invalid key is rejected by live validation");
  assert.ok(await clickText("Sign out"), "sign out");
  await waitFor(`document.body.innerText.includes('Try it without an account')`, 15000, "gate back after sign out");
  console.log("[acct] signed out, gate is back");
  // cleanup
  const del = await adminFetch(`/auth/v1/admin/users/${user.id}`, { method: "DELETE" });
  console.log(`[acct] cleanup user: HTTP ${del.status}`);
  const left = await adminFetch(`/rest/v1/projects?owner=eq.${user.id}&select=id`);
  assert.equal(left.body.length, 0, "cascade removed the projects");
  console.log("[acct] ALL PASSED");
  process.exit(0);
}
main().catch((e) => { console.error("[acct] FAILED:", e.message); process.exit(1); });
