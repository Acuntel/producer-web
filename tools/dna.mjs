#!/usr/bin/env node
// Measure Brady's DJ library with lib/ears and write one JSON of MusicFacts per track into
// data/library/. Resumable (skips tracks that already have a JSON), capped, and prioritised so
// the tracks that matter most (hand-picked folder, then the real DJ pool, then the free tiers)
// land inside the cap. Runs on plain Node 26: the TypeScript ears are imported through a
// resolve hook that maps "./dsp" to "./dsp.ts" (same trick as tests/ts-resolve.mjs).
//
//   node tools/dna.mjs                # measure up to 500 tracks, 2 in flight
//   node tools/dna.mjs --jobs 3       # 3 worker threads (decode + hear each)
//   node tools/dna.mjs --cap 800      # raise the cap (already-measured tracks count toward it)
//   node tools/dna.mjs --dry-run      # print the plan (inventory, priority order, skips) only
//
// The library folders are read only. Nothing under them is ever written, moved or deleted.
import { registerHooks } from "node:module";
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join, basename, extname, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { homedir, cpus } from "node:os";

registerHooks({
  resolve(spec, ctx, next) {
    if ((spec.startsWith("./") || spec.startsWith("../")) && !/\.[cm]?[jt]sx?$/.test(spec) && ctx.parentURL) {
      const base = new URL(spec, ctx.parentURL);
      for (const ext of [".ts", "/index.ts"]) {
        const cand = new URL(base.href + ext);
        if (existsSync(fileURLToPath(cand))) return next(cand.href, ctx);
      }
    }
    return next(spec, ctx);
  },
});

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const OUT_DIR = join(REPO, "data", "library");
const RUN_FILE = join(REPO, "data", "dna-run.json");
const EARS = pathToFileURL(join(REPO, "lib", "ears", "index.ts")).href;
const FFMPEG = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const FFPROBE = existsSync("/opt/homebrew/bin/ffprobe") ? "/opt/homebrew/bin/ffprobe" : "ffprobe";
const SR = 22050;
const MAX_SECONDS = 240;
const MIN_SECONDS = 20;
const MIN_BYTES = 1024 * 1024;
const AUDIO_EXT = new Set([".mp3", ".wav", ".aiff", ".aif", ".flac", ".m4a"]);
const SKIP_NAME = /\b(voice ?memo|meeting|recording|one[- ]?shot|sample ?pack)\b/i;

// Library roots, in the order the lead named them. The Desktop backup folder is actually called
// "DJ LIBRARY" (no "-BACKUP" suffix) and the Slop folder carries a trailing space.
const HOME = homedir();
const ROOTS = [
  { tier: "slop", dir: `${HOME}/Desktop/Good Music From Slop ` },
  { tier: "slop", dir: `${HOME}/Desktop/Good Music From Slop` },
  { tier: "backup", dir: `${HOME}/Desktop/DJ LIBRARY` },
  { tier: "backup", dir: `${HOME}/Desktop/DJ-LIBRARY-BACKUP` },
  { tier: "pioneer", dir: `${HOME}/Music/PioneerDJ` },
].filter((r) => existsSync(r.dir));

// ---------- tags from filenames ----------
export function parseTags(name) {
  const stem = name.replace(/\.[^.]+$/, "");
  let m = /^(\d{2,3})\s+(\d{1,2}[AB])\s+-\s+(.*)$/i.exec(stem);
  if (m) return { bpm: parseInt(m[1], 10), camelot: m[2].toUpperCase(), title: m[3].trim(), source: "filename" };
  m = /^(.*?)\s+(\d{1,2}[AB])\s+(\d{2,3})$/i.exec(stem);
  if (m) return { bpm: parseInt(m[3], 10), camelot: m[2].toUpperCase(), title: m[1].trim(), source: "filename" };
  m = /^(.*?)_(\d{2,3})_(\d{1,2}[AB])$/i.exec(stem);
  if (m) return { bpm: parseInt(m[2], 10), camelot: m[3].toUpperCase(), title: m[1].trim(), source: "filename" };
  return { bpm: null, camelot: null, title: stem.trim(), source: null };
}

// ID3 key tags can be Camelot ("6A"), Open Key ("7m"), or a note ("Gm", "G minor", "Bbmaj").
export function keyFromTag(raw, keyFromCamelot) {
  if (!raw) return "";
  const s = String(raw).trim();
  const cam = keyFromCamelot(s);
  if (cam) return cam;
  const m = /^([A-G])([b#♭♯]?)\s*(m|min|minor|maj|major)?$/i.exec(s);
  if (!m) return "";
  const flat = { "C#": "Db", "D#": "Eb", "Gb": "F#", "G#": "Ab", "A#": "Bb" };
  let tonic = m[1].toUpperCase() + (m[2] === "#" || m[2] === "♯" ? "#" : m[2] ? "b" : "");
  tonic = flat[tonic] ?? tonic;
  const minor = /^(m|min|minor)$/i.test(m[3] ?? "") ;
  return `${tonic} ${minor ? "minor" : "major"}`;
}

// ---------- inventory ----------
function walk(dir, out) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!e.name.startsWith(".")) walk(p, out); continue; }
    if (!e.isFile()) continue;
    if (!AUDIO_EXT.has(extname(e.name).toLowerCase())) continue;
    out.push(p);
  }
  return out;
}

const LANE_BPM = (bpm) => bpm != null && bpm >= 110 && bpm <= 180;

function tierOf(rootTier, path, rootDir) {
  const rel = relative(rootDir, path);
  const first = rel.split("/")[0] ?? "";
  if (rootTier !== "backup") return { tier: rootTier, bucket: rootTier === "pioneer" ? "demo" : "" };
  const tier = /^A - /.test(first) ? "djpool" : /^C - /.test(first) ? "freecc" : /^D - /.test(first) ? "viral" : "backup-other";
  const bucket = rel.split("/")[1] ?? "";
  return { tier, bucket };
}

// Priority: hand-picked folder, DJ pool inside the lane BPM window, DJ pool rest, viral inside,
// free-CC inside, viral rest, free-CC rest, Pioneer demo tracks.
const GROUP_ORDER = ["slop", "djpool-lane", "djpool-rest", "viral-lane", "freecc-lane", "viral-rest", "freecc-rest", "backup-other", "pioneer"];
function groupOf(tier, tagBpm) {
  if (tier === "slop" || tier === "pioneer" || tier === "backup-other") return tier;
  return `${tier}-${LANE_BPM(tagBpm) ? "lane" : "rest"}`;
}

export function inventory() {
  const found = [];
  for (const r of ROOTS) for (const p of walk(r.dir, [])) found.push({ path: p, root: r });
  const skipped = { small: [], name: [], vbrTwin: [], duplicate: [] };
  const seenBase = new Set();
  const items = [];
  for (const { path, root } of found) {
    const name = basename(path);
    let size = 0;
    try { size = statSync(path).size; } catch { continue; }
    if (size <= MIN_BYTES) { skipped.small.push(path); continue; }
    if (SKIP_NAME.test(name)) { skipped.name.push(path); continue; }
    if (/ vbr\.mp3$/i.test(name) && existsSync(path.replace(/ vbr\.mp3$/i, ".mp3"))) { skipped.vbrTwin.push(path); continue; }
    const tags = parseTags(name);
    const { tier, bucket } = tierOf(root.tier, path, root.dir);
    items.push({ path, name, size, tier, bucket, tagBpm: tags.bpm, tagCamelot: tags.camelot, group: groupOf(tier, tags.bpm) });
  }
  items.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  const plan = [];
  for (const it of items) {
    const key = it.name.toLowerCase();
    if (seenBase.has(key)) { skipped.duplicate.push(it.path); continue; }
    seenBase.add(key);
    plan.push(it);
  }
  return { found: found.length, plan, skipped };
}

export const idOf = (path) => createHash("sha1").update(path).digest("hex");

// ---------- worker: probe, decode, hear, write ----------
function probe(path) {
  return new Promise((resolve) => {
    execFile(FFPROBE, ["-v", "error", "-show_entries", "format=duration:format_tags=title,artist,TBPM,bpm,BPM,TKEY,initial_key,key", "-of", "json", path], { maxBuffer: 1 << 20 }, (err, stdout) => {
      if (err) return resolve({ duration: null, tags: {} });
      try {
        const j = JSON.parse(stdout);
        const t = j.format?.tags ?? {};
        const pick = (...keys) => { for (const k of keys) { const hit = Object.keys(t).find((x) => x.toLowerCase() === k.toLowerCase()); if (hit && t[hit] != null && String(t[hit]).trim() !== "") return String(t[hit]).trim(); } return null; };
        resolve({ duration: j.format?.duration ? parseFloat(j.format.duration) : null, tags: { title: pick("title"), artist: pick("artist"), bpm: pick("TBPM", "bpm"), key: pick("TKEY", "initial_key", "key") } });
      } catch { resolve({ duration: null, tags: {} }); }
    });
  });
}

function decode(path) {
  return new Promise((resolve, reject) => {
    const args = ["-y", "-v", "error", "-i", path, "-t", String(MAX_SECONDS), "-ac", "1", "-ar", String(SR), "-f", "f32le", "pipe:1"];
    const ff = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    let err = "";
    ff.stdout.on("data", (c) => chunks.push(c));
    ff.stderr.on("data", (c) => { err += c; });
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code !== 0 && chunks.length === 0) return reject(new Error(`ffmpeg exit ${code}: ${err.trim().slice(0, 300)}`));
      const buf = Buffer.concat(chunks);
      const n = Math.floor(buf.byteLength / 4);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + n * 4);
      resolve(new Float32Array(ab));
    });
  });
}

function resample(arr, n) {
  if (!arr || arr.length === 0) return [];
  if (arr.length <= n) return arr.map((v) => Math.round(v * 1000) / 1000);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * arr.length) / n), b = Math.max(a + 1, Math.floor(((i + 1) * arr.length) / n));
    let s = 0;
    for (let k = a; k < b; k++) s += arr[k];
    out[i] = Math.round((s / (b - a)) * 1000) / 1000;
  }
  return out;
}

async function measureOne(item, ears) {
  const t0 = performance.now();
  const meta = await probe(item.path);
  const tagBpm = item.tagBpm ?? (meta.tags.bpm && Number.isFinite(parseFloat(meta.tags.bpm)) ? Math.round(parseFloat(meta.tags.bpm)) : null);
  const tagKey = item.tagCamelot ? ears.keyFromCamelot(item.tagCamelot) : keyFromTag(meta.tags.key, ears.keyFromCamelot);
  const tagSource = item.tagBpm != null || item.tagCamelot ? "filename" : (tagBpm != null || tagKey) ? "id3" : null;
  const samples = await decode(item.path);
  const secs = samples.length / SR;
  if (secs < MIN_SECONDS) return { skip: "short", secs };
  const t1 = performance.now();
  const facts = ears.hear([samples], SR, { bpmHint: tagBpm ?? undefined, keyHint: tagKey || undefined, label: item.name });
  const hearMs = Math.round(performance.now() - t1);
  const trimmed = { ...facts, structure: { ...facts.structure, energy: resample(facts.structure.energy, 64) } };
  const rec = {
    path: item.path, name: item.name, tier: item.tier, bucket: item.bucket, group: item.group, sizeBytes: item.size,
    tagBpm, tagKey: tagKey || null, tagCamelot: item.tagCamelot ?? null, tagSource,
    id3: { title: meta.tags.title ?? null, artist: meta.tags.artist ?? null },
    durationSec: meta.duration != null ? Math.round(meta.duration * 100) / 100 : Math.round(secs * 100) / 100,
    analysedSec: Math.round(secs * 100) / 100,
    facts: trimmed,
    hearMs, totalMs: Math.round(performance.now() - t0),
    heardAt: new Date().toISOString(),
  };
  const out = join(OUT_DIR, `${idOf(item.path)}.json`);
  const tmp = `${out}.tmp`;
  writeFileSync(tmp, JSON.stringify(rec));
  renameSync(tmp, out);
  return { ok: true, hearMs: rec.hearMs, totalMs: rec.totalMs, bpm: facts.tempo.bpm, key: facts.key.name, tagBpm, tagKey: rec.tagKey };
}

if (!isMainThread) {
  const ears = await import(EARS);
  parentPort.on("message", async (item) => {
    try {
      const res = await measureOne(item, ears);
      parentPort.postMessage({ id: item.path, ...res });
    } catch (e) {
      parentPort.postMessage({ id: item.path, error: String(e?.message ?? e) });
    }
  });
  parentPort.postMessage({ ready: true });
}

// ---------- main ----------
function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const mmss = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

async function main() {
  const cap = parseInt(argOf("--cap", "500"), 10);
  const jobs = Math.max(1, Math.min(parseInt(argOf("--jobs", "2"), 10), cpus().length));
  const dryRun = process.argv.includes("--dry-run");
  mkdirSync(OUT_DIR, { recursive: true });
  const t0 = performance.now();

  const { found, plan, skipped } = inventory();
  const done = new Set();
  for (const f of readdirSync(OUT_DIR)) {
    if (!f.endsWith(".json")) continue;
    try { JSON.parse(readFileSync(join(OUT_DIR, f), "utf8")); done.add(f.slice(0, -5)); } catch { /* truncated: re-measure */ }
  }
  const inCap = plan.slice(0, cap);
  const overCap = plan.slice(cap);
  const already = inCap.filter((it) => done.has(idOf(it.path)));
  const todo = inCap.filter((it) => !done.has(idOf(it.path)));

  const groupCounts = {};
  for (const it of plan) groupCounts[it.group] = (groupCounts[it.group] ?? 0) + 1;
  const capGroups = {};
  for (const it of inCap) capGroups[it.group] = (capGroups[it.group] ?? 0) + 1;
  console.log(`roots: ${ROOTS.map((r) => r.dir).join(" | ")}`);
  console.log(`found ${found} audio files; plan ${plan.length} after skips (small ${skipped.small.length}, name ${skipped.name.length}, vbr twin ${skipped.vbrTwin.length}, duplicate basename ${skipped.duplicate.length})`);
  console.log(`priority groups (all): ${JSON.stringify(groupCounts)}`);
  console.log(`inside cap ${cap}: ${JSON.stringify(capGroups)}; skipped by cap: ${overCap.length}`);
  console.log(`already measured ${already.length}, to measure ${todo.length}, workers ${jobs}`);
  if (dryRun) {
    for (const it of inCap.slice(0, 40)) console.log(`  ${it.group.padEnd(12)} ${it.tagBpm ?? "-"} ${it.tagCamelot ?? "-"}  ${it.name}`);
    if (inCap.length > 40) console.log(`  ... ${inCap.length - 40} more`);
    return;
  }

  const errors = [];
  const shorts = [];
  let finished = 0;
  let hearMsSum = 0;
  const queue = todo.slice();
  const workers = [];
  await new Promise((resolve) => {
    let idle = 0;
    const feed = (w) => {
      const item = queue.shift();
      if (!item) { idle++; w.terminate(); if (idle === workers.length) resolve(); return; }
      w.postMessage(item);
    };
    for (let i = 0; i < jobs; i++) {
      const w = new Worker(fileURLToPath(import.meta.url), { execArgv: ["--no-warnings"], workerData: { i } });
      workers.push(w);
      w.on("message", (msg) => {
        if (msg.ready) { feed(w); return; }
        if (msg.error) { errors.push({ path: msg.id, error: msg.error }); console.log(`  ERROR ${basename(msg.id)}: ${msg.error}`); }
        else if (msg.skip) { shorts.push(msg.id); console.log(`  SKIP short (${msg.secs.toFixed(1)} s) ${basename(msg.id)}`); }
        else { finished++; hearMsSum += msg.hearMs; }
        const n = finished + errors.length + shorts.length;
        if (n % 10 === 0 || n === todo.length) {
          const el = performance.now() - t0;
          const per = el / Math.max(1, n);
          console.log(`[${n}/${todo.length}] elapsed ${mmss(el)}, ${(per / 1000).toFixed(1)} s/track wall, hear avg ${(hearMsSum / Math.max(1, finished) / 1000).toFixed(1)} s, eta ${mmss(per * (todo.length - n))}`);
        }
        feed(w);
      });
      w.on("error", (e) => { console.log(`worker ${i} crashed: ${e.message}`); errors.push({ path: null, error: `worker crash: ${e.message}` }); feed(w); });
    }
    if (todo.length === 0) { workers.forEach((w) => w.terminate()); resolve(); }
  });

  const wall = performance.now() - t0;
  const summary = {
    ranAt: new Date().toISOString(), wallMs: Math.round(wall), cap, jobs,
    found, planned: plan.length, insideCap: inCap.length, skippedByCap: overCap.length,
    skipped: { small: skipped.small.length, name: skipped.name.length, vbrTwin: skipped.vbrTwin.length, duplicateBasename: skipped.duplicate.length, short: shorts.length },
    alreadyMeasured: already.length, measuredThisRun: finished, errors, shortFiles: shorts,
    groupsAll: groupCounts, groupsInCap: capGroups,
    skippedByCapExamples: overCap.slice(0, 20).map((it) => it.path),
  };
  writeFileSync(RUN_FILE, JSON.stringify(summary, null, 2));
  console.log(`done: measured ${finished} this run (${already.length} already), errors ${errors.length}, short ${shorts.length}, skipped by cap ${overCap.length}, wall ${mmss(wall)}`);
  console.log(`summary -> ${RUN_FILE}`);
}

// Only run when executed directly (importing this file for parseTags/inventory must not start a run).
const isEntry = isMainThread && process.argv[1] && existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === (await import("node:fs")).realpathSync(process.argv[1]);
if (isEntry) main().catch((e) => { console.error(e); process.exit(1); });
