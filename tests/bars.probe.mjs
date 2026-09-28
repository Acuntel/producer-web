// The bars probe (masterprompt phase 4): does every change land on its boundary, in the room?
//   1. A hat change, ten times: each lands on beat 1 of a bar, the transport reads the same tick back,
//      and the new hats' first hit fires on or after that bar line, never before.
//   2. An audio loop added mid-section is heard within one bar (it starts at its phase, not at the next section).
//   3. A loop region of bars 5 to 8, set while the playhead is past it: a loop that plays only there is heard
//      within one bar of the landing.
//   4. A restored clip (the record names it before this browser has it) is heard on the next bar, with no other change.
// The outro fade surviving a move is the desk's snap scene (npm run desk -- --scenes snap).
//
//   node tests/bars.probe.mjs [baseUrl] [--out dir] [--label name]
// Server: ANTHROPIC_API_KEY= npm run serve:mock. Chrome --headless=new --mute-audio, the app ?e2e=1&mock=1,
// every paid route stubbed or blocked by tests/load/guard.mjs. Zero spend.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir, loadavg } from "node:os";
import { join } from "node:path";
import { launch, sleep } from "./load/chrome.mjs";
import { guard } from "./load/guard.mjs";
import { INSTRUMENT } from "./load/instrument.mjs";

const args = process.argv.slice(2);
const BASE = args[0] && !args[0].startsWith("--") ? args[0] : "http://localhost:3111";
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const OUT = opt("out", join(tmpdir(), "producer-bars")); const LABEL = opt("label", `bars-${Date.now()}`);
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[bars] ${m}`);
const out = { label: LABEL, loadavg: [loadavg()], hats: [], loopMid: null, loopRegion: null, restored: null };

const p = await launch("bars"); const g = await guard(p);
await p.call("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENT });
await p.call("Page.navigate", { url: `${BASE}/?e2e=1&mock=1` });
await p.waitFor(`performance.getEntriesByName("producer:transport")[0]?.startTime ?? null`, 60000, "the transport");
await p.waitFor(`typeof window.__edit === "function" && !!window.__song`, 20000, "the harness hooks");
await sleep(2500);
const bpm = await p.js(`window.__song().bpm`); const barMs = 240000 / bpm;
log(`playing at ${bpm} bpm (a bar is ${Math.round(barMs)} ms), load average ${loadavg()[0].toFixed(1)}`);
const edit = (ops, label) => p.js(`window.__edit(${JSON.stringify(ops)}, ${JSON.stringify(label)}).then(() => true)`);
const landings = () => p.js(`JSON.stringify(window.__ledger().landings)`).then(JSON.parse);
const level = (id) => p.js(`(() => { const l = window.__levels(); const v = l && l.tracks[${JSON.stringify(id)}]; return typeof v === "number" && Number.isFinite(v) ? v : -200; })()`);
// Ask to audible: poll the track's meter every 20 ms, from the page's own clock.
const trace = [];
async function heardWithin(id, t0, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await level(id); const t = Math.round((await p.js("performance.now()")) - t0);
    if (trace.length < 400) trace.push([id, t, Math.round(v)]);
    if (v > -60) return t;
    await sleep(20);
  }
  return null;
}

const ONLY = opt("only", "");   // hats | mid | region | restored: one step, for a quick look
const longTasks = async (since) => p.js(`JSON.stringify((window.__load?.lt ?? []).filter((x) => x.t >= ${since} && x.d > 100))`).then(JSON.parse);
// 1. Hats, ten times, alternating two patterns.
const hatA = [[42, 0.5, 0.25, 96], [42, 1.5, 0.25, 96], [42, 2.5, 0.25, 96], [42, 3.5, 0.25, 96]];
const hatB = [[42, 0.5, 0.25, 90], [42, 1, 0.25, 70], [42, 1.5, 0.25, 90], [42, 2.5, 0.25, 90], [42, 3, 0.25, 70], [42, 3.5, 0.25, 90]];
for (let i = 0; i < (ONLY && ONLY !== "hats" ? 0 : 10); i++) {
  const before = (await landings()).length;
  await edit([{ op: "notes", track: "hat", notes: i % 2 ? hatA : hatB }], `hats ${i + 1}`);
  await p.waitFor(`window.__ledger().landings.slice(${before}).some((l) => l.partsChanged.includes("hits:hat"))`, barMs * 3, "the hat landing").catch(() => null);
  await sleep(barMs * 0.6 + 400);   // the first hit of the new hats
  const row = (await landings()).slice(before).find((l) => l.partsChanged.includes("hits:hat"));
  const r = row ? { boundary: row.boundary, bar: row.landsAtBar, beatInBar: row.beatInBar, measured: row.measuredBeatInBar, firstHitBeats: row.firstHits?.["hits:hat"] ?? null, waitedMs: Math.round(row.landedAt - row.calledAt) } : null;
  out.hats.push(r); log(`hat ${i + 1}: ${JSON.stringify(r)}`);
  await sleep(300);
}
const onOne = out.hats.filter((h) => h && h.boundary === "bar" && h.beatInBar === 0 && h.measured !== null && Math.min(Math.abs(h.measured), Math.abs(4 - h.measured)) < 0.01 && (h.firstHitBeats === null || h.firstHitBeats >= -0.001)).length;
log(`hat changes on beat 1: ${onOne} of 10`);

// A loop the page makes itself: four beats of a steady chord at the song's tempo, stored like an upload.
const makeLoop = (id) => p.js(`(async () => {
  const eng = await window.__engineModule(); const sr = 44100, secs = 4 * 60 / ${bpm};
  const buf = new OfflineAudioContext(1, 1, sr).createBuffer(1, Math.round(sr * secs), sr); const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = 0.25 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277.2 * t) + Math.sin(2 * Math.PI * 329.6 * t)) / 3; }
  const bytes = await eng.audioBufferToWav(buf).arrayBuffer();
  await eng.putClip({ id: ${JSON.stringify(id)}, name: "bars loop", type: "audio/wav", bytes, createdAt: Date.now(), durationSec: secs }, { mirror: false });
  eng.cacheDecoded(${JSON.stringify(id)}, buf); return true; })()`);
const loopTrack = (id, clipId) => ({ op: "addTrack", track: { id, name: id, role: "audio", volume: -6, duck: false, loopBeats: 4, notes: [], clip: { clipId, name: id, bpm, lengthBeats: 4, warp: true } } });
const sections = await p.js(`JSON.stringify(window.__song().sections.map((s) => s.id))`).then(JSON.parse);

// 2. A loop added mid-section, active everywhere.
await makeLoop("bars_loop");
let t0 = await p.js("performance.now()"); let ms = null;
if (!ONLY || ONLY === "mid") {
const before2 = (await landings()).length;
await edit([loopTrack("loopmid", "bars_loop"), ...sections.map((s) => ({ op: "active", section: s, add: ["loopmid"] }))], "loop mid-section");
ms = await heardWithin("loopmid", t0, barMs * 3);
const row2 = (await landings()).slice(before2).find((l) => l.partsChanged.includes("span:loopmid"));
const heardRow = await p.js(`JSON.stringify(window.__ledger().assets.find((a) => a.key === "bars_loop") ?? null)`).then(JSON.parse);
// Heard is the audio time the loop started (the rig writes it to the ledger when the grain is started), read
// back in page time: the meter poll through DevTools queues behind a listen that keeps the page's thread busy
// in six-millisecond slices, so it can report late. The meter only confirms the loop is sounding.
const firstHeard = heardRow?.firstHeardAt ? Math.round(heardRow.firstHeardAt - t0) : null;
out.loopMid = { askToHeardMs: firstHeard, meterConfirmedMs: ms, barMs: Math.round(barMs), landingAfterAskMs: row2 ? Math.round(row2.landedAt - t0) : null, waitedMs: row2 ? Math.round(row2.landedAt - row2.calledAt) : null, withinOneBar: firstHeard !== null && ms !== null && firstHeard <= barMs + 300, longTasks: await longTasks(t0), landsAtBar: row2?.landsAtBar ?? null, parts: row2?.partsChanged ?? null, voices: row2?.voicesRebuilt ?? null };
log(`loop added mid-section: started ${out.loopMid.askToHeardMs} ms after the ask, the meter confirmed it at ${ms} ms (a bar is ${Math.round(barMs)} ms)`);
await edit([{ op: "removeTrack", track: "loopmid" }], "loop out");
await sleep(barMs * 1.5);
}
if (!ONLY || ONLY === "region") {
// 3. A loop region of bars 5 to 8, with a loop that plays only in the intro, set while the playhead is past bar 8.
await p.waitFor(`(window.__engine().getPosition()?.absBar ?? 0) > 9`, 60000, "the playhead past bar 9").catch(() => null);
await edit([loopTrack("loopintro", "bars_loop"), { op: "active", section: sections[0], add: ["loopintro"] }], "intro loop");
await sleep(barMs * 1.5);
const silentBefore = await level("loopintro");
const before = (await landings()).length;
t0 = await p.js("performance.now()");
await edit([{ op: "loop", loop: { startBar: 5, endBar: 8 } }], "loop bars 5 to 8");
const row = await p.waitFor(`(() => { const r = window.__ledger().landings.slice(${before}).find((l) => l.boundary === "phrase"); return r ? JSON.stringify(r) : null; })()`, barMs * 6, "the loop region landing").then(JSON.parse).catch(() => null);
const landedAt = row ? row.landedAt : null;
ms = await heardWithin("loopintro", t0, barMs * 6);
const pos = await p.js(`JSON.stringify(window.__engine().getPosition())`).then(JSON.parse);
out.loopRegion = { silentBeforeDb: Math.round(silentBefore), askToHeardMs: ms, landingAfterAskMs: landedAt ? Math.round(landedAt - t0) : null, landsAtBar: row?.landsAtBar ?? null, beatInBar: row?.beatInBar ?? null, positionAfter: pos?.absBar ?? null };
// The landing row is written in the boundary's callback, a lookahead (0.2 s) before its audio time.
out.loopRegion.heardAfterLandingMs = ms !== null && landedAt !== null ? Math.round(ms - (landedAt - t0)) : null;
out.loopRegion.withinOneBar = out.loopRegion.heardAfterLandingMs !== null && out.loopRegion.heardAfterLandingMs <= barMs + 300;
log(`loop region 5 to 8: ${JSON.stringify(out.loopRegion)}`);
out.loopRegion.longTasks = await longTasks(t0);
await edit([{ op: "loop", loop: null }, { op: "removeTrack", track: "loopintro" }], "loop off");
await sleep(barMs * 2);
}
if (!ONLY || ONLY === "restored") {
// 4. A restored clip: the record names it first (held, silent), then its bytes arrive.
await edit([loopTrack("restored", "bars_restored"), ...sections.map((s) => ({ op: "active", section: s, add: ["restored"] }))], "restored track");
await sleep(barMs * 2);
const heldDb = await level("restored");
t0 = await p.js("performance.now()");
await makeLoop("bars_restored");
ms = await heardWithin("restored", t0, barMs * 3);
const restoredRow = await p.js(`JSON.stringify(window.__ledger().assets.find((a) => a.key === "bars_restored") ?? null)`).then(JSON.parse);
const restoredHeard = restoredRow?.firstHeardAt ? Math.round(restoredRow.firstHeardAt - t0) : null;
out.restored = { heldDb: Math.round(heldDb), arriveToHeardMs: restoredHeard, meterConfirmedMs: ms, withinOneBar: restoredHeard !== null && ms !== null && restoredHeard <= barMs + 300, longTasks: await longTasks(t0),
  asset: await p.js(`JSON.stringify(window.__ledger().assets.find((a) => a.key === "bars_restored") ?? null)`).then(JSON.parse),
  landings: (await landings()).filter((l) => l.landedAt >= t0 - 5000).map((l) => ({ job: l.jobId, b: l.boundary, bar: l.landsAtBar, parts: l.partsChanged, voices: l.voicesRebuilt, notReady: l.notReady })) };
log(`restored clip: held at ${Math.round(heldDb)} dB, started ${out.restored.arriveToHeardMs} ms after its bytes arrived, the meter confirmed it at ${ms} ms`);
}
const health = await p.js(`JSON.stringify(window.__audio())`).then(JSON.parse);
out.late = health?.late ?? null; out.exceptions = [...new Set(p.exceptions)].slice(0, 10);
out.onBeatOne = onOne; out.loadavg.push(loadavg()); out.paid = g.paidCalls(); out.trace = trace;
writeFileSync(join(OUT, `${LABEL}.json`), JSON.stringify(out, null, 1));
log(`late notes ${out.late}, paid calls ${out.paid}, load average ${loadavg().map((x) => x.toFixed(1)).join(" ")}`);
const pf = (x) => (!x ? "skipped" : x.withinOneBar ? "PASS" : "FAIL");
log(`SUMMARY hats ${onOne}/${out.hats.length} on beat 1 | loop mid-section ${pf(out.loopMid)} | loop region ${pf(out.loopRegion)} | restored ${pf(out.restored)} | wrote ${join(OUT, `${LABEL}.json`)}`);
p.close(); process.exit(out.paid === 0 ? 0 : 1);
