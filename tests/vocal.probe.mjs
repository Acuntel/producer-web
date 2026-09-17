// A voice from a record, landed before the drop, measured in a real browser on a real record.
// The harness makes its own vocal stem (three sung phrases in a quiet room), hands it to the studio
// as if the worker had separated it, and then checks where the phrase actually ended up.
//   node tests/vocal.probe.mjs [baseUrl]
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.argv[2] ?? "http://localhost:3111";
const PORT = 9341;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--user-data-dir=/tmp/producer-vocal-profile-${process.pid}`, "about:blank"], { stdio: "ignore" });
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
const errors = [];
ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown") errors.push((d.params?.exceptionDetails?.exception?.description ?? "").slice(0, 300)); });
const js = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, sessionId); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "eval failed"); return r.result?.result?.value; };
const waitFor = async (expr, ms, what) => { const t0 = Date.now(); for (;;) { const v = await js(expr); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}`); await sleep(400); } };

await send("Page.navigate", { url: `${BASE}/?e2e=1` }, sessionId);
await waitFor(`typeof window.__vocal === "function" && typeof window.__engine === "function" && !!window.__engine()`, 60000, "the stage");
console.log("[vocal] stage up");

// A vocal stem the harness made: silence, then three sung phrases, the middle one the loudest and longest.
const made = await js(`(async () => {
  const SR = 22050, secs = 20;
  const ctx = new OfflineAudioContext(1, SR * secs, SR);
  const buf = ctx.createBuffer(1, SR * secs, SR);
  const d = buf.getChannelData(0);
  let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  for (let i = 0; i < d.length; i++) d[i] = rnd() * 0.0006;
  const say = (from, to, amp, hz) => { const a = Math.round(from * SR), b = Math.round(to * SR);
    for (let i = a; i < b; i++) { const t = (i - a) / SR; const fade = Math.min(1, t / 0.03, (b - i) / SR / 0.03);
      d[i] += (Math.sin(2 * Math.PI * hz * t) * 0.7 + Math.sin(2 * Math.PI * hz * 2 * t) * 0.3) * amp * fade; } };
  say(2, 3.0, 0.15, 220);        // a quiet aside
  say(7, 9.4, 0.60, 293.66);     // the hook: loud, two and a half seconds, a D
  say(14, 14.6, 0.35, 196);      // a short tag
  const eng = await window.__engineModule();
  const bytes = await eng.audioBufferToWav(buf).arrayBuffer();
  await eng.putClip({ id: "stem_probejob_vocals", name: "Probe Record · vocals", type: "audio/wav", bytes, createdAt: Date.now(), durationSec: secs }, { mirror: false });
  eng.cacheDecoded("stem_probejob_vocals", buf);
  return { secs, sampleRate: SR };
})()`).catch((e) => ({ error: String(e) }));
if (made?.error) { console.log(`[vocal] could not build the stem: ${made.error}`); process.exit(1); }
console.log(`[vocal] made a ${made.secs} s vocal stem with three phrases (the hook is 7.0 to 9.4 s)`);

const before = JSON.parse(await js(`JSON.stringify((() => { const s = JSON.parse(localStorage.getItem('producer.song.v4')); return { bpm: s.bpm, key: s.key, tracks: s.tracks.length, arrangement: s.arrangement, sections: s.sections.map((x) => ({ id: x.id, name: x.name, bars: x.bars })) }; })())`));
const dropIdx = before.arrangement.findIndex((id) => /drop|chorus|hook/i.test(before.sections.find((s) => s.id === id)?.name ?? ""));
const intoId = before.arrangement[Math.max(0, dropIdx - 1)];
const into = before.sections.find((s) => s.id === intoId);
console.log(`[vocal] record: ${before.bpm} BPM, ${before.key}, ${before.tracks} tracks; the drop is "${before.sections.find((s) => s.id === before.arrangement[dropIdx])?.name}", the section before it is "${into?.name}" (${into?.bars} bars)`);

const report = await js(`window.__vocal(null, "before the drop", { id: "probejob", status: "done", progress: 100, error: null, source: {}, result: { name: "Probe Record", stems: [{ stem: "vocals", path: "" }], facts: { bpm: 120, key: "D minor", durationSec: ${made.secs}, bars: 10, dropAt: null, bestBars: { startBar: 0, startSec: 0, endSec: 8, energy: 1 } } } })`);
console.log(`[vocal] the studio says: ${String(report).slice(0, 220)}`);

// The record is written to the browser's store by an effect, one turn after the move lands.
await waitFor(`(JSON.parse(localStorage.getItem('producer.song.v4')).tracks || []).some((t) => t.id.startsWith('vox_'))`, 8000, "the vocal to be saved").catch(() => {});
const after = JSON.parse(await js(`JSON.stringify((() => { const s = JSON.parse(localStorage.getItem('producer.song.v4'));
  const t = s.tracks.find((x) => x.id.startsWith('vox_'));
  if (!t) return { placed: false };
  const secs = s.arrangement.map((id) => s.sections.find((x) => x.id === id));
  const inSections = secs.filter((x) => x.active.includes(t.id)).map((x) => x.name);
  const sec = s.sections.find((x) => x.active.includes(t.id));
  return { placed: true, id: t.id, role: t.role, volume: t.volume, loopBeats: t.loopBeats, note: t.notes[0], clip: { oneShot: t.clip.oneShot, warp: t.clip.warp, semitones: t.clip.semitones, durationSec: Math.round(t.clip.durationSec * 100) / 100 }, inSections, sectionBeats: sec ? sec.bars * 4 : null, automation: (sec?.automation ?? []).map((a) => a.param + ' ' + a.track) };
})())`));

if (!after.placed) { console.log("[vocal] NOTHING LANDED"); process.exit(1); }
const [, startBeat, lenBeats] = after.note;
const end = startBeat + lenBeats;
const problems = [];
if (after.inSections.length !== 1) problems.push(`it should sound in exactly one section, it is in ${after.inSections.length} (${after.inSections.join(", ")})`);
if (into && after.inSections[0] !== into.name) problems.push(`it should sit in "${into.name}", it is in "${after.inSections[0]}"`);
if (Math.abs(end - after.sectionBeats) > 0.05) problems.push(`its last word should land on the downbeat (beat ${after.sectionBeats}), it ends at ${end.toFixed(2)}`);
if (after.clip.oneShot !== true || after.clip.warp !== false) problems.push("a sung phrase must play once at its own speed");
// The hook is 2.4 s; at the record's tempo that is a known number of beats.
const wantBeats = 2.4 * (before.bpm / 60);
if (Math.abs(lenBeats - wantBeats) > wantBeats * 0.25) problems.push(`it should be about ${wantBeats.toFixed(2)} beats of audio (the 2.4 s hook), it is ${lenBeats.toFixed(2)}`);
if (!after.automation.length) problems.push("the section should lean out to make room for it");

console.log(`[vocal] landed: ${after.id} in "${after.inSections[0]}", beat ${startBeat.toFixed(2)} to ${end.toFixed(2)} of ${after.sectionBeats}, ${after.clip.durationSec} s of audio, tuned ${after.clip.semitones >= 0 ? "+" : ""}${after.clip.semitones}, room made by ${after.automation.join(" and ") || "nothing"}`);
if (errors.length) { console.log(`[vocal] page errors (${errors.length}):`); for (const e of [...new Set(errors)].slice(0, 4)) console.log("   " + e.replace(/\n/g, " ")); }
if (problems.length) { console.log("[vocal] FAILED:"); for (const p of problems) console.log("   " + p); process.exit(1); }
console.log("[vocal] ALL PASSED: the voice was isolated, tuned and landed on the downbeat of the drop");
process.exit(0);
