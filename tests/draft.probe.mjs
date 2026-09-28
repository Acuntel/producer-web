// The draft battery (masterprompt phase 8), in the room: headless Chrome, muted, the app ?e2e=1&mock=1, every paid
// route mocked or blocked by tests/load/guard.mjs. Zero spend.
//   1. Twenty names from the store, each said on a silent new record: the time from the words to the first sound
//      above -50 dBFS on the master meter, and each draft's audible signature (every pair must differ).
//   2. The same name on the same record after a reload is the same draft.
//   3. "Next one" lands a new draft on the next phrase (the ledger's landing row: a phrase boundary, beat 1).
//   4. The questions: "Do you like this beat?" once, between 16 and 32 bars; the offer at least 30 s later; never
//      two questions inside 30 s; an answer lands the offer.
//   node tests/draft.probe.mjs [baseUrl] [--out dir] [--label name] [--names 20] [--skip-questions]
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir, loadavg } from "node:os";
import { join } from "node:path";
import { launch, sleep } from "./load/chrome.mjs";
import { guard } from "./load/guard.mjs";
import { INSTRUMENT } from "./load/instrument.mjs";

const args = process.argv.slice(2);
const BASE = args[0] && !args[0].startsWith("--") ? args[0] : "http://localhost:3111";
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const OUT = opt("out", join(tmpdir(), "producer-draft")); const LABEL = opt("label", `draft-${Date.now()}`);
mkdirSync(OUT, { recursive: true });
const NAMES = ["Chris Lake", "Disclosure", "Duke Dumont", "Fisher", "Tiesto", "Armin van Buuren", "Dua Lipa", "The Weeknd", "Tame Impala", "Daft Punk",
  "Calvin Harris", "Avicii", "Skrillex", "Four Tet", "Bicep", "Eric Prydz", "Drake", "Taylor Swift", "Headhunterz", "Artful Dodger"].slice(0, Number(opt("names", "20")));
const log = (m) => console.log(`[draft] ${m}`);
const out = { label: LABEL, loadavg: [loadavg()], names: [], pairs: null, reload: null, next: null, questions: null, spend: null, exceptions: [] };
const save = () => writeFileSync(join(OUT, `${LABEL}.json`), JSON.stringify(out, null, 1));

const p = await launch("draft"); const g = await guard(p);
await p.call("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENT });
// The first sound after a mark: the master meter polled every 5 ms in the page, from the page's own clock.
await p.call("Page.addScriptToEvaluateOnNewDocument", { source: `window.__above = (db, ms) => new Promise((res) => { const t0 = performance.now(); const id = setInterval(() => {
  const l = window.__levels?.(); const m = l ? (Array.isArray(l.master) ? Math.max(l.master[0], l.master[1]) : l.master) : -200;
  if (Number.isFinite(m) && m > db) { clearInterval(id); res(Math.round(performance.now() - t0)); } else if (performance.now() - t0 > ms) { clearInterval(id); res(null); } }, 5); });
  window.__silent = (db, ms) => new Promise((res) => { const t0 = performance.now(); let quiet = 0; const id = setInterval(() => {
  const l = window.__levels?.(); const m = l ? (Array.isArray(l.master) ? Math.max(l.master[0], l.master[1]) : l.master) : -200;
  quiet = !Number.isFinite(m) || m < db ? quiet + 1 : 0; if (quiet >= 40) { clearInterval(id); res(true); } else if (performance.now() - t0 > ms) { clearInterval(id); res(false); } }, 10); });` });
const open = async () => {
  await p.call("Page.navigate", { url: `${BASE}/?e2e=1&mock=1` });
  await p.waitFor(`performance.getEntriesByName("producer:transport")[0]?.startTime ?? null`, 60000, "the transport");
  await p.waitFor(`typeof window.__newRecord === "function" && typeof window.__song === "function"`, 20000, "the harness hooks");
};
const say = (t) => p.js(`(() => { const i = document.querySelector('input[aria-label="Message the producer"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(t)}); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
const drafts = () => p.js(`JSON.stringify(window.__drafts ?? [])`).then(JSON.parse);
const songJson = () => p.js(`JSON.stringify(window.__song())`).then(JSON.parse);
const differ = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]).length;

await open();
await sleep(1500);
log(`stage up, load average ${loadavg()[0].toFixed(1)}`);

// 1. Twenty names, each on a silent new record.
for (const name of NAMES) {
  await p.js(`window.__newRecord().then(() => true)`);
  const silent = await p.js(`window.__silent(-90, 15000)`);
  const before = (await drafts()).length;
  const heard = p.js(`window.__above(-50, 10000)`);
  await say(`make a song like ${name}`);
  const audibleMs = await heard;
  await p.waitFor(`(window.__drafts ?? []).slice(${before}).some((d) => d.kind === "draft")`, 15000, `the draft for ${name}`);
  const d = (await drafts()).slice(before).find((x) => x.kind === "draft");
  const row = { name, audibleMs, silentBefore: silent, resolvedMs: d.resolvedMs, compiledMs: d.compiledMs, tier: d.tier, as: d.name, landsAtBar: d.landsAtBar, sig: d.sig, load: loadavg()[0] };
  out.names.push(row); save();
  log(`${name.padEnd(17)} audible ${audibleMs ?? "never"} ms (resolve ${d.resolvedMs} ms, compile ${d.compiledMs} ms) ${d.tier} ${d.sig.tempo} ${d.sig.key} ${d.sig.kit}`);
}
let min = 99, worst = null, sameHook = 0;
for (let i = 0; i < out.names.length; i++) for (let j = i + 1; j < out.names.length; j++) {
  const x = differ(out.names[i].sig, out.names[j].sig); if (x < min) { min = x; worst = `${out.names[i].name} / ${out.names[j].name}`; }
  if (out.names[i].sig.hook === out.names[j].sig.hook) sameHook++;
}
const times = out.names.map((r) => r.audibleMs).filter((x) => x !== null).sort((a, b) => a - b);
out.pairs = { minDistance: min, worst, sameHook, audibleP50: times[Math.floor(times.length / 2)] ?? null, audibleMax: times[times.length - 1] ?? null, under3s: out.names.filter((r) => r.audibleMs !== null && r.audibleMs < 3000).length, of: out.names.length };
log(`pairs: min distance ${min} of 10 (${worst}), shared hooks ${sameHook}; audible p50 ${out.pairs.audibleP50} ms, max ${out.pairs.audibleMax} ms, under 3 s ${out.pairs.under3s} of ${out.names.length}`);
save();

// 1b. The greeting answered with a bare name ("Who are we chasing tonight?" "Avicii"): a draft, when the store knows it;
// a word it does not know goes on to the Voice lane and makes no record.
await p.js(`window.__newRecord().then(() => true)`); await p.js(`window.__silent(-90, 15000)`);
let nb = (await drafts()).length;
const bareHeard = p.js(`window.__above(-50, 10000)`);
await say("Avicii");
const bareMs = await bareHeard;
const bare = await p.waitFor(`(window.__drafts ?? []).slice(${nb}).find((d) => d.kind === "draft")?.name ?? ""`, 15000, "a draft from a bare name").catch(() => "");
await p.js(`window.__newRecord().then(() => true)`); await sleep(1500);
nb = (await drafts()).length;
await say("hmm");
await sleep(3000);
const hmm = (await drafts()).slice(nb).some((d) => d.kind === "draft");
out.bareName = { name: bare, audibleMs: bareMs, hmmMadeADraft: hmm };
log(`a bare name on an empty record: ${bare ? `drafted from ${bare}, audible ${bareMs} ms` : "no draft"}; "hmm" made a draft: ${hmm}`); save();

// 2. The same name on the same record after a reload: the compiled record hashes the same.
const NAME = NAMES[0];
let n0 = (await drafts()).length;
await say(`make a song like ${NAME}`);
await p.waitFor(`(window.__drafts ?? []).slice(${n0}).some((d) => d.kind === "draft")`, 15000, "the first draft");
const a = (await drafts()).slice(n0).find((x) => x.kind === "draft");
await sleep(4000);   // the record is saved at idle
await open(); await sleep(1500);
const stored = await songJson();
n0 = (await drafts()).length;
await say(`make a song like ${NAME}`);
await p.waitFor(`(window.__drafts ?? []).slice(${n0}).some((d) => d.kind === "draft")`, 15000, "the draft after the reload");
const b = (await drafts()).slice(n0).find((x) => x.kind === "draft");
out.reload = { same: a.hash === b.hash, hashes: [a.hash, b.hash], record: a.songId === b.songId ? a.songId : `${a.songId} vs ${b.songId}`, keptOnReload: stored.id === a.songId && stored.draft?.take === 0 };
log(`reload: the same draft ${out.reload.same} (hash ${a.hash}, record ${out.reload.record}, the record came back with its draft ${out.reload.keptOnReload})`); save();

// 3. Next one, on the next phrase.
n0 = (await drafts()).length;
const tSaid = await p.js("performance.now()");
await say("next one");
await p.waitFor(`(window.__drafts ?? []).slice(${n0}).some((d) => d.kind === "next")`, 15000, "next one");
const nd = (await drafts()).slice(n0).find((d) => d.kind === "next");
await p.waitFor(`(window.__ledger?.().landings ?? []).some((l) => (l.jobId ?? "").startsWith("next:${nd.job}"))`, 20000, "the next landing");
const land = (await p.js(`JSON.stringify(window.__ledger().landings.filter((l) => (l.jobId ?? "").startsWith("next:")))`).then(JSON.parse)).pop();
out.next = { boundary: land.boundary, landsAtBar: land.landsAtBar, beatInBar: land.beatInBar, measuredBeatInBar: land.measuredBeatInBar, onPhrase: (land.landsAtBar - 1) % 4 === 0, afterMs: Math.round(land.landedAt - tSaid), distance: differ(b.sig, nd.sig), take: nd.take };
log(`next one: ${land.boundary} boundary, bar ${land.landsAtBar} beat ${land.beatInBar} (measured ${land.measuredBeatInBar}), on a phrase ${out.next.onPhrase}, ${out.next.distance} features new, landed ${out.next.afterMs} ms after the words`); save();

// 4. The questions on that draft.
if (!args.includes("--skip-questions")) {
  const q0 = Date.now();
  await p.waitFor(`(window.__questions?.().log ?? []).some((q) => q.kind === "beat")`, 120000, "Do you like this beat?");
  let q = await p.js(`JSON.stringify(window.__questions())`).then(JSON.parse);
  const beat = q.log.find((x) => x.kind === "beat");
  log(`asked "${beat.line}" after ${beat.bars} bars (${Math.round((Date.now() - q0) / 1000)} s into the draft)`);
  await say("yeah I love it");
  await p.waitFor(`(window.__questions?.().log ?? []).some((q) => q.kind === "offer")`, 90000, "the offer");
  q = await p.js(`JSON.stringify(window.__questions())`).then(JSON.parse);
  const offer = q.log.find((x) => x.kind === "offer");
  log(`offered "${offer.line}" ${Math.round((offer.at - beat.at) / 1000)} s after the first question`);
  const tracksBefore = (await songJson()).tracks.length;
  const pick = /snare roll/.test(offer.line) ? "the snare roll" : /high lead/.test(offer.line) ? "the high lead" : /arp/.test(offer.line) ? "the arp" : "yes";
  await say(pick);
  const landed = await p.waitFor(`window.__song().tracks.length > ${tracksBefore}`, 15000, "the offer landing").catch(() => false);
  await sleep(35000);   // a quiet half minute: nothing else is asked
  q = await p.js(`JSON.stringify(window.__questions())`).then(JSON.parse);
  const gaps = q.log.slice(1).map((x, i) => x.at - q.log[i].at);
  out.questions = { log: q.log, beatBars: beat.bars, beatInWindow: beat.bars >= 16 && beat.bars <= 32, beats: q.log.filter((x) => x.kind === "beat" && x.draft === beat.draft).length, offerGapS: Math.round((offer.at - beat.at) / 1000), minGapS: gaps.length ? Math.round(Math.min(...gaps) / 1000) : null, picked: pick, offerLanded: !!landed };
  log(`questions: ${q.log.length} asked, min gap ${out.questions.minGapS} s, the beat question ${out.questions.beats} time(s) at ${beat.bars} bars, the offer landed ${out.questions.offerLanded}`);
}
out.spend = { ...(g.spend ?? {}), paidCalls: g.paidCalls() };
out.exceptions = p.exceptions.slice(0, 20); out.loadavg.push(loadavg());
save();
log(`paid calls ${out.spend.paidCalls}, mocked ${JSON.stringify(out.spend.mocked)}, exceptions ${p.exceptions.length}; wrote ${join(OUT, `${LABEL}.json`)}`);
p.close(); process.exit(0);
