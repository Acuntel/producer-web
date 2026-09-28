// npm run load: the engine rows of the producer masterprompt's section 10, measured and printed.
// When does every piece of the music load, what is decoded twice, where does a change land, what
// does the idle page cost, and is the desk clean. Every number comes from the ledger (window.__ledger)
// or, where only the browser can count, from DevTools; nothing is guessed.
//
//   node tests/load.probe.mjs <cold|play|idle|desk|all> [baseUrl] [--after 15000] [--idle 60000] [--out dir]
//
// Server: ANTHROPIC_API_KEY= npm run serve:mock (the model routes answer from the mock, marked
// x-producer-mock). Safety: Chrome is always --headless=new --mute-audio in a throwaway profile, the
// app always ?e2e=1&mock=1, the voice gets silent PCM from here, and the speech engine, the worker,
// the music model and every production write get a 503 (tests/load/guard.mjs). The last line counts
// paid calls, and a mock run must make none.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir, loadavg } from "node:os";
import { join } from "node:path";
import { launch, sleep } from "./load/chrome.mjs";
import { guard } from "./load/guard.mjs";
import { INSTRUMENT } from "./load/instrument.mjs";
import { cold, orderOfWork, moves, snapshot, pageNow } from "./load/scenes.mjs";
import { coldMetrics, playMetrics, idleMetrics, printTable } from "./load/report.mjs";

const args = process.argv.slice(2);
const MODE = args[0] ?? "all";
const BASE = args[1] && !args[1].startsWith("--") ? args[1] : "http://localhost:3111";
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const AFTER = Number(opt("after", "15000"));
const IDLE = Number(opt("idle", "60000"));
const OUT = opt("out", process.env.LOAD_OUT ?? join(tmpdir(), "producer-load"));
const LABEL = opt("label", `${MODE}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
// --sr device: the other side of the sample-rate A/B (the studio at the device's own rate, not 44.1 kHz).
const SR = opt("sr", null) ? `&sr=${opt("sr", null)}` : "";
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[load] ${m}`);
const results = { label: LABEL, mode: MODE, base: BASE, loadavg: loadavg(), runs: {} };
const metrics = { spend: { mocked: {}, paid: {}, blocked: {}, speakStubbed: 0 }, spendPaid: 0 };
const save = () => writeFileSync(join(OUT, `${LABEL}.json`), JSON.stringify(results, null, 1));

async function page(label) {
  const p = await launch(label);
  const g = await guard(p);
  await p.call("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENT });
  return { p, g };
}
const addSpend = (g) => {
  for (const k of ["mocked", "paid", "blocked"]) for (const [r, n] of Object.entries(g.spend[k])) metrics.spend[k][r] = (metrics.spend[k][r] ?? 0) + n;
  metrics.spend.speakStubbed += g.spend.speakStubbed; metrics.spendPaid += g.paidCalls();
};

async function runCold() {
  // --repeat N: N more cold loads, each in a fresh Chrome, so "every key decodes exactly once" is 10 of 10.
  const repeat = Number(opt("repeat", "0"));
  if (repeat > 0) {
    const all = [];
    for (let i = 0; i < repeat; i++) {
      const { p, g } = await page(`cold${i}`);
      const a = await cold(p, g, `${BASE}/?e2e=1&mock=1${SR}`, AFTER); const m = coldMetrics(a); all.push(m);
      log(`cold ${i + 1}/${repeat}: decodes/key ${m.maxDecodesPerKey}, press to transport ${m.pressToTransportMs} ms, ${m.order}, contexts ${m.realtimeContexts}, late ${m.late}, long tasks press to bar 2 ${JSON.stringify(m.longTasksPressToBar2)}, greeting holes ${JSON.stringify(m.greetingHolesMs)}`);
      addSpend(g); p.close();
    }
    metrics.coldRepeat = { noLongTask: all.filter((m) => m.longTasksPressToBar2 && m.longTasksPressToBar2.length === 0).length, holes: all.map((m) => m.greetingHolesMs), longTasks: all.map((m) => m.longTasksPressToBar2), runs: all.length, maxDecodesPerKey: Math.max(...all.map((m) => m.maxDecodesPerKey ?? 99)), onceEach: all.filter((m) => m.maxDecodesPerKey === 1).length, orders: all.map((m) => m.order), pressToTransportMs: all.map((m) => m.pressToTransportMs), contexts: all.map((m) => m.realtimeContexts) };
    results.runs.coldRepeat = all; save();
  }
  const { p, g } = await page("cold");
  const a = await cold(p, g, `${BASE}/?e2e=1&mock=1${SR}`, AFTER);
  results.runs.cold = a; metrics.cold = coldMetrics(a); log(`cold: ${JSON.stringify(metrics.cold)}`);
  const b = await cold(p, g, null, AFTER, true);
  results.runs.warm = b; metrics.warm = coldMetrics(b); log(`warm reload: ${JSON.stringify(metrics.warm)}`);
  addSpend(g); p.close(); save();
}

async function runPlay() {
  const { p, g } = await page("play");
  await p.call("Page.navigate", { url: `${BASE}/?e2e=1&typed=1&landing=1&mock=1&guest=1&economy=1${SR}` });
  await orderOfWork(p, log);
  await p.js(`window.__ledgerReset && window.__ledgerReset(), true`);
  await moves(p, log);
  const s = await snapshot(p, g); results.runs.play = s;
  const bpm = await p.js(`JSON.parse(localStorage.getItem('producer.song.v4'))?.bpm ?? 120`).catch(() => 120);
  metrics.play = playMetrics(s, bpm); log(`play: ${JSON.stringify(metrics.play)}`);
  // The record that was just made, opened again the way a reload lands on it: a sample-kit record.
  await sleep(1500);
  const r = await cold(p, g, `${BASE}/?e2e=1&mock=1${SR}`, AFTER);
  results.runs.reload = r; metrics.reload = coldMetrics(r); log(`reopened record: ${JSON.stringify(metrics.reload)}`);
  addSpend(g); p.close(); save();
}

async function runIdle() {
  const { p, g } = await page("idle");
  await p.call("Page.navigate", { url: `${BASE}/?e2e=1&typed=1&landing=1&mock=1&guest=1&economy=1${SR}` });
  await orderOfWork(p, log);
  await sleep(3000);
  await p.js(`window.__ledgerReset && window.__ledgerReset(), true`);
  const t0 = await pageNow(p);
  log(`untouched for ${IDLE / 1000} s, load average ${loadavg()[0].toFixed(2)}`);
  await sleep(IDLE);
  const s = await snapshot(p, g); results.runs.idle = s;
  metrics.idle = idleMetrics(s, t0, s.now); log(`idle: ${JSON.stringify(metrics.idle)}`);
  addSpend(g); p.close(); save();
}

async function runDesk() {
  const { p, g } = await page("desk");
  await p.call("Page.navigate", { url: `${BASE}/?e2e=1&mock=1&landing=1` });
  await p.waitFor(`typeof window.__deskModule === "function"`, 40000, "the desk module");
  const scenes = opt("scenes", "full,velocity,swap,wrap,snap").split(",");
  log(`desk: rendering ${scenes.join(", ")} through the offline replica (this takes a minute or two)`);
  // --master '{"makeup":6}' tries master settings on the seed without a rebuild.
  // --seed hard-house measures the other shipped seed.
  const master = opt("master", null); const seed = opt("seed", null);
  const d = JSON.parse(await p.js(`window.__deskModule().then((m) => m.deskProbe(${JSON.stringify(scenes)}, ${seed ? JSON.stringify(seed) : "undefined"}, ${master ?? "undefined"})).then((r) => JSON.stringify(r))`));
  results.runs.desk = d; metrics.desk = d; log(`desk: ${JSON.stringify(d)}`);
  addSpend(g); p.close(); save();
}

const plan = MODE === "all" ? [runCold, runPlay, runIdle, runDesk] : { cold: [runCold], play: [runPlay], idle: [runIdle], desk: [runDesk] }[MODE];
if (!plan) { console.error(`unknown mode ${MODE}: cold | play | idle | desk | all`); process.exit(2); }
log(`${MODE} against ${BASE}, load average ${loadavg().map((x) => x.toFixed(2)).join(" ")}`);
for (const run of plan) { try { await run(); } catch (e) { log(`${run.name} FAILED: ${e.message}`); results.runs[`${run.name}Error`] = e.message; save(); } }
results.metrics = metrics; save();
printTable(metrics);
log(`wrote ${join(OUT, `${LABEL}.json`)}`);
process.exit(metrics.spendPaid === 0 ? 0 : 1);
