// The placement gate (masterprompt phase 9b), on REAL singing: CC BY acapellas from ccMixter, separated by the Kim
// RoFormer from mixes over our own beat, with the worker's vocal maps (~/dev/producer-web-progress/build, never
// committed; sources and licenses in build/fixtures/SOURCES.md). For each record and each condition (the voice moved
// 0, +3 and -3 semitones, and its source tempo 5% away either side) the page plans the slots on a draft in that key
// and tempo, cuts, fits (Signalsmith, pre-rendered), lays the placement on the record and renders only its window
// offline through the same rig the room plays; vocalCheck measures the stressed syllable against its downbeat. Then
// one voice goes in through the whole loop in the room (the job, the check, the landing, the line, the question).
//   node tests/place.probe.mjs [baseUrl] [--records waking_me_softly,numbers] [--tries 10] [--out dir] [--label name]
// Chrome --headless=new --mute-audio, the app ?e2e=1&mock=1, every paid route stubbed (tests/load/guard.mjs).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir, loadavg, homedir } from "node:os";
import { join } from "node:path";
import { launch, sleep } from "./load/chrome.mjs";
import { guard } from "./load/guard.mjs";

const args = process.argv.slice(2);
const BASE = args[0] && !args[0].startsWith("--") ? args[0] : "http://localhost:3111";
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const BUILD = opt("build", join(homedir(), "dev/producer-web-progress/build"));
const RECORDS = opt("records", "waking_me_softly,numbers,fading_things").split(",");
const TRIES = Number(opt("tries", "10"));
const DEBUG = args.includes("--debug");   // a try off its anchor also returns both envelopes around it, 10 ms a point
const OUT = opt("out", join(tmpdir(), "producer-place")); const LABEL = opt("label", `place-${Date.now()}`);
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(`[place] ${m}`);
const out = { label: LABEL, loadavg: [loadavg()], records: [], conditions: {}, live: null, spend: null, exceptions: [] };
const save = () => writeFileSync(join(OUT, `${LABEL}.json`), JSON.stringify(out, null, 1));

// A float WAV's frames between two times, as a new float WAV (the fixtures are 44.1 kHz stereo float32).
function cropWav(path, t0, t1) {
  const b = readFileSync(path);
  let off = 12, fmt = null, data = null;
  while (off + 8 <= b.length) { const id = b.toString("ascii", off, off + 4), size = b.readUInt32LE(off + 4); if (id === "fmt ") fmt = { tag: b.readUInt16LE(off + 8), ch: b.readUInt16LE(off + 10), sr: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) }; if (id === "data") { data = { at: off + 8, size }; break; } off += 8 + size + (size % 2); }
  if (!fmt || !data || fmt.tag !== 3 || fmt.bits !== 32) throw new Error(`${path}: not a float32 WAV`);
  const frame = fmt.ch * 4, a = Math.floor(t0 * fmt.sr), z = Math.min(Math.floor(data.size / frame), Math.floor(t1 * fmt.sr));
  const body = b.subarray(data.at + a * frame, data.at + z * frame);
  const h = Buffer.alloc(44); h.write("RIFF", 0); h.writeUInt32LE(36 + body.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(fmt.ch, 22); h.writeUInt32LE(fmt.sr, 24); h.writeUInt32LE(fmt.sr * frame, 28); h.writeUInt16LE(frame, 32); h.writeUInt16LE(32, 34); h.write("data", 36); h.writeUInt32LE(body.length, 40);
  return Buffer.concat([h, body]);
}
// The map on the cropped timeline: every time less t0, only the phrases wholly inside.
function cropMap(m, t0, t1) {
  const s = (x) => Math.round((x - t0) * 1000) / 1000;
  const phrases = m.phrases.filter((p) => p.start >= t0 && p.end <= t1).map((p) => ({ ...p, start: s(p.start), end: s(p.end), loudest: p.loudest.map(s), stressOnset: s(p.stressOnset), words: p.words.map((w) => ({ ...w, start: s(w.start), end: s(w.end), ...(w.asr != null ? { asr: s(w.asr) } : {}) })), notes: p.notes.map((n) => ({ ...n, start: s(n.start), end: s(n.end) })) }));
  return { ...m, source: { ...m.source, downbeats: m.source.downbeats.filter((d) => d >= t0 && d <= t1).map(s), durationSec: t1 - t0 }, sections: m.sections.filter((x) => x.end > t0 && x.start < t1).map((x) => ({ ...x, start: Math.max(0, s(x.start)), end: Math.min(t1 - t0, s(x.end)) })), phrases, hook: phrases.some((p) => p.id === m.hook) ? m.hook : null };
}

// The fixtures, cropped around each record's hook and served to the page (CORS open, this machine only).
const files = new Map();
for (const name of RECORDS) {
  const mapPath = join(BUILD, "maps", `${name}.json`), wav = [join(BUILD, "sep/kim", `${name}.wav`), join(BUILD, "mixes", name, "vocals.wav")].find(existsSync);
  if (!existsSync(mapPath) || !wav) { log(`skipping ${name}: no map or vocal`); continue; }
  const m = JSON.parse(readFileSync(mapPath, "utf8"));
  const hook = m.phrases.find((p) => p.id === m.hook) ?? m.phrases[0];
  const t0 = Math.max(0, Math.floor(hook.start - 30)), t1 = t0 + 60;
  files.set(`/${name}.wav`, cropWav(wav, t0, t1));
  const cm = cropMap(m, t0, t1);
  files.set(`/${name}.json`, Buffer.from(JSON.stringify(cm)));
  out.records.push({ name, vocal: wav.replace(homedir(), "~"), crop: [t0, t1], bpm: m.source.bpm, key: m.source.key, phrases: cm.phrases.length, hook: cm.hook });
}
const server = createServer((q, r) => { const b = files.get(q.url); r.writeHead(b ? 200 : 404, { "Access-Control-Allow-Origin": "*", "Content-Type": q.url.endsWith(".json") ? "application/json" : "audio/wav" }); r.end(b ?? ""); }).listen(3198);
const FIX = "http://127.0.0.1:3198";

const p = await launch("place"); const g = await guard(p);
await p.call("Page.navigate", { url: `${BASE}/?e2e=1&mock=1` });
await p.waitFor(`performance.getEntriesByName("producer:transport")[0]?.startTime ?? null`, 60000, "the transport");
await p.waitFor(`typeof window.__voiceKit === "function" && typeof window.__landSong === "function"`, 20000, "the voice hooks");
await sleep(1500);
log(`stage up, load average ${loadavg()[0].toFixed(1)}`);

const CONDITIONS = [{ id: "0st", semis: 0, tempo: 1 }, { id: "+3st", semis: 3, tempo: 1 }, { id: "-3st", semis: -3, tempo: 1 }, { id: "tempo+5%", semis: 0, tempo: 1.05 }, { id: "tempo-5%", semis: 0, tempo: 1 / 1.05 }];
for (const c of CONDITIONS) out.conditions[c.id] = { tries: [], within: 0, n: 0, maxAbsMs: 0, maxAbsBeats: 0, checkPass: 0 };

for (const rec of out.records) {
  log(`${rec.name}: ${rec.phrases} phrases, ${rec.bpm} BPM, ${rec.key}`);
  const res = await p.js(`(async () => {
    const kit = await window.__voiceKit();
    const NOTES = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"], PC = { c:0,"c#":1,db:1,d:2,"d#":3,eb:3,e:4,f:5,"f#":6,gb:6,g:7,"g#":8,ab:8,a:9,"a#":10,bb:10,b:11 };
    const moveKey = (k, s) => { const [t, m] = k.split(" "); return NOTES[(PC[t.toLowerCase()] + s + 120) % 12] + " " + (m ?? "minor"); };
    const map = kit.parseVocalMap(await (await fetch("${FIX}/${rec.name}.json")).json());
    const src = await kit.decodeBytes(await (await fetch("${FIX}/${rec.name}.wav")).arrayBuffer());
    const v = kit.voiceFromMap(map, { name: "${rec.name}", clipKey: "stem_probe_${rec.name}_vocals" });
    window.__probeVoice = { v, src };
    const out = [];
    for (const c of ${JSON.stringify(CONDITIONS)}) {
      const song = kit.compileDraft(kit.laneDna("tech-house"), { songId: "probe-${rec.name}-" + c.id, lock: { bpm: Math.round(v.bpm * c.tempo * 100) / 100, key: moveKey(v.key ?? "A minor", c.semis) } });
      const slots = kit.planPlacements(v, song, { seed: "probe" });
      const seen = new Set(); const pick = [];
      for (const s of slots) { const k = s.kind + ":" + s.phrase.id; if (seen.has(k)) continue; seen.add(k); pick.push(s); if (pick.length >= ${Math.ceil(TRIES / Math.max(1, RECORDS.length)) + 1}) break; }
      for (const [i, s0] of pick.entries()) {
        const slot = { ...s0, fit: { ...s0.fit, semitones: c.semis } };
        const ids = [], bufs = [];
        for (const x of slot.instances) { const len = x.cut[1] - x.cut[0]; const id = kit.cutId(v.clipKey, x.cut[0], len, "vox"); const r = await kit.cutPhraseClip(src, x.cut[0], len, id, "probe", { exact: true }); ids.push(id); bufs.push(r.buffer); }
        const { ops, tracks } = kit.placementOps(slot, v, song, ids, "vox_probe_" + i);
        const applied = kit.applyOps(song, ops);
        const t = performance.now();
        const chk = await kit.vocalCheck(applied.song, slot, tracks, bufs[0]);
        let debug = null;
        if (${DEBUG} && Math.abs(chk.anchorErrBeats) > 1 / 16) {
          const x = slot.instances[0]; const hop = kit.hopOf(22050); const secs = kit.layout(applied.song); const w = kit.placementWindow(slot, applied.song);
          const pick = (env, t) => { const o = []; for (let k = -30; k <= 30; k++) { const i = Math.round((t + k * 0.01) / hop); o.push(i >= 0 && i < env.length ? +env[i].toFixed(3) : 0); } return o; };
          const srcEnv = kit.rmsEnvelope(bufs[0].getChannelData(0), 44100, kit.hopOf(44100, hop), 0.005);
          const dry = { ...applied.song, master: { ...(applied.song.master ?? {}), compThreshold: 0, makeup: 0, filter: undefined }, sections: applied.song.sections.map((q) => ({ ...q, automation: [], fill: "none" })), tracks: applied.song.tracks.map((q) => (q.id === tracks[0] ? { ...q, fx: { reverb: 0 } } : q)) };
          const r = await kit.renderWindow(dry, w.fromBeat, w.toBeat, { audible: (q) => q.id === tracks[0] });
          const m = r.getChannelData(0); const env = kit.rmsEnvelope(m, r.sampleRate, hop, 0.005);
          const tgt = (x.anchorBeat - w.fromBeat) * 60 / applied.song.bpm + chk.gridMs / 1000;
          debug = { anchorInCut: x.anchorInCut, src: pick(srcEnv, x.anchorInCut), ren: pick(env, tgt), srcOnset: kit.onsetNear(srcEnv, kit.hopOf(44100, hop), x.anchorInCut), renOnset: kit.onsetNear(env, hop, tgt) - tgt + x.anchorInCut, words: s0.phrase.onsets.map((q) => +(q - x.cut[0]).toFixed(3)) };
        }
        out.push({ cond: c.id, slot: s0.kind + ":" + s0.phrase.id, words: s0.phrase.text.split(" ").length, fit: slot.fit, score: s0.score, bpm: song.bpm, key: song.key, ms: Math.round(performance.now() - t), check: chk, debug });
      }
    }
    return out;
  })()`);
  for (const r of res) {
    const c = out.conditions[r.cond]; c.tries.push({ record: rec.name, ...r }); c.n++;
    const within = Math.abs(r.check.anchorErrBeats) <= 1 / 16; if (within) c.within++;
    if (r.check.pass) c.checkPass++;
    c.maxAbsMs = Math.max(c.maxAbsMs, Math.abs(r.check.anchorErrMs)); c.maxAbsBeats = Math.max(c.maxAbsBeats, Math.abs(r.check.anchorErrBeats));
    if (r.debug) log(`    debug ${JSON.stringify(r.debug)}`);
    log(`  ${r.cond.padEnd(8)} ${r.slot.padEnd(18)} fit ${r.fit.rate.toFixed(3)}x ${r.fit.semitones >= 0 ? "+" : ""}${r.fit.semitones} st  anchor ${r.check.anchorErrMs.toFixed(1)} ms (${r.check.anchorErrBeats.toFixed(4)} beat, corr ${r.check.corr})  masked ${r.check.masked} inKey ${r.check.inScale} lead ${r.check.leadCollisions} edge ${r.check.edgeDb} dB  ${r.check.pass ? "PASS" : "fail"}  ${r.ms} ms`);
  }
  out.loadavg.push(loadavg()); save();
}
for (const [id, c] of Object.entries(out.conditions)) log(`${id}: anchor within 1/16 beat ${c.within} of ${c.n} (max ${c.maxAbsMs.toFixed(1)} ms, ${c.maxAbsBeats.toFixed(4)} beat); every check passed ${c.checkPass} of ${c.n}`);

// The whole loop in the room, once: a draft in the voice's own key and tempo, the voice placed by the product.
log("the loop in the room");
const first = out.records[0];
if (first) {
  const live = await p.js(`(async () => {
    const kit = await window.__voiceKit(); const { v, src } = window.__probeVoice;
    const song = kit.compileDraft(kit.laneDna("tech-house"), { songId: "probe-live", lock: { bpm: Math.round(v.bpm * 100) / 100, key: v.key } });
    await window.__landSong(song);
    const t0 = performance.now();
    await window.__placeVoice(v, src);
    const vp = window.__voicePlace(); const led = window.__ledger();
    return { ms: Math.round(performance.now() - t0), log: vp.log, current: vp.current, placements: led.placements.slice(-6), landings: led.landings.slice(-3), learning: led.learning, song: window.__song().tracks.filter((t) => t.clip?.voice).map((t) => ({ id: t.id, clip: t.clip, notes: t.notes })) };
  })()`);
  out.live = live;
  const l = live.log[live.log.length - 1];
  log(l ? `landed ${l.slot} on bar ${l.landsAtBar} in ${live.ms} ms: "${l.line}" check ${l.check?.pass ? "PASS" : "fail"} (anchor ${l.check?.anchorErrMs} ms)` : "nothing landed");
}
out.spend = g.spend; out.paid = g.paidCalls(); out.exceptions = p.exceptions; out.loadavg.push(loadavg());
save();
log(`paid calls ${out.paid}, exceptions ${p.exceptions.length}, written ${join(OUT, `${LABEL}.json`)}`);
server.close(); p.close(); process.exit(0);
