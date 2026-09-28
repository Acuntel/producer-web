// The arrival probe (masterprompt phase 7): a full vocal job lands while the record plays. Six stems of a
// few minutes each arrive (their bytes, made in the page: no worker, no storage, no spend), the voice is
// isolated and placed, and the reference is taken from the worker's numbers. Late notes and underruns must
// stay at 0 through it, and the heap's peak is recorded. Only what a track plays is ever decoded.
//   node tests/arrival.probe.mjs [baseUrl] [--seconds 200] [--out dir] [--label name]
// Chrome --headless=new --mute-audio, the app ?e2e=1&mock=1, every paid route stubbed (tests/load/guard.mjs).
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir, loadavg } from "node:os";
import { join } from "node:path";
import { launch, sleep } from "./load/chrome.mjs";
import { guard } from "./load/guard.mjs";
import { INSTRUMENT } from "./load/instrument.mjs";

const args = process.argv.slice(2);
const BASE = args[0] && !args[0].startsWith("--") ? args[0] : "http://localhost:3111";
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const SECS = Number(opt("seconds", "200"));
const OUT = opt("out", join(tmpdir(), "producer-arrival")); const LABEL = opt("label", `arrival-${Date.now()}`);
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[arrival] ${m}`);
const STEMS = ["vocals", "drums", "bass", "other", "piano", "guitar"];

const p = await launch("arrival"); const g = await guard(p);
await p.call("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENT });
await p.call("Page.navigate", { url: `${BASE}/?e2e=1&mock=1` });
await p.waitFor(`performance.getEntriesByName("producer:transport")[0]?.startTime ?? null`, 60000, "the transport");
await p.waitFor(`typeof window.__landJob === "function"`, 20000, "the landing hook");
await sleep(2000);

// The stems, as 16-bit stereo WAV bytes, made before the measured window. The vocal sings three phrases.
log(`making ${STEMS.length} stems of ${SECS} s each`);
await p.js(`(() => {
  const SR = 44100, secs = ${SECS}, n = SR * secs;
  const wav = (fill) => { const b = new ArrayBuffer(44 + n * 4); const v = new DataView(b); const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, SR, true); v.setUint32(28, SR * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 4, true);
    const s = new Int16Array(b, 44); for (let i = 0; i < n; i++) { const x = fill(i / SR, i); const q = Math.max(-32767, Math.min(32767, Math.round(x * 32767))); s[2 * i] = q; s[2 * i + 1] = q; } return b; };
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  const sing = (t) => { for (const [a, len, hz] of [[30, 3.2, 293.66], [46, 2.6, 246.94], [62, 3.0, 261.63]]) if (t >= a && t < a + len) { const u = t - a; const e = Math.min(1, u / 0.02, (a + len - t) / 0.05); return e * 0.5 * (Math.sin(2 * Math.PI * hz * u) * 0.7 + Math.sin(4 * Math.PI * hz * u) * 0.3); } return rnd() * 0.0005; };
  const fills = { vocals: sing, drums: (t) => ((t * 2.0667) % 1 < 0.05 ? Math.sin(2 * Math.PI * 55 * t) * 0.8 : rnd() * 0.02), bass: (t) => Math.sin(2 * Math.PI * 55 * t) * 0.4, other: (t) => (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 330 * t)) * 0.15, piano: (t) => Math.sin(2 * Math.PI * 440 * t) * 0.1, guitar: (t) => Math.sin(2 * Math.PI * 196 * t) * 0.1 };
  window.__stemBytes = {}; for (const s of ${JSON.stringify(STEMS)}) window.__stemBytes["arrival/" + s + ".wav"] = wav(fills[s]);
  return true; })()`);
await sleep(1500);

const health = () => p.js(`JSON.stringify({ a: window.__audio(), stats: window.__ledger().counters.playback, now: performance.now() })`).then(JSON.parse);
const heap = async () => { const r = (await p.call("Runtime.getHeapUsage")).result ?? {}; return (r.usedSize ?? 0) + (r.backingStorageSize ?? 0); };
const before = await health(); const heap0 = await heap(); let peak = heap0; let sampling = true;
const sampler = (async () => { while (sampling) { peak = Math.max(peak, await heap().catch(() => 0)); await sleep(200); } })();
const t0 = before.now;
log(`landing the job at load average ${loadavg()[0].toFixed(1)}, heap ${Math.round(heap0 / 1e6)} MB`);
const result = { name: "Arrival Test", kind: "stems", facts: { bpm: 124, tempoConfidence: 0.8, key: "A minor", keyConfidence: 0.7, durationSec: SECS, bars: Math.round(SECS * 124 / 240), barEnergy: [], blocks: [{ bar: 1, at: 0, energy: 0.3 }, { bar: 17, at: 31, energy: 1 }, { bar: 33, at: 62, energy: 0.4 }], dropAt: 31, bestBars: { startBar: 17, startSec: 31, endSec: 46.5, energy: 1 } }, stems: STEMS.map((s) => ({ stem: s, path: `arrival/${s}.wav` })), oneshots: [], hearing: { chords: ["Am", "F", "C", "G"], report: "a synthetic record for the arrival probe" } };
const landedOk = await p.js(`window.__landJob("arrivaljob", ${JSON.stringify(result)}, { vocal: true }).then(() => true, (e) => "failed: " + e.message)`);
const landedAt = await p.js("performance.now()");
await sleep(6000);
sampling = false; await sampler;
const after = await health();
const lt = JSON.parse(await p.js(`JSON.stringify((window.__load?.lt ?? []).filter((x) => x.t >= ${t0}).map((x) => x.d))`));
const assets = JSON.parse(await p.js(`JSON.stringify(window.__ledger().assets.filter((a) => a.key.startsWith("stem_arrivaljob") || a.key.startsWith("cut:")).map((a) => ({ key: a.key, decodes: a.decodes, source: a.source, bytes: a.bytes })))`));
const song = JSON.parse(await p.js(`JSON.stringify(window.__song().tracks.filter((t) => /^vox_/.test(t.id)).map((t) => ({ id: t.id, clip: t.clip?.clipId })))`));
const ref = await p.js(`(() => { const r = JSON.parse(localStorage.getItem("producer.reference.v1") || "null"); return r ? r.name + " " + r.facts.tempo.bpm + " BPM " + r.facts.key.name : null; })()`);
const out = {
  label: LABEL, seconds: SECS, landed: landedOk, landingMs: Math.round(landedAt - t0),
  late: (after.a?.late ?? 0) - (before.a?.late ?? 0), underruns: (after.stats?.underrunEvents ?? 0) - (before.stats?.underrunEvents ?? 0),
  heapStartMb: Math.round(heap0 / 1e6), heapPeakMb: Math.round(peak / 1e6), longTasks: lt, decodedStems: assets.filter((a) => a.key.startsWith("stem_") && a.decodes > 0).map((a) => a.key), assets, placed: song, reference: ref,
  loadavg: loadavg(), paid: g.paidCalls(), exceptions: [...new Set(p.exceptions)].slice(0, 8),
};
writeFileSync(join(OUT, `${LABEL}.json`), JSON.stringify(out, null, 1));
log(`landed ${landedOk} in ${out.landingMs} ms: late ${out.late}, underruns ${out.underruns}, heap ${out.heapStartMb} MB, peak ${out.heapPeakMb} MB, long tasks ${lt.length ? lt.join(", ") + " ms" : "none"}`);
log(`decoded stems: ${out.decodedStems.join(", ") || "none"}; placed ${JSON.stringify(song)}; reference ${ref}`);
log(`${out.late === 0 && out.underruns === 0 ? "PASS" : "FAIL"}: late notes and underruns through the arrival (paid ${out.paid}, load average ${loadavg()[0].toFixed(1)}); wrote ${join(OUT, `${LABEL}.json`)}`);
p.close(); process.exit(0);
