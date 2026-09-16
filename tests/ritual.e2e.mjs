// The ritual, end to end, on the mock brain: landing -> "new project" by voice -> the greeting ->
// "Elvis Presley" starts research (the REAL store) while the producer keeps asking -> a task
// lands a groove through the Hands -> "play it" runs an announced audition -> a press cuts it
// off -> "play it" again runs to the end and asks "In or out?" -> "make the bass darker" lands
// ops with a report. Proves every seam the live brain drives, with no model key.
// Server: PRODUCER_MOCK=1 npx next start -p 3111.   Usage: node tests/ritual.e2e.mjs [baseUrl]
import { spawn, execSync } from "node:child_process";
import assert from "node:assert/strict";

const BASE = process.argv[2] ?? "http://localhost:3111";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9343; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { execSync("pkill -f 'producer-ritual-profile' || true", { stdio: "ignore" }); } catch {}
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--disable-gpu", "--mute-audio", "--window-size=1440,1000", `--user-data-dir=/tmp/producer-ritual-profile-${Date.now().toString(36)}`, "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill("SIGKILL"); } catch {} });

async function main() {
  let wsUrl; for (let i = 0; i < 40 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(250); } }
  const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === "Runtime.exceptionThrown") errors.push((d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text ?? "").slice(0, 200)); };
  const send = (method, params = {}, sessionId) => { const i = ++id; return new Promise((res, rej) => { pending.set(i, (d) => d.error ? rej(new Error(`${method}: ${JSON.stringify(d.error)}`)) : res(d.result)); ws.send(JSON.stringify({ id: i, method, params, sessionId })); }); };
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = (m, p) => send(m, p, sessionId);
  await call("Page.enable"); await call("Runtime.enable");
  const js = async (expr) => { const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
  const waitFor = async (expr, ms, label) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await js(expr); if (v) return v; await sleep(300); } throw new Error(`timeout waiting for ${label}`); };
  const type = async (text) => { await js(`(() => { const i = document.querySelector('input[aria-label="Message the producer"]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`); };
  const lastLine = (role) => js(`(() => { const els = document.querySelectorAll('[data-role="${role}"] p'); return els.length ? els[els.length - 1].textContent.trim() : ''; })()`);
  const cards = () => js(`JSON.stringify([...document.querySelectorAll('[data-role="work-card"]')].map((c) => ({ kind: c.dataset.kind, text: c.innerText.replace(/\\n/g, ' | ').slice(0, 120) })))`);
  const status = () => js(`document.querySelector('[data-role="status"]')?.innerText.replace(/\\n/g, ' ') ?? ''`);
  const URL_ = `${BASE}/?typed=1&landing=1&mock=1&guest=1&economy=1`;

  await call("Page.navigate", { url: URL_ }); await sleep(1500);
  await js(`localStorage.clear(); localStorage.setItem('producer.guest.v1','1'); true`);
  await call("Page.navigate", { url: URL_ });
  await waitFor(`!!document.querySelector('[data-role="new-project"]') && !!document.querySelector('input[aria-label="Message the producer"]')`, 30000, "landing with the harness input");
  console.log("[ritual] 1. landing");
  await type("new project");
  const greeting = await waitFor(`(() => { const t = [...document.querySelectorAll('[data-role="producer-line"] p')].map((e) => e.textContent).join(' | '); return /Who are we chasing/.test(t) ? t : ''; })()`, 30000, "the greeting on the stage");
  console.log(`[ritual] 2. stage by voice, greeting: ${greeting.slice(-80)}`);

  await type("Elvis Presley");
  await waitFor(`[...document.querySelectorAll('[data-role="work-card"]')].some((c) => c.dataset.kind === 'research')`, 15000, "the research card");
  const researchDone = await waitFor(`(() => { const c = [...document.querySelectorAll('[data-role="work-card"]')].find((c) => c.dataset.kind === 'research'); const t = c?.innerText ?? ''; return /found|nothing found|failed/.test(t) ? t.replace(/\\n/g, ' | ') : ''; })()`, 30000, "research to finish");
  console.log(`[ritual] 3. research: ${researchDone.slice(0, 110)}`);
  assert.ok(/artist found/.test(researchDone), `Elvis should be found in the store: ${researchDone}`);
  console.log(`[ritual]    voice said: ${await lastLine("producer-line")}`);

  await type("build me a groove");
  await waitFor(`(() => { try { return JSON.parse(localStorage.getItem('producer.song.v4')).tracks.length >= 3; } catch { return false; } })()`, 30000, "the hands to land a groove");
  const tracks = await js(`JSON.parse(localStorage.getItem('producer.song.v4')).tracks.map((t) => t.role).join(',')`);
  console.log(`[ritual] 4. groove landed: ${tracks}; report: ${(await lastLine("producer-line")).slice(0, 90)}`);

  await type("let me hear it");
  await waitFor(`[...document.querySelectorAll('[data-role="work-card"]')].some((c) => c.dataset.kind === 'audition' && !/stopped|played/.test(c.innerText))`, 15000, "the audition card");
  await sleep(2500);
  const playingStatus = await status();
  console.log(`[ritual] 5. audition running: ${playingStatus}`);
  assert.ok(/playing/.test(playingStatus), `the record should be playing during the audition: ${playingStatus}`);
  // A press on the button is the interrupt.
  await js(`(() => { const b = document.querySelector('[data-role="speak"]'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 })); return true; })()`);
  await sleep(600);
  await js(`(() => { const b = document.querySelector('[data-role="speak"]'); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0 })); return true; })()`);
  const cut = await waitFor(`(() => { const c = [...document.querySelectorAll('[data-role="work-card"]')].find((c) => c.dataset.kind === 'audition'); return c && /stopped/.test(c.innerText) ? c.innerText.replace(/\\n/g, ' | ') : ''; })()`, 8000, "the audition to be cut");
  const pausedStatus = await status();
  console.log(`[ritual] 6. cut by a press: ${cut.slice(0, 80)} | ${pausedStatus}`);
  assert.ok(/paused/.test(pausedStatus), `the record should pause when an audition is cut: ${pausedStatus}`);

  await type("let me hear it");
  const verdictAsk = await waitFor(`(() => { const els = [...document.querySelectorAll('[data-role="producer-line"] p')]; return els.some((e) => /In or out/.test(e.textContent)) ? 'In or out?' : ''; })()`, 40000, "the verdict question after a full audition");
  console.log(`[ritual] 7. audition ran to the end, then: ${verdictAsk} | ${await status()}`);

  await type("make the bass darker");
  await waitFor(`(() => { const els = [...document.querySelectorAll('[data-role="producer-line"] p')]; return els.some((e) => /Darker now/.test(e.textContent)); })()`, 30000, "the hands' report");
  const bass = await js(`(() => { const s = JSON.parse(localStorage.getItem('producer.song.v4')); const b = s.tracks.find((t) => t.role === 'bass'); return b ? (b.transpose ?? 0) + ' / ' + (b.synth?.cutoff ?? 'default') : 'no bass'; })()`);
  console.log(`[ritual] 8. darker bass: transpose / cutoff = ${bass}; cards: ${(await cards()).slice(0, 200)}`);
  assert.equal(bass, "-2 / 240", "the mock hands' ops should have applied");
  // 9. Grab: the Voice hands a cut to the studio, no Hands; with nothing pulled in yet the producer says so.
  await type("grab the synth at 1:32");
  const grabLine = await waitFor(`(() => { const els = [...document.querySelectorAll('[data-role="producer-line"] p')]; const l = els.map((e) => e.textContent).find((t) => /Grabbed the synth|no heard record to grab/.test(t)); return l ?? ''; })()`, 20000, "the grab answer");
  console.log(`[ritual] 9. grab: ${grabLine.slice(0, 90)}`);
  assert.ok(/no heard record to grab|Grabbed the synth/.test(grabLine), "the grab control reaches the studio and is answered");
  console.log(`[ritual] cost: ${await js(`document.querySelector('[data-role="cost"]')?.innerText ?? ''`)}; exceptions: ${errors.length ? errors.join(" || ") : "none"}`);
  assert.equal(errors.length, 0, "no uncaught exceptions during the ritual");
  console.log("[ritual] ALL PASSED");
  process.exit(0);
}
main().catch((e) => { console.error("[ritual] FAILED:", e.message); process.exit(1); });
