// Brady's own voice (masterprompt phase 10), in headless Chrome, muted, ?e2e=1&mock=1, 0 paid calls:
//   1. The loopback: the studio's output wired back to the take input through a known delay (a device whose round trip
//      is that long). The latency is measured by the take's own loopback click and the take is cut on its bar: the
//      performer's first onset must sit where he sang it, within a millisecond.
//   2. A sung take (A minor notes sung 20 to 35 cents off, with vibrato) is gated and tuned gently: the median distance
//      from the scale after tuning must be under 20 cents, with no clipping, and the take goes on through the placement.
//   3. "Put what I just said in the song": a spoken line (a synthesized stand-in, build/fixtures/voice/said.wav) is
//      what the talk mic heard, with its word times; the typed ask makes it a clip. From the ask to the clip: under 2 s.
//   node tests/take.probe.mjs [baseUrl] [--delays 12,43.7,120] [--out dir] [--label name]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir, loadavg, homedir } from "node:os";
import { join } from "node:path";
import { launch, sleep } from "./load/chrome.mjs";
import { guard } from "./load/guard.mjs";

const args = process.argv.slice(2);
const BASE = args[0] && !args[0].startsWith("--") ? args[0] : "http://localhost:3111";
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const DELAYS = opt("delays", "12,43.7,120").split(",").map(Number);
const SAID = opt("said", join(homedir(), "dev/producer-web-progress/build/fixtures/voice/said.wav"));
const OUT = opt("out", join(tmpdir(), "producer-take")); const LABEL = opt("label", `take-${Date.now()}`);
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[take] ${m}`);
const out = { label: LABEL, loadavg: [loadavg()], loopback: [], said: null, spend: null, exceptions: [] };
const save = () => writeFileSync(join(OUT, `${LABEL}.json`), JSON.stringify(out, null, 1));

// A float32 mono WAV's samples.
function readWav(path) {
  const b = readFileSync(path); let off = 12, fmt = null, data = null;
  while (off + 8 <= b.length) { const id = b.toString("ascii", off, off + 4), size = b.readUInt32LE(off + 4); if (id === "fmt ") fmt = { tag: b.readUInt16LE(off + 8), sr: b.readUInt32LE(off + 12) }; if (id === "data") { data = { at: off + 8, size }; break; } off += 8 + size + (size % 2); }
  const f = new Float32Array(data.size / 4); for (let i = 0; i < f.length; i++) f[i] = b.readFloatLE(data.at + 4 * i);
  return { sr: fmt.sr, samples: f };
}
// Word times from the envelope: runs above a floor, joined across gaps under 60 ms.
function wordsOf(x, sr, text) {
  const hop = Math.round(sr * 0.01), env = []; for (let i = 0; i + hop <= x.length; i += hop) { let s = 0; for (let j = i; j < i + hop; j++) s += x[j] * x[j]; env.push(Math.sqrt(s / hop)); }
  const top = Math.max(...env), on = env.map((v) => v > top * 0.08); const runs = []; let a = -1, quiet = 0;
  on.forEach((v, i) => { if (v) { if (a < 0) a = i; quiet = 0; } else if (a >= 0 && ++quiet > 6) { runs.push([a, i - quiet]); a = -1; quiet = 0; } }); if (a >= 0) runs.push([a, on.length - 1]);
  const w = text.split(" "); return runs.slice(0, w.length).map((r, i) => ({ w: w[i] ?? "", start: r[0] * 0.01, end: (r[1] + 1) * 0.01 }));
}

const p = await launch("take"); const g = await guard(p);
await p.call("Page.navigate", { url: `${BASE}/?e2e=1&mock=1` });
await p.waitFor(`performance.getEntriesByName("producer:transport")[0]?.startTime ?? null`, 60000, "the transport");
await p.waitFor(`typeof window.__takeFeed === "function" && typeof window.__voiceKit === "function"`, 20000, "the take hooks");
await sleep(1500);
log(`stage up, load average ${loadavg()[0].toFixed(1)}`);
// A draft in A minor at 120 BPM, playing.
await p.js(`(async () => { const kit = await window.__voiceKit(); await window.__landSong(kit.compileDraft(kit.laneDna("tech-house"), { songId: "take-probe", lock: { bpm: 120, key: "A minor" } })); return true; })()`);
await sleep(2500);

// The performer: 20 ms of silence, then A minor notes 20 to 35 cents off, each 0.45 s, with a sharp first onset.
const PERFORMER = `(() => { const sr = 44100, notes = [69, 72, 76, 74, 72, 69], cents = [30, -25, 35, -20, 28, -30]; const len = Math.round(0.45 * sr), gap = Math.round(0.05 * sr);
  const x = new Float32Array(Math.round(0.02 * sr) + notes.length * (len + gap)); let at = Math.round(0.02 * sr), ph = 0;
  notes.forEach((m, k) => { for (let i = 0; i < len; i++) { const t = i / sr; const hz = 440 * 2 ** ((m + cents[k] / 100 + 0.15 * Math.sin(2 * Math.PI * 5 * t) / 12 - 69) / 12); ph += 2 * Math.PI * hz / sr; const e = Math.min(1, k === 0 ? 1 : i / (0.015 * sr), (len - i) / (0.03 * sr)); x[at + i] = 0.35 * e * (Math.sin(ph) + 0.4 * Math.sin(2 * ph) + 0.2 * Math.sin(3 * ph)); } at += len + gap; });
  return x; })()`;

for (const ms of DELAYS) {
  const r = await p.js(`(async () => {
    const performer = ${PERFORMER};
    window.__takeFeed({ delaySec: ${ms / 1000}, performer });
    const before = window.__take().log.length;
    await window.__takeRecord(2);
    const e = window.__take().log[before];
    // The raw take: where the performer's first onset landed against the bar the take starts on.
    const eng = await window.__engineModule(); const buf = (await eng.loadClipsFor([e.clipId])).get(e.clipId);
    const d = buf.getChannelData(0); let first = -1; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.05) { first = i; break; }
    window.__takeFeed({ clear: true });
    return { entry: e, onsetMs: first < 0 ? null : Math.round(first / buf.sampleRate * 100000) / 100, wantMs: 20, sr: buf.sampleRate };
  })()`);
  const err = r.onsetMs === null ? null : Math.round((r.onsetMs - r.wantMs) * 100) / 100;
  out.loopback.push({ delayMs: ms, measuredMs: r.entry.latencyMs, from: r.entry.latencyFrom, latencyErrMs: Math.round((r.entry.latencyMs - ms) * 100) / 100, onsetMs: r.onsetMs, onsetErrMs: err, bar: r.entry.bar, tuning: r.entry.tuning, readyMs: r.entry.readyMs, error: r.entry.error ?? null });
  log(`device ${ms} ms: loopback measured ${r.entry.latencyMs} ms (${r.entry.latencyFrom}), take on bar ${r.entry.bar}, first onset ${err} ms from where it was sung; tuned ${r.entry.tuning?.before} -> ${r.entry.tuning?.after} cents over ${r.entry.tuning?.notes} notes, peak ${r.entry.tuning?.peak}`);
  save();
}
// The take went on through the placement loop.
await sleep(4000);
out.placed = await p.js(`JSON.stringify((window.__voicePlace()?.log ?? []).map((l) => ({ slot: l.slot, bar: l.landsAtBar, line: l.line, pass: l.check?.pass })))`).then(JSON.parse);
log(`placed takes: ${out.placed.map((x) => `${x.slot} bar ${x.bar} ${x.pass ? "PASS" : "fail"}`).join("; ")}`);

// "Put what I just said in the song."
if (existsSync(SAID)) {
  const { sr, samples } = readWav(SAID);
  const text = "put the lights down low tonight";
  const words = wordsOf(samples, sr, text);
  await p.js(`window.__said({ samples: ${JSON.stringify(Array.from(samples, (v) => Math.round(v * 1e5) / 1e5))}, text: ${JSON.stringify(text)}, words: ${JSON.stringify(words)} })`);
  const r = await p.js(`(async () => {
    const before = window.__take().log.length;
    const i = document.querySelector('input[aria-label="Message the producer"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(i, "put what I just said in the song"); i.dispatchEvent(new Event('input', { bubbles: true }));
    const t0 = performance.now(); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    for (let k = 0; k < 400; k++) { const e = window.__take().log[before]; if (e?.readyAt) return { entry: e, askToClipMs: Math.round(e.readyAt - t0) }; await new Promise((res) => setTimeout(res, 10)); }
    return { entry: window.__take().log[before] ?? null, askToClipMs: null };
  })()`);
  out.said = { words, seconds: samples.length / sr, ...r };
  log(`"put what I just said in the song": a ${r.entry?.seconds} s clip ${r.askToClipMs} ms after the ask (${words.length} words, the line was ${(samples.length / sr).toFixed(2)} s)`);
}
out.spend = g.spend; out.paid = g.paidCalls(); out.exceptions = p.exceptions; out.loadavg.push(loadavg());
save();
log(`paid calls ${out.paid}, exceptions ${p.exceptions.length}, written ${join(OUT, `${LABEL}.json`)}`);
p.close(); process.exit(0);
