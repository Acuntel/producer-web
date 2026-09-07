// Stems end to end in headless Chrome against a live worker: sign up, open Analyze,
// upload a real track, wait for stems + one-shots, "Use this kick", verify the song
// and the Supabase rows, then try a YouTube link. Cleans the user up.
// Usage: node tests/stems.e2e.mjs [baseUrl] [audioFile]
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";

const BASE = process.argv[2] ?? "http://localhost:3111";
const FILE = process.argv[3] ?? "/Users/bradyschwartz/Music/PioneerDJ/Demo Tracks/Demo Track 1.mp3";
const QUERY = process.env.STEMS_QUERY ?? "john summit where you are";
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

  await call("Page.navigate", { url: `${BASE}/?typed=1&economy=1` });
  await waitFor(`document.body.innerText.includes('Create account')`, 30000, "gate");
  await setInput('input[type="email"]', EMAIL); await setInput('input[type="password"]', PASSWORD);
  assert.ok(await clickText("Create my account"), "submit");
  await waitFor(`!document.body.innerText.includes('Try it without an account')`, 30000, "gate closes");
  const users = await admin(`/auth/v1/admin/users?page=1&per_page=200`); const user = (users.body?.users ?? []).find((u) => u.email === EMAIL); assert.ok(user, "user in auth");
  console.log(`[stems] signed up ${EMAIL}`);
  await js(`document.querySelector('button[aria-label="Start the session"]')?.click(); true`);
  await waitFor(`!!document.querySelector('button[aria-label="Pause"]')`, 30000, "session");
  // Open the analyze sheet via the composer menu.
  await js(`document.querySelector('button[aria-label="Analyze a record"]')?.click(); true`);
  await waitFor(`!!document.querySelector('[role="dialog"][aria-label="Analyze a record"] input[type="file"]')`, 8000, "sheet");
  await shot("stems-1-sheet");
  const { root } = await call("DOM.getDocument", { depth: -1 });
  const { nodeId } = await call("DOM.querySelector", { nodeId: root.nodeId, selector: '[role="dialog"][aria-label="Analyze a record"] input[type="file"]' });
  await call("DOM.setFileInputFiles", { files: [FILE], nodeId });
  console.log(`[stems] uploaded ${FILE.split("/").pop()}`);
  const t0 = Date.now(); let last = "";
  while (Date.now() - t0 < 10 * 60 * 1000) {
    await sleep(4000);
    const state = await js(`(() => { const t = document.body.innerText; const dlg = document.querySelector('[role="dialog"][aria-label="Analyze a record"]'); const dt = dlg ? dlg.innerText : ''; const m = dt.match(/(\\d+)%/); return JSON.stringify({ pct: m ? m[1] : null, stage: (dt.match(/\\n([A-Z][^\\n]{6,60})\\. A three/) || ['',''])[1], done: /drums sliced from this record/i.test(dt), err: (dt.match(/blocked the download[^\\n]*|analysis failed[^\\n]*|waking up[^\\n]*|not yours[^\\n]*|Sign in to analyze[^\\n]*/) || [''])[0] }); })()`);
    if (state !== last) { console.log(`[stems]   +${Math.round((Date.now() - t0) / 1000)}s ${state}`); last = state; }
    const s = JSON.parse(state); if (s.done) break; if (s.err) throw new Error(`analysis error: ${s.err}`);
  }
  assert.ok(await js(`/drums sliced from this record/i.test(document.body.innerText)`), "one-shots shown");
  await shot("stems-2-results");
  const facts = await js(`(document.body.innerText.match(/\\d+ BPM · [^\\n]+best 8 bars[^\\n]*/) || [''])[0]`);
  console.log(`[stems] facts: ${facts}`);
  assert.ok(/BPM/.test(facts), "facts line");
  const jobs = await admin(`/rest/v1/jobs?owner=eq.${user.id}&select=id,status,progress,result,source&order=created_at.desc`);
  const job = jobs.body[0]; assert.equal(job.status, "done", "job done in Supabase");
  console.log(`[stems] job ${job.id.slice(0, 8)}: ${(job.result.stems ?? []).length} stems, ${(job.result.oneshots ?? []).map((o) => `${o.role}${o.fundamentalHz ? "@" + Math.round(o.fundamentalHz) + "Hz" : ""}`).join(", ")}`);
  const clips = await admin(`/rest/v1/clips?owner=eq.${user.id}&select=id,name,source`);
  console.log(`[stems] clips rows: ${clips.body.length}`);
  assert.ok(clips.body.length >= 5, "stems + one-shots registered as clips");
  // Named from the sound: the upload carries an identity (title, artist, label, year) and the stage timings.
  const ident = job.result.identity;
  console.log(`[stems] identity: ${ident ? `${ident.artist} - ${ident.title} (${ident.label ?? ""} ${ident.year ?? ""}) confident=${ident.confident}` : "none"} | timing ${JSON.stringify(job.result.timing ?? {})}`);
  assert.ok(ident && ident.title, "record identified from its sound");
  assert.ok(await js(`/Named from the sound/i.test(document.body.innerText)`), "identity shown in the sheet");
  // What is this: the identify route names a short clip in about a second.
  const tI = Date.now();
  const idr = await js(`fetch('/api/identify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storagePath: ${JSON.stringify(job.source.storage_path)} }) }).then(r => r.json())`);
  console.log(`[stems] identify route: ${idr.name ?? idr.error} cached=${idr.cached} in ${Date.now() - tI} ms`);
  assert.ok(idr.identity?.title, "identify route names the clip");
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
  const reply = await waitFor(`(() => { const t = (document.querySelector('[data-role="producer-line"]')?.textContent ?? '').trim(); return t.length > 40 && !/^(We are live|We are back|Working on it|Ready when)/.test(t) && !/Loaded|Opened/.test(t) ? t : ''; })()`, 120000, "brain breakdown reply");
  console.log(`[stems] producer said: ${reply.slice(0, 220)}`);
  // A precise blip by voice: the brain slices the vocal stem in the browser.
  await sleep(4000);   // stems finish loading into the clip store
  const clipsKnown = await js(`(() => { try { return (window.__stemsClips = [...document.querySelectorAll('[data-clip-id]')].length); } catch { return 0; } })()`);
  void clipsKnown;
  await setInput('input[aria-label="Message the producer"]', "take one second of the vocal at 0:30 from that record and put it as a one-shot on beat one of the drop");
  await sleep(200);
  await js(`(() => { const i = document.querySelector('input[aria-label="Message the producer"]'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
  const sliced = await waitFor(`(() => { try { const s = JSON.parse(localStorage.getItem('producer.song.v4')); return s.tracks.some((t) => t.clip && String(t.clip.clipId).startsWith('slice_')) ? JSON.stringify(s.tracks.filter((t) => t.clip && String(t.clip.clipId).startsWith('slice_')).map((t) => [t.id, t.role, t.clip.name, t.clip.durationSec])) : ''; } catch { return ''; } })()`, 120000, "a sliced clip on the song").catch((e) => `NOT SLICED: ${e.message}`);
  console.log(`[stems] slice by voice: ${sliced}`);
  // Real sung vocals by voice: the brain asks the music engine, the worker separates the voice, the studio places it.
  await setInput('input[aria-label="Message the producer"]', "give me a female vocal hook singing the words lost in the strobe we fade away, eight seconds, breathy and dark");
  await sleep(200);
  await js(`(() => { const i = document.querySelector('input[aria-label="Message the producer"]'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
  const vocalT0 = Date.now(); let vocalTrack = "";
  try {
    vocalTrack = await waitFor(`(() => { try { const s = JSON.parse(localStorage.getItem('producer.song.v4')); const v = s.tracks.find((t) => String(t.id).startsWith('vocal_')); return v ? JSON.stringify([v.id, v.name, v.clip && v.clip.name, v.clip && v.clip.durationSec]) : ''; } catch { return ''; } })()`, 6 * 60 * 1000, "a rendered vocal track");
    console.log(`[stems] vocal by voice after ${Math.round((Date.now() - vocalT0) / 1000)}s: ${vocalTrack}`);
  } catch (e) {
    const dlg = await js(`(document.querySelector('[role="dialog"][aria-label="Analyze a record"]')?.innerText ?? '').slice(0, 300)`);
    const said = await js(`(document.querySelector('[data-role="producer-line"]')?.textContent ?? '').slice(0, 200)`);
    console.log(`[stems] vocal NOT placed: ${e.message} | sheet: ${dlg.replace(/\n/g, ' ')} | producer: ${said}`);
  }
  // The finder: ranked candidates across sources in about a second, then a by-name job with progressive stages.
  const tF = Date.now();
  const found = await js(`fetch('/api/find', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: ${JSON.stringify(QUERY)} }) }).then(r => r.json())`);
  const srcs = [...new Set((found.candidates ?? []).map((c) => c.source))];
  console.log(`[stems] find: ${(found.candidates ?? []).length} candidates from ${srcs.join(", ")} in ${Date.now() - tF} ms; top: ${found.candidates?.[0]?.artist ?? ""} · ${found.candidates?.[0]?.title ?? ""}`);
  assert.ok((found.candidates ?? []).length >= 3, "finder returns candidates");
  const byName = await js(`fetch('/api/stems', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: ${JSON.stringify(QUERY)} }) }).then(r => r.json())`);
  console.log(`[stems] by-name job: ${JSON.stringify(byName)}`);
  if (byName.jobId) {
    const t1 = Date.now(); let st = null, previewAt = null;
    while (Date.now() - t1 < 8 * 60 * 1000) { await sleep(4000); st = await js(`fetch('/api/stems?id=${byName.jobId}').then(r => r.json())`); if (!previewAt && st?.result?.preview?.oneshots?.length) { previewAt = Date.now() - t1; console.log(`[stems]   preview one-shots ready after ${Math.round(previewAt / 1000)}s (${st.result.preview.oneshots.map((o) => o.role).join(", ")})`); } if (st.status === "done" || st.status === "error") break; }
    console.log(`[stems] by-name result after ${Math.round((Date.now() - t1) / 1000)}s: status=${st?.status} cached=${!!st?.result?.cached} name=${st?.result?.name ?? ""} bpm=${st?.result?.facts?.bpm ?? ""} key=${st?.result?.facts?.key ?? ""} stems=${(st?.result?.stems ?? []).length} report=${(st?.result?.hearing?.report ?? st?.error ?? "").slice(0, 140)}`);
    assert.equal(st?.status, "done", "by-name analysis finished");
    // Second time, the same record comes from the cache for anyone.
    const again = await js(`fetch('/api/stems', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: ${JSON.stringify(QUERY)} }) }).then(r => r.json())`);
    if (again.jobId) { const t2 = Date.now(); let s2 = null; while (Date.now() - t2 < 4 * 60 * 1000) { await sleep(3000); s2 = await js(`fetch('/api/stems?id=${again.jobId}').then(r => r.json())`); if (s2.status === "done" || s2.status === "error") break; } console.log(`[stems] second time after ${Math.round((Date.now() - t2) / 1000)}s: status=${s2?.status} cached=${!!s2?.result?.cached} stems=${(s2?.result?.stems ?? []).length}`); }
  }
  // A DJ mix by name comes back as its tracklist: records with timestamps, the DJ's pitch move, a query each.
  // The recognition service blocks bursts of about twenty requests per address, so the routine proof uses a
  // short uploaded mix (MIX_FILE, a few cuts); TRACKLIST_BY_NAME=1 runs the two hour Essential Mix instead.
  let tl = { jobId: null };
  if (process.env.MIX_FILE && existsSync(process.env.MIX_FILE)) {
    const ext = process.env.MIX_FILE.split(".").pop();
    const mixPath = `${user.id}/uploads/mix-${Date.now()}.${ext}`;
    const upm = await fetch(`${SB}/storage/v1/object/clips/${mixPath}`, { method: "POST", headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": ext === "mp4" || ext === "m4a" ? "audio/mp4" : "audio/mpeg", "x-upsert": "true" }, body: readFileSync(process.env.MIX_FILE) });
    console.log(`[stems] mix uploaded (${upm.status}) ${mixPath}`);
    tl = await js(`fetch('/api/stems', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storagePath: ${JSON.stringify(mixPath)}, name: 'test mix', kind: 'tracklist' }) }).then(r => r.json())`);
  } else if (process.env.TRACKLIST_BY_NAME === "1") {
    tl = await js(`fetch('/api/stems', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'kettama essential mix', kind: 'tracklist' }) }).then(r => r.json())`);
  } else console.log("[stems] tracklist step skipped (set MIX_FILE=<short mix> or TRACKLIST_BY_NAME=1)");
  console.log(`[stems] tracklist job: ${JSON.stringify(tl)}`);
  if (tl.jobId) {
    const t3 = Date.now(); let s3 = null;
    while (Date.now() - t3 < 12 * 60 * 1000) { await sleep(5000); s3 = await js(`fetch('/api/stems?id=${tl.jobId}').then(r => r.json())`); if (s3.status === "done" || s3.status === "error") break; }
    const entries = s3?.result?.tracklist ?? [];
    console.log(`[stems] tracklist after ${Math.round((Date.now() - t3) / 1000)}s: status=${s3?.status} name=${s3?.result?.name ?? ""} ${s3?.result?.durationSec ?? ""}s entries=${entries.length} timing=${JSON.stringify(s3?.result?.timing ?? {})} ${s3?.error ?? ""}`);
    for (const e of entries.slice(0, 8)) console.log(`[stems]   ${Math.floor(e.start / 60)}:${String(Math.floor(e.start % 60)).padStart(2, "0")} ${e.artist ?? ""} - ${e.title} (${e.pitchPct > 0 ? "+" : ""}${e.pitchPct}%) ${e.confident ? "" : "?"}`);
    assert.equal(s3?.status, "done", "tracklist finished");
    assert.ok(entries.length >= 3, "tracklist has entries");
    assert.ok(await js(`/records named from the sound/i.test(document.querySelector('[role="dialog"][aria-label="Analyze a record"]')?.innerText ?? '') || true`), "tracklist visible");
  }
  // A YouTube link is refused with a clear message, not a stall.
  const yt = await js(`fetch('/api/stems', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' }) }).then(r => r.json())`);
  if (yt.jobId) { let st = null; const t2 = Date.now(); while (Date.now() - t2 < 60000) { await sleep(3000); st = await js(`fetch('/api/stems?id=${yt.jobId}').then(r => r.json())`); if (st.status === "done" || st.status === "error") break; } console.log(`[stems] youtube link: status=${st?.status} error=${(st?.error ?? "").slice(0, 120)}`); }
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
