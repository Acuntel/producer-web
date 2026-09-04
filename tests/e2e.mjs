// End-to-end in real Chrome (headless, CDP over WebSocket, zero deps).
// 1) /selftest: the engine renders both seeds offline and the ears hear them.
// 2) /: tap the orb, type a request, the brain answers with ops, the song changes.
// Usage: node tests/e2e.mjs [baseUrl]   (default http://localhost:3111; start the app first)
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const BASE = process.argv[2] ?? "http://localhost:3111";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Kill stale headless Chromes from earlier runs so they cannot starve this one.
try { (await import("node:child_process")).execSync("pkill -f 'producer-.*-profile' || true", { stdio: "ignore" }); } catch {}
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", "--no-first-run", "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required",
  "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--disable-gpu", "--mute-audio", `--user-data-dir=/tmp/producer-e2e-profile`, "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill("SIGKILL"); } catch {} });

async function cdp() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); const j = await r.json(); return j.webSocketDebuggerUrl; } catch { await sleep(250); }
  }
  throw new Error("chrome did not start");
}

class Session {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []; this.onEvent = null; ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && this.pending.has(d.id)) { this.pending.get(d.id)(d); this.pending.delete(d.id); } else if (d.method) { this.events.push(d); this.onEvent?.(d); } }; }
  send(method, params = {}, sessionId) { const id = ++this.id; return new Promise((res, rej) => { this.pending.set(id, (d) => d.error ? rej(new Error(`${method}: ${JSON.stringify(d.error)}`)) : res(d.result)); this.ws.send(JSON.stringify({ id, method, params, sessionId })); }); }
}

async function main() {
  const wsUrl = await cdp();
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));
  const s = new Session(ws);
  const { targetId } = await s.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await s.send("Target.attachToTarget", { targetId, flatten: true });
  const call = (m, p) => s.send(m, p, sessionId);
  await call("Page.enable"); await call("Runtime.enable");
  const consoleLines = []; globalThis.__lines = consoleLines;
  s.onEvent = (d) => { if (d.method === "Runtime.consoleAPICalled") consoleLines.push(`${d.params.type}: ${d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300)}`); if (d.method === "Runtime.exceptionThrown") consoleLines.push(`EXCEPTION: ${JSON.stringify(d.params.exceptionDetails).slice(0, 400)}`); };
  const evalJs = async (expr) => { const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const waitFor = async (expr, timeoutMs, label) => { const t0 = Date.now(); while (Date.now() - t0 < timeoutMs) { const v = await evalJs(expr); if (v) return v; await sleep(400); } throw new Error(`timeout waiting for ${label}`); };

  // ---- 1. selftest: offline render + ears ----
  if (process.env.E2E_SKIP_SELFTEST) console.log("[e2e] skipping selftest"); else {
  console.log(`[e2e] ${BASE}/selftest`);
  await call("Page.navigate", { url: `${BASE}/selftest` });
  const raw = await waitFor(`(() => { const t = document.querySelector('#result')?.textContent ?? ''; return t.startsWith('{') ? t : ''; })()`, 300000, "selftest result");
  const res = JSON.parse(raw);
  assert.ok(res.ok, `selftest failed: ${res.error}`);
  console.log(`[e2e] tiny render ${res.results.tinyMs}ms, hear ${res.results.hearTinyMs}ms: ${JSON.stringify(res.results.tiny)}`);
  for (const title of ["GLOW", "G-TOWN HEAT"]) {
    const r = res.results[title];
    console.log(`[e2e] ${title}: ${r.ms}ms · ${r.tempo.bpm.toFixed(1)} BPM (conf ${r.tempo.confidence.toFixed(2)}, alt ${r.tempo.alt.toFixed(1)}) · ${r.key.name} (${r.key.confidence.toFixed(2)}, alt ${r.key.alt}) · ${r.loudness.integrated.toFixed(1)} LUFS · pump ${r.groove.pump.toFixed(2)} swing ${r.groove.swing.toFixed(2)} · drop ${r.dropAt}s · chords ${r.chords.join(" ")}`);
    console.log(`[e2e]   read: ${r.read}`);
    console.log(`[e2e]   sections: ${JSON.stringify(r.sections)}`);
  }
  const glow = res.results.GLOW, heat = res.results["G-TOWN HEAT"];
  const near = (a, b, tol) => Math.abs(a - b) <= tol || Math.abs(a * 2 - b) <= tol || Math.abs(a / 2 - b) <= tol;
  assert.ok(near(glow.tempo.bpm, 126, 2.5), `GLOW tempo ${glow.tempo.bpm}`);
  assert.ok(near(heat.tempo.bpm, 142, 2.5), `HEAT tempo ${heat.tempo.bpm}`);
  assert.equal(glow.key.name, "D minor"); console.log(`[e2e] heard key (audio estimate) GLOW=${glow.key.alt} HEAT=${heat.key.alt}`);
  assert.equal(heat.key.name, "F minor");
  assert.ok(glow.loudness.integrated > -16 && glow.loudness.integrated < -5, `GLOW LUFS ${glow.loudness.integrated}`);
  assert.ok(glow.loudness.peak <= 0.1, `GLOW peak ${glow.loudness.peak} dBFS must not clip`);
  assert.ok(res.results.tiny.kickDensity >= 3, `kick-only render should count ~4 kicks per bar, got ${res.results.tiny.kickDensity}`);
  assert.ok(glow.dropAt !== null, "GLOW has a drop");
  assert.ok(glow.groove.pump > 0.05, `GLOW pump ${glow.groove.pump}`);
  const e = res.results.editedSoloBass;
  assert.equal(e.kickDensity, 0, `soloed bass should report no kicks, kickDensity ${e.kickDensity}`);
  assert.ok(glow.sections.some((s) => s[0] === "break" && s[3] === false), "breakdown has no kick");
  assert.ok(glow.chords.length >= 2, `GLOW chords ${glow.chords}`);
  console.log(`[e2e] selftest OK in ${res.totalMs}ms (edited/solo path OK, kickDensity ${e.kickDensity})`);
  }

  // ---- 2. the real studio: orb, then a typed request through the brain ----
  console.log(`[e2e] ${BASE}/`);
  await call("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const f = window.fetch; window.__chat = []; window.fetch = async (...a) => { const r = await f(...a); try { if (String(a[0]).includes('/api/chat')) { const c = r.clone(); c.json().then((j) => window.__chat.push(j)).catch(() => {}); } } catch {} return r; }; })();` });
  await call("Page.navigate", { url: `${BASE}/?e2e=1` });
  await waitFor(`!!document.querySelector('button[aria-label="Start the session"]')`, 30000, "orb");
  await evalJs(`localStorage.clear(); true`);
  await call("Page.navigate", { url: `${BASE}/?e2e=1` });
  await waitFor(`!!document.querySelector('button[aria-label="Start the session"]')`, 30000, "orb after reset");
  // Tap until the session actually starts: on a CDN load the first tap can land before hydration.
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45000) {
    await evalJs(`document.querySelector('button[aria-label="Start the session"]')?.click(); true`);
    await sleep(2500);
    if (await evalJs(`!!document.querySelector('button[aria-label="Pause"]') || !!document.querySelector('button[aria-label="Play"]')`)) break;
  }
  await waitFor(`!!document.querySelector('button[aria-label="Pause"]') || !!document.querySelector('button[aria-label="Play"]')`, 5000, "session start");
  await waitFor(`document.body.innerText.includes('We are live') || document.body.innerText.includes('We are back')`, 15000, "greeting");
  console.log("[e2e] session started, greeting shown");
  const before = await evalJs(`localStorage.getItem('producer.song.v4')`);
  const ask = "make the bass darker and take me to the drop";
  await evalJs(`(() => { const i = document.querySelector('input[aria-label="Message the producer"]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(i, ${JSON.stringify(ask)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(400);
  await evalJs(`(() => { const i = document.querySelector('input[aria-label="Message the producer"]'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
  await sleep(1500);
  console.log(`[e2e] after typing: input="${await evalJs(`document.querySelector('input[aria-label="Message the producer"]')?.value ?? '(no input)'`)}" userBubble=${await evalJs(`document.body.innerText.includes(${JSON.stringify(ask)})`)} chatCalls=${await evalJs(`(window.__brain ?? []).length`)}`);
  const replyText = await waitFor(`(() => { const t = document.body.innerText; const i = t.indexOf(${JSON.stringify(ask)}); if (i < 0) return ''; const after = t.slice(i + ${ask.length}); const m = after.match(/\\n([^\\n]{8,})/); return m && !/^(talk, or type|type here)/.test(m[1]) ? m[1] : ''; })()`, 90000, "brain reply");
  console.log(`[e2e] brain said: ${replyText.slice(0, 200)}`);
  await sleep(1500);
  const after = await evalJs(`localStorage.getItem('producer.song.v4')`);
  const b = JSON.parse(before), a = JSON.parse(after);
  const bassBefore = JSON.stringify(b.tracks.find((t) => t.role === "bass")), bassAfter = JSON.stringify(a.tracks.find((t) => t.role === "bass"));
  const changed = before !== after;
  const chat = await evalJs(`JSON.stringify((window.__brain ?? []).map((c) => ({ say: c.say, ops: c.ops, song: c.song ? 'FULL' : null, action: c.action, detail: c.detail })))`);
  console.log(`[e2e] song changed: ${changed}; bass changed: ${bassBefore !== bassAfter}`);
  console.log(`[e2e] raw brain replies: ${chat.slice(0, 900)}`);
  assert.ok(!/hiccuped|not connected|setup step|out of credits/i.test(replyText), `brain error: ${replyText}`);
  assert.ok(changed, "the brain should have changed the song");
  const facts = await waitFor(`(() => { const t = document.body.innerText; return /LUFS/.test(t) ? t.match(/(\\d+) BPM[^\\n]*LUFS[^\\n]*/)?.[0] ?? '' : ''; })()`, 60000, "ears panel");
  console.log(`[e2e] ears panel: ${facts}`);
  {
    const note = await waitFor(`(() => { const t = document.body.innerText; const i = t.indexOf('Do it'); return i >= 0 ? t.slice(Math.max(0, i - 420), i + 40).split(String.fromCharCode(10)).filter(Boolean).slice(-4).join(' | ') : ''; })()`, 150000, "critic note");
    console.log(`[e2e] critic: ${note.slice(0, 420)}`);
  }
  if (process.env.E2E_REFERENCE) {
    const file = process.env.E2E_REFERENCE;
    console.log(`[e2e] reference upload: ${file.split("/").pop()}`);
    await call("DOM.enable");
    const { root } = await call("DOM.getDocument", { depth: -1 });
    const { nodeId } = await call("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type="file"]' });
    await call("DOM.setFileInputFiles", { files: [file], nodeId });
    let refLine = "";
    try { refLine = await waitFor(`(document.body.innerText.split(String.fromCharCode(10)).find((l) => l.startsWith('Reference:')) || '')`, 150000, "reference heard"); }
    catch (e) { console.log("[e2e] console tail:\n" + consoleLines.slice(-10).join("\n")); throw e; }
    console.log(`[e2e] ${refLine}`);
    const refReply = await waitFor(`(() => { const b = window.__brain ?? []; return b.length >= 2 ? b[b.length - 1].say : ''; })()`, 120000, "brain reply to the reference");
    console.log(`[e2e] brain on the reference: ${refReply.slice(0, 220)}`);
    const delta = await waitFor(`(document.body.innerText.split(String.fromCharCode(10)).find((l) => /reference|percent|louder|quieter|keys/i.test(l) && /(percent|dB|louder|quieter|match)/.test(l)) || '')`, 90000, "delta line");
    console.log(`[e2e] deltas: ${delta.slice(0, 260)}`);
    assert.ok(/Reference:/.test(refLine), "reference should be listed in the ears panel");
    if (process.env.E2E_EMULATE) {
      await evalJs(`(() => { const i = document.querySelector('input[aria-label="Message the producer"]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(i, "make our song like this reference"); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      await sleep(400);
      await evalJs(`(() => { const i = document.querySelector('input[aria-label="Message the producer"]'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
      await waitFor(`document.body.innerText.includes('🛠')`, 90000, "emulate rollout to start");
      const t1 = Date.now(); let last = "";
      while (Date.now() - t1 < 600000) { await sleep(5000); const line = await evalJs(`(document.body.innerText.split(String.fromCharCode(10)).find((l) => l.includes('🛠')) || '')`); if (!line) break; if (line !== last) { console.log(`[e2e]   ${line}`); last = line; } }
      console.log(`[e2e] steps: ${await evalJs(`JSON.stringify((window.__steps ?? []).map((s) => [s.step, s.attempt, Math.round(s.ms / 1000) + 's', 'ops ' + s.applied, s.check ?? 'ok']))`)}`);
      const doc = JSON.parse(await evalJs(`localStorage.getItem('producer.song.v4')`));
      const after = await waitFor(`(document.body.innerText.split(String.fromCharCode(10)).find((l) => /(percent|dB|louder|quieter|match)/.test(l) && /reference|keys|low end|louder/i.test(l)) || '')`, 60000, "delta after emulate");
      console.log(`[e2e] emulate result: "${doc.title}" ${doc.bpm} BPM ${doc.key} ${doc.lane} · ${doc.tracks.length} tracks · ${doc.sections.length} sections`);
      console.log(`[e2e] deltas after: ${after.slice(0, 260)}`);
      console.log(`[e2e] scorecard: ${await evalJs(`(document.body.innerText.split(String.fromCharCode(10)).find((l) => / moves/.test(l)) || '')`)}`);
    }
  }
  if (process.env.E2E_ROLLOUT) {
    console.log("[e2e] rollout: new song via the process engine");
    const titleBefore = await evalJs(`JSON.parse(localStorage.getItem('producer.song.v4')).title`);
    await evalJs(`(() => { const i = document.querySelector('input[aria-label="Message the producer"]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(i, "new song, KETTAMA style, surprise me"); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await sleep(400);
    await evalJs(`(() => { const i = document.querySelector('input[aria-label="Message the producer"]'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
    await waitFor(`document.body.innerText.includes('🛠')`, 60000, "rollout to start");
    const t1 = Date.now();
    while (Date.now() - t1 < 720000) { await sleep(5000); const line = await evalJs(`(document.body.innerText.split(String.fromCharCode(10)).find((l) => l.includes('🛠')) || '')`); if (line) console.log(`[e2e]   ${line}`); else break; }
    const doc = JSON.parse(await evalJs(`localStorage.getItem('producer.song.v4')`));
    console.log(`[e2e] steps: ${await evalJs(`JSON.stringify((window.__steps ?? []).map((s) => [s.step, s.attempt, Math.round(s.ms / 1000) + 's', s.model ? s.model.replace('claude-', '') : '?', 'ops ' + s.applied + (s.skipped ? '/skip ' + s.skipped : ''), s.check ?? 'ok', s.tracks + ' tracks', (s.say || '').slice(0, 70)]))`)}`);
    console.log(`[e2e] rollout result: "${doc.title}" ${doc.bpm} BPM ${doc.key} ${doc.lane} · ${doc.tracks.length} tracks · ${doc.sections.length} sections · autos ${doc.sections.reduce((a, s) => a + (s.automation?.length ?? 0), 0)}`);
    assert.ok(doc.title !== titleBefore || doc.tracks.length >= 6, "rollout should have produced a new song");
    assert.ok(doc.tracks.length >= 6 && doc.sections.length >= 5, "new song needs tracks and sections");
    const brain = await evalJs(`JSON.stringify((window.__brain ?? []).map((c) => ({ say: c.say, action: c.action })))`);
    console.log(`[e2e] replies: ${brain.slice(0, 400)}`);
  }
  const health = await (await fetch(`${BASE}/api/health`)).json();
  console.log(`[e2e] health: ${JSON.stringify(health)}`);
  console.log("[e2e] ALL PASSED");
  process.exit(0);
}

main().catch((e) => { console.error("[e2e] FAILED:", e.message); console.error("[e2e] console tail:\n" + (globalThis.__lines ?? []).slice(-12).join("\n")); process.exit(1); });
