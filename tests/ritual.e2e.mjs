// The ritual, end to end, on the mock brain: landing -> "new project" by voice -> the greeting ->
// "Elvis Presley" plays a whole draft compiled from the artist's records in the REAL store (the
// first draft, docs/MASTERPROMPT_PRODUCER.md section 3) -> a task reaches the Hands and lands its
// ops -> "play it" runs an announced audition -> a press cuts it off -> "play it" again runs to the
// end and asks "In or out?" -> "make the bass darker" lands ops with a report. Proves every seam the
// live brain drives, with no model key.
// Session 2 is the order of work we watched a producer follow (docs/MASTERPROMPT_SMOOTH.md section 1), by voice:
// name a record and get its tempo from the store, chop a phrase off its vocal, loop it alone, bring the beat in at
// that tempo, hear the verdict prompt inside thirty seconds, "next one" plays a different candidate, "pull it down"
// leaves the seed alone, and the next word brings everything back. It asserts on the transport, the rig's faders and
// the record, not on the chat. The worker is not called: the harness makes the record's vocal stem itself and hands
// it in as if the stems job had separated it (the source tempo is the real store's).
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
  const URL_ = `${BASE}/?e2e=1&typed=1&landing=1&mock=1&guest=1&economy=1`;

  await call("Page.navigate", { url: URL_ }); await sleep(1500);
  await js(`localStorage.clear(); localStorage.setItem('producer.guest.v1','1'); true`);
  await call("Page.navigate", { url: URL_ });
  await waitFor(`!!document.querySelector('[data-role="new-project"]') && !!document.querySelector('input[aria-label="Message the producer"]')`, 30000, "landing with the harness input");
  console.log("[ritual] 1. landing");
  await type("new project");
  const greeting = await waitFor(`(() => { const t = [...document.querySelectorAll('[data-role="producer-line"] p')].map((e) => e.textContent).join(' | '); return /Who are we chasing/.test(t) ? t : ''; })()`, 30000, "the greeting on the stage");
  console.log(`[ritual] 2. stage by voice, greeting: ${greeting.slice(-80)}`);

  // A name the store knows, said as the answer to the greeting, is a whole draft from that artist's DNA, with no
  // model call (lib/song/draft.ts); it used to open a research card and wait for the Hands to build.
  await type("Elvis Presley");
  const drafted = JSON.parse(await waitFor(`(() => { const s = window.__song ? window.__song() : null; return s && s.draft && s.tracks.length >= 3 ? JSON.stringify({ name: s.draft.name, tier: s.draft.tier, tracks: s.tracks.map((t) => t.role).join(",") }) : ""; })()`, 15000, "the draft from the store"));
  console.log(`[ritual] 3. drafted from ${drafted.tier} "${drafted.name}": ${drafted.tracks}`);
  assert.equal(drafted.tier, "artist", `Elvis should be drafted from his records in the store: ${JSON.stringify(drafted)}`);
  console.log(`[ritual]    voice said: ${await lastLine("producer-line")}`);

  // A change the router leaves to the Voice lane becomes a task, the Hands answer it, and their ops land on the record.
  const bassOf = `(() => { const s = window.__song(); const b = s.tracks.find((t) => t.role === 'bass'); return b ? JSON.stringify({ t: b.transpose ?? 0, c: b.synth?.cutoff ?? null }) : ''; })()`;
  const bass0 = JSON.parse(await js(bassOf) || "null");
  assert.ok(bass0, "the draft should have a bass for the Hands to work on");
  await type("build me a groove");
  await waitFor(`(() => { const b = ${bassOf}; return b && JSON.parse(b).t === ${bass0.t - 2}; })()`, 30000, "the hands' ops on the record");
  console.log(`[ritual] 4. the hands landed: bass transpose ${bass0.t} -> ${bass0.t - 2}; report: ${(await lastLine("producer-line")).slice(0, 90)}`);

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
  // The report streams before the reply's ops are applied: give the ops a moment to land on the record.
  const bassNow = `(() => { const s = (window.__song ? window.__song() : JSON.parse(localStorage.getItem('producer.song.v4'))); const b = s.tracks.find((t) => t.role === 'bass'); return b ? (b.transpose ?? 0) + ' / ' + (b.synth?.cutoff ?? 'default') : 'no bass'; })()`;
  const darker = `${bass0.t - 4} / 240`;
  await waitFor(`${bassNow} === "${darker}"`, 10000, "the darker bass ops").catch(() => null);
  const bass = await js(bassNow);
  console.log(`[ritual] 8. darker bass: transpose / cutoff = ${bass}; cards: ${(await cards()).slice(0, 200)}`);
  assert.equal(bass, darker, "the mock hands' ops should have applied");
  // 9. Grab: the Voice hands a cut to the studio, no Hands; with nothing pulled in yet the producer says so.
  await type("grab the synth at 1:32");
  const grabLine = await waitFor(`(() => { const els = [...document.querySelectorAll('[data-role="producer-line"] p')]; const l = els.map((e) => e.textContent).find((t) => /Grabbed the synth|no heard record to grab/.test(t)); return l ?? ''; })()`, 20000, "the grab answer");
  console.log(`[ritual] 9. grab: ${grabLine.slice(0, 90)}`);
  assert.ok(/no heard record to grab|Grabbed the synth/.test(grabLine), "the grab control reaches the studio and is answered");
  // 10. The voice off a record: the control reaches the studio, and with nothing pulled in it says so
  // rather than pretending. The placement itself is proven on a real record by tests/vocal.probe.mjs.
  await type("isolate the vocal and put it before the drop");
  const vocalLine = await waitFor(`(() => { const els = [...document.querySelectorAll('[data-role="producer-line"] p')]; const l = els.map((e) => e.textContent).find((t) => /no record with a voice|VOCAL ISOLATED|Isolating the voice/.test(t)); return l ?? ''; })()`, 20000, "the vocal answer");
  console.log(`[ritual] 10. vocal: ${vocalLine.slice(0, 90)}`);
  assert.ok(/no record with a voice|VOCAL ISOLATED|Isolating the voice/.test(vocalLine), "the vocal control reaches the studio and is answered");
  console.log(`[ritual] cost: ${await js(`document.querySelector('[data-role="cost"]')?.innerText ?? ''`)}; exceptions: ${errors.length ? errors.join(" || ") : "none"}`);
  assert.equal(errors.length, 0, "no uncaught exceptions during the ritual");
  await orderOfWork({ call, js, waitFor, type, status });
  assert.equal(errors.length, 0, `no uncaught exceptions during the order of work: ${errors.join(" || ")}`);
  console.log("[ritual] ALL PASSED");
  process.exit(0);
}
async function orderOfWork({ call, js, waitFor, type, status }) {
  const URL2 = `${BASE}/?e2e=1&typed=1&landing=1&mock=1&guest=1&economy=1`;
  await call("Page.navigate", { url: URL2 }); await sleep(1200);
  await js(`localStorage.clear(); localStorage.setItem('producer.guest.v1','1'); true`);
  await call("Page.navigate", { url: URL2 });
  await waitFor(`!!document.querySelector('[data-role="new-project"]') && !!document.querySelector('input[aria-label="Message the producer"]')`, 30000, "the landing again");
  await type("new project");
  await waitFor(`[...document.querySelectorAll('[data-role="producer-line"] p')].some((e) => /Who are we chasing/.test(e.textContent))`, 30000, "the greeting");
  const song = async () => JSON.parse(await js(`JSON.stringify(window.__song ? window.__song() : JSON.parse(localStorage.getItem('producer.song.v4')))`));
  const ritual = async () => JSON.parse(await js(`JSON.stringify(window.__ritual())`));
  const line = (re, ms, label) => waitFor(`[...document.querySelectorAll('[data-role="producer-line"] p')].map((e) => e.textContent).find((t) => ${re}.test(t)) ?? ''`, ms, label);
  // A person in the room lets the producer finish a sentence before the next one, so the harness does too.
  const say = async (text) => { await waitFor(`!window.__ritual().speaking`, 60000, "the producer to finish speaking"); await type(text); };
  const faders = async () => JSON.parse(await js(`JSON.stringify(Object.fromEntries([...window.__engine().rig.voiceById].map(([id, v]) => [id, Math.round(v.out.volume.value * 10) / 10])))`));
  const meters = async () => JSON.parse(await js(`JSON.stringify(Object.fromEntries(Object.entries(window.__levels()?.tracks ?? {}).map(([k, v]) => [k, Math.round(v)])))`));

  // 1. The grid first: the record's tempo from what the studio already knows, before a single sound.
  await say("What's the tempo of Summer by Calvin Harris?");
  const said1 = await line(/sits at \d+|not sure of that|do not know/, 40000, "the tempo answer");
  const r1 = await waitFor(`(() => { const r = window.__ritual(); return r.source && r.transportBpm === r.source.bpm ? JSON.stringify(r) : ''; })()`, 15000, "the transport on the source grid").then(JSON.parse);
  const s1 = await song();
  console.log(`[ritual] O1. source: ${said1} | song ${s1.bpm} BPM ${s1.key}, transport ${r1.transportBpm} BPM, tempo confidence ${r1.source.tempoConfidence} from the ${r1.source.from}, tracks ${s1.tracks.length}`);
  assert.equal(r1.source.bpm, 128, "Summer sits at 128 in the store"); assert.equal(s1.bpm, 128); assert.equal(r1.transportBpm, 128);
  assert.equal(typeof r1.source.tempoConfidence, "number", "the tempo carries a confidence"); assert.equal(s1.tracks.length, 0, "nothing exists yet but the grid");

  // The record's vocal, separated: three sung lines on its 128 grid, the hook loudest. Handed in as the stems job would.
  const made = await js(`(async () => {
    const SR = 22050, secs = 24, beat = 60 / 128;
    const buf = new OfflineAudioContext(1, SR * secs, SR).createBuffer(1, SR * secs, SR); const d = buf.getChannelData(0);
    let seed = 5; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 0.0005;
    const sing = (fromBeat, secsLong, amp, hz) => { const a = Math.round(fromBeat * beat * SR), n = Math.round(secsLong * SR);
      for (let i = 0; i < n && a + i < d.length; i++) { const t = i / SR; const env = Math.min(1, t / 0.02, (n - i) / SR / 0.05) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 3 * t));
        d[a + i] += (Math.sin(2 * Math.PI * hz * t) * 0.7 + Math.sin(2 * Math.PI * hz * 2 * t) * 0.3) * amp * env; } };
    sing(4, 0.6, 0.12, 220); sing(16, 3.2, 0.6, 293.66); sing(32, 2.6, 0.42, 246.94);
    const eng = await window.__engineModule();
    const bytes = await eng.audioBufferToWav(buf).arrayBuffer();
    await eng.putClip({ id: "stem_ritualjob_vocals", name: "Summer by Calvin Harris · vocals", type: "audio/wav", bytes, createdAt: Date.now(), durationSec: secs }, { mirror: false });
    eng.cacheDecoded("stem_ritualjob_vocals", buf);
    return window.__heard({ id: "ritualjob", name: "Summer by Calvin Harris", vocals: "stem_ritualjob_vocals", bpm: 128, tempoConfidence: 0.8, beatOffsetSec: 0, key: "G major", keyConfidence: 0.65 });
  })()`);
  assert.equal(made, true, "the heard record is in the studio");

  // 2. The chop: a phrase, not a one shot, on the grid, on its own track, looping.
  await say("I'm making a chop");
  const r2 = await waitFor(`(() => { const r = window.__ritual(); return r.playing ? JSON.stringify(r) : ''; })()`, 30000, "the chop").then(JSON.parse);
  const s2 = await song(); const chop = s2.tracks.find((t) => t.id === "chop");
  const heard2 = await waitFor(`(() => { const v = window.__levels()?.tracks?.chop; return v > -60 ? String(Math.round(v)) : ''; })()`, 12000, "the chop to sound");
  console.log(`[ritual] O2. chop: ${r2.playing}, ${chop?.loopBeats} beats of ${chop?.clip?.durationSec?.toFixed(2)} s audio, loop ${JSON.stringify(s2.loop)}, active ${JSON.stringify(s2.sections[0].active)}, meter ${heard2} dB, ${await status()}`);
  assert.ok(chop && chop.role === "audio" && !chop.clip.oneShot, "a looping phrase on an audio track");
  assert.ok([4, 8, 16].includes(chop.loopBeats), "whole bars on the grid"); assert.equal(chop.clip.clipId, r2.playing);
  assert.deepEqual(s2.sections[0].active, ["chop"], "it is alone on the record"); assert.ok(/playing/.test(await status()));

  // 3. Alone: the sing back.
  await say("loop it alone");
  const said3 = await line(/Sing it back/, 20000, "the sing back line");
  const s3 = await song();
  console.log(`[ritual] O3. alone: ${said3} | chop solo ${s3.tracks.find((t) => t.id === "chop").solo}, loop ${JSON.stringify(s3.loop)}`);
  assert.equal(s3.tracks.find((t) => t.id === "chop").solo, true);

  // 4. The beat comes to the vocal, at the source tempo.
  await say("Let's go. To the beat.");
  await waitFor(`(() => { const s = (window.__song ? window.__song() : JSON.parse(localStorage.getItem('producer.song.v4'))); return ['kick', 'clap', 'hat', 'bass'].every((id) => s.tracks.some((t) => t.id === id)); })()`, 30000, "the beat");
  const s4 = await song(); const r4 = await ritual();
  console.log(`[ritual] O4. beat: ${s4.tracks.map((t) => t.id).join(", ")} at ${s4.bpm} BPM, transport ${r4.transportBpm}, source ${r4.source.bpm}, soloed ${s4.tracks.filter((t) => t.solo).length}`);
  assert.equal(s4.bpm, r4.source.bpm, "the beat is at the source tempo"); assert.equal(r4.transportBpm, 128); assert.ok(s4.tracks.every((t) => !t.solo));

  // 5. Silence from the room: the verdict prompt comes inside thirty seconds of the new element.
  const landed = r4.watch?.landedAt;
  const trace = []; const tracer = setInterval(async () => { try { const r = await ritual(); trace.push(`${Math.round((Date.now() - landed) / 100) / 10}s sp=${r.speaking ? 1 : 0} busy=${r.busy ? 1 : 0} run=${r.running ? 1 : 0} loops=${r.loops}`); } catch {} }, 1000);
  assert.equal(r4.watch?.element, "beat");
  const prompt = await waitFor(`(() => { const p = window.__ritual().prompts.find((x) => x.element === 'beat' && x.kind === 'prompt'); return p ? JSON.stringify(p) : ''; })()`, 35000, "the verdict prompt").then(JSON.parse)
    .catch(async (e) => { clearInterval(tracer); console.log(`[ritual] the watch when the prompt did not come: ${JSON.stringify(await ritual())}, now ${await js("Date.now()")}\n${trace.join(" | ")}`); throw e; });
  clearInterval(tracer);
  const promptLine = await line(/One line, in or out/, 5000, "the prompt spoken");
  const r5 = await ritual();
  console.log(`[ritual] O5. verdict prompt ${((prompt.at - landed) / 1000).toFixed(1)} s after the beat landed (${r5.loops - r4.watch.loopsAt} passes of the loop): ${promptLine}`);
  assert.ok(prompt.at - landed < 30000, "inside thirty seconds");

  // 6. Next one: a different candidate plays, and the loop never stopped.
  await say("next one");
  const r6 = await waitFor(`(() => { const r = window.__ritual(); return r.playing && r.playing !== ${JSON.stringify(r2.playing)} ? JSON.stringify(r) : ''; })()`, 30000, "the next candidate").then(JSON.parse);
  const s6 = await song();
  console.log(`[ritual] O6. next: ${r2.playing} -> ${r6.playing}, the chop track plays ${s6.tracks.find((t) => t.id === "chop").clip.clipId}, played ${r6.played.length}, ${await status()}`);
  assert.equal(s6.tracks.find((t) => t.id === "chop").clip.clipId, r6.playing); assert.ok(/playing/.test(await status()), "the music never stopped");

  // 7. Pull it down: every fader but the seed's 10 dB down on the rig, then back on the next word.
  await sleep(600);
  const before = await faders(); const mBefore = await meters();
  await say("pull it down");
  await waitFor(`!!window.__ritual().down`, 10000, "the pull down"); await sleep(500);
  const down = await faders(); const mDown = await meters();
  console.log(`[ritual] O7. pull it down: faders ${JSON.stringify(before)} -> ${JSON.stringify(down)}; meters ${JSON.stringify(mBefore)} -> ${JSON.stringify(mDown)}`);
  for (const id of Object.keys(before)) {
    const delta = down[id] - before[id];
    if (id === "chop") assert.ok(Math.abs(delta) <= 0.5, `the seed stays: ${delta}`);
    else assert.ok(Math.abs(delta + 10) <= 0.5, `${id} is 10 dB down: ${delta}`);
  }
  await say("I kinda like that");
  await waitFor(`!window.__ritual().down`, 10000, "the faders back"); await sleep(500);
  const back = await faders();
  console.log(`[ritual] O8. the next word brings them back: ${JSON.stringify(back)}`);
  for (const id of Object.keys(before)) assert.ok(Math.abs(back[id] - before[id]) <= 0.5, `${id} is back: ${back[id]} vs ${before[id]}`);

  // 9. The ledger learned from it: every element is a move carrying its thirty second window, and the verdict said
  // inside it rides on the move it was said about.
  const ledger = async () => JSON.parse(await js(`localStorage.getItem('producer.taste.v1') ?? '[]'`));
  const t9 = await ledger();
  const byMove = (re) => t9.find((e) => re.test(e.move));
  const [chopMove, beatMove, nextMove] = [byMove(/^chopped:/), byMove(/^drums and bass/), byMove(/^went to the next line:/)];
  for (const [name, e] of [["chop", chopMove], ["beat", beatMove], ["next", nextMove]]) console.log(`[ritual] O9. taste: ${name} "${e?.said}" -> ${JSON.stringify(e?.window)}`);
  assert.ok(chopMove?.window && beatMove?.window && nextMove?.window, "each element carries its window");
  assert.equal(chopMove.window.closedBy, "next move", "the beat landing closed the chop's window"); assert.equal(chopMove.window.verdict, "none");
  assert.equal(nextMove.window.verdict, "liked"); assert.equal(nextMove.window.words, "I kinda like that"); assert.equal(nextMove.verdict, "liked");
  assert.ok(nextMove.window.saidAt - nextMove.window.landedAt < 30000, "said inside the thirty seconds");

  // 10. Three passes and nothing said: the next candidate is offered a swap, and the idea is marked dead in the ledger.
  // One question in the room per 30 s (lib/ritual/questions.ts): the swap waits 30 s after the verdict prompt before it.
  await say("next one");
  const r10 = await waitFor(`(() => { const r = window.__ritual(); return r.played.length === 3 ? JSON.stringify(r) : ''; })()`, 30000, "a third candidate").then(JSON.parse);
  const swap = await waitFor(`(() => { const p = window.__ritual().prompts.find((x) => x.kind === 'swap' && x.landedAt === ${r10.watch.landedAt}); return p ? JSON.stringify(p) : ''; })()`, 80000, "the swap offer").then(JSON.parse);
  const asked = (await ritual()).prompts.filter((x) => x.kind === "prompt" && x.landedAt === r10.watch.landedAt).map((x) => x.at);
  if (asked.length) assert.ok(swap.at - Math.max(...asked) >= 30000, `the swap came ${swap.at - Math.max(...asked)} ms after the verdict prompt, inside the 30 s between questions`);
  const r10b = await ritual();
  const dead = (await ledger()).find((e) => e.id === r10.watch.moveId);
  console.log(`[ritual] O10. silence over ${r10.playing}: swap offered ${((swap.at - swap.landedAt) / 1000).toFixed(1)} s after it landed, ${r10b.loops - r10.watch.loopsAt} loop wraps; ledger ${JSON.stringify({ window: dead?.window, dead: dead?.dead, verdict: dead?.verdict })}`);
  assert.ok(dead?.dead?.passes >= 3, "three passes with no verdict: dead"); assert.equal(dead.window.verdict, "none"); assert.equal(dead.window.closedBy, "time");
  assert.ok(swap.at - swap.landedAt >= 30000, "never dead inside its own window");
}

main().catch((e) => { console.error("[ritual] FAILED:", e.message); process.exit(1); });
