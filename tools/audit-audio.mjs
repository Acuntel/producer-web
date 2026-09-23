#!/usr/bin/env node
// The sources audit (docs/SOURCES_AUDIT.md). Every piece of audio this repository holds, found by what the
// bytes are and not only by what the files are called, and whether each one is ours to keep: a file is owned
// only when its exact bytes (sha256) are listed in docs/SOURCES_MANIFEST.json with an owned license.
//
// Read only. It opens files and lists archives; it never writes, moves or deletes anything.
// Usage: node tools/audit-audio.mjs [root] [--json]
import { openSync, readSync, closeSync, statSync, readdirSync, readFileSync, createReadStream, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createBrotliDecompress, createGunzip } from "node:zlib";
import { spawnSync } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2);
const ROOT = path.resolve(args.find((a) => !a.startsWith("--")) ?? ".");
const JSON_OUT = args.includes("--json");
const SKIP = new Set(["node_modules", ".next", ".git", ".claude", ".vercel", "__pycache__"]);
const AUDIO_EXT = /\.(wav|wave|mp3|flac|ogg|oga|opus|m4a|aac|aif|aiff|aifc|caf|wma|webm|mka|mp4|mov)$/i;
const PCM_EXT = /\.(f32|f64|pcm|raw|s16|s24|s32|u8)$/i;   // headerless samples: no magic to find, so the name is the evidence
const MIDI_EXT = /\.(mid|midi|kar)$/i;
const TEXT_EXT = /\.(json|jsonl|md|txt|csv|tsv|ts|tsx|mjs|cjs|js|py|sql|html|css|svg|yml|yaml|toml)$/i;
// A data URI, or the base64 of RIFF..WAVE, ID3v2.3/4, fLaC or OggS with more base64 after it (so a pattern like this one is not a hit).
const B64_AUDIO = /data:audio\/[a-z]|(?:UklGR[A-Za-z0-9+/]{7}QVZF|SUQzB[AQ]|SUQzAw|ZkxhQw|T2dnUw)[A-Za-z0-9+/]{8}/;
const SAMPLES_PER_SECOND = 44100;   // a plain number array this long could be a second of sound

const head = (file, n = 64) => {
  const fd = openSync(file, "r");
  try { const b = Buffer.alloc(n); const got = readSync(fd, b, 0, n, 0); return b.subarray(0, got); } finally { closeSync(fd); }
};
const at = (file, pos, n) => { const fd = openSync(file, "r"); try { const b = Buffer.alloc(n); readSync(fd, b, 0, n, pos); return b; } finally { closeSync(fd); } };

// MPEG audio frame header: two in a row, the second exactly one frame after the first, or it is noise that happens to start with 0xFFE.
const MP3_RATES = [[0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]];
const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
function frameLen(b, o) {
  if (b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return 0;
  const ver = (b[o + 1] >> 3) & 3, layer = (b[o + 1] >> 1) & 3, br = b[o + 2] >> 4, sr = (b[o + 2] >> 2) & 3, pad = (b[o + 2] >> 1) & 1;
  if (ver === 1 || layer !== 1 || br === 0 || br === 15 || sr === 3) return 0;   // Layer III only; the rest is too easy to fake
  const kbps = MP3_RATES[ver === 3 ? 0 : 1][br], hz = SR[ver][sr];
  return Math.floor(((ver === 3 ? 144 : 72) * kbps * 1000) / hz) + pad;
}
// `more(pos)` reads four bytes further in, for the second MPEG frame; null when there is nothing further to read.
function magic(b, more = () => null) {
  const s = (i, n) => b.subarray(i, i + n).toString("latin1");
  if (s(0, 4) === "RIFF" && s(8, 4) === "WAVE") return "wav";
  if (s(0, 4) === "FORM" && /^AIF[FC]$/.test(s(8, 4))) return "aiff";
  if (s(0, 3) === "ID3") return "mp3";
  if (s(0, 4) === "fLaC") return "flac";
  if (s(0, 4) === "OggS") return "ogg";
  if (s(0, 4) === "caff") return "caf";
  if (s(4, 4) === "ftyp") return `mp4 (${s(8, 4).trim()})`;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "webm/mkv";
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return "aac (adts)";
  const n = frameLen(b, 0);
  if (n > 0) { const nb = more(n); if (nb && frameLen(nb, 0)) return "mp3 (frames)"; }
  if (s(0, 4) === "MThd") return "midi";
  if (s(0, 4) === "PAR1") return "parquet";
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4) return "zip";
  if (b[0] === 0x1f && b[1] === 0x8b) return "gzip";
  return null;
}
const looksText = (b) => b.length > 0 && !b.subarray(0, 512).includes(0);

function walk(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
function tracked() {
  const r = spawnSync("git", ["-C", ROOT, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 1 << 28 });
  return new Set(r.status === 0 ? r.stdout.split("\0").filter(Boolean).map((f) => path.join(ROOT, f)) : []);
}
function archiveMembers(file) {
  const zip = /\.zip$/i.test(file);
  const r = zip ? spawnSync("unzip", ["-Z1", file], { encoding: "utf8", maxBuffer: 1 << 28 }) : spawnSync("tar", ["-tzf", file], { encoding: "utf8", maxBuffer: 1 << 28 });
  const names = (r.stdout ?? "").split("\n").filter(Boolean);
  return { audio: names.filter((n) => AUDIO_EXT.test(n) || PCM_EXT.test(n)), midi: names.filter((n) => MIDI_EXT.test(n)).length, total: names.length };
}
// The first bytes of a single compressed file (brotli, gzip), to see what is inside without keeping it.
function innerHead(file) {
  return new Promise((resolve) => {
    const z = /\.br$/i.test(file) ? createBrotliDecompress() : createGunzip();
    const src = createReadStream(file);
    let done = false; const finish = (b) => { if (done) return; done = true; src.destroy(); z.destroy(); resolve(b); };
    z.on("data", (c) => finish(c.subarray(0, 64))); z.on("error", () => finish(null)); z.on("end", () => finish(Buffer.alloc(0)));
    src.pipe(z);
  });
}
// Base64 or data-URI audio inside a text file, streamed so a 250 MB CSV costs no memory.
function embeddedAudio(file) {
  return new Promise((resolve) => {
    let tail = "", hits = 0;
    createReadStream(file, { encoding: "latin1", highWaterMark: 1 << 20 })
      .on("data", (c) => { const s = tail + c; if (B64_AUDIO.test(s)) hits++; tail = s.slice(-64); })
      .on("end", () => resolve(hits)).on("error", () => resolve(0));
  });
}
function longNumberArrays(file) {
  if (!/\.json$/i.test(file) || statSync(file).size > 48 * 1048576) return 0;
  let n = 0, j; try { j = JSON.parse(readFileSync(file, "utf8")); } catch { return 0; }
  const visit = (v) => {
    if (Array.isArray(v)) { if (v.length >= SAMPLES_PER_SECOND && v.every((x) => typeof x === "number")) n++; else v.forEach(visit); }
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(j); return n;
}
// A parquet table's columns and their types, from the pandas schema its writer left in the footer. A column of raw
// bytes, or one named for sound, is what audio in a table would look like. null when the footer has no such schema.
const ID_COL = /(^|_)(mbid|id|uuid|key|hash)$/i;   // a MusicBrainz id is sixteen raw bytes, and an id is not sound
function parquetColumns(file) {
  const size = statSync(file).size; if (size < 12) return null;
  const tail = at(file, size - 8, 8); const len = tail.readUInt32LE(0);
  if (tail.subarray(4).toString("latin1") !== "PAR1" || len > size - 8) return null;
  const foot = at(file, size - 8 - len, len).toString("utf8");
  const i = foot.indexOf('{"index_columns"'); if (i < 0) return null;
  let depth = 0, j = i;
  for (; j < foot.length; j++) { if (foot[j] === "{") depth++; else if (foot[j] === "}" && --depth === 0) break; }
  try { return JSON.parse(foot.slice(i, j + 1)).columns.map((c) => ({ name: String(c.name), type: String(c.pandas_type) })); } catch { return null; }
}

// The print store (data/prints): n records in fixed-width files. A width of 64 bytes or less per record cannot hold a
// recording (one second of the smallest audio is thousands of bytes), so a store that divides evenly is numbers only.
async function printWidths(dir) {
  const mf = path.join(dir, "manifest.json"); if (!existsSync(mf)) return null;
  const m = JSON.parse(readFileSync(mf, "utf8")); const out = [];
  for (const f of m.files ?? []) {
    const p = path.join(dir, f); if (!existsSync(p)) continue;
    const bytes = /\.br$/.test(f) ? await new Promise((res) => { let n = 0; createReadStream(p).pipe(createBrotliDecompress()).on("data", (c) => (n += c.length)).on("end", () => res(n)).on("error", () => res(-1)); }) : statSync(p).size;
    out.push({ file: f, bytes, perRecord: +(bytes / m.n).toFixed(3), text: /\.txt/.test(f) });
  }
  return { n: m.n, dims: m.dims, files: out, numbersOnly: out.every((x) => x.text || (Number.isInteger(x.perRecord) && x.perRecord <= 64)) };
}

const manifestPath = path.join(ROOT, "docs", "SOURCES_MANIFEST.json");
const owned = new Map();
if (existsSync(manifestPath)) for (const f of JSON.parse(readFileSync(manifestPath, "utf8")).files ?? []) owned.set(f.sha256, f);

const files = walk(ROOT, []);
const inGit = tracked();
const found = [], archives = [], embedded = [], numeric = [], midi = [], review = [], parquet = [], compressed = [];
for (const f of files) {
  const rel = path.relative(ROOT, f), size = statSync(f).size;
  const b = size ? head(f) : Buffer.alloc(0);
  const kind = size ? magic(b, (pos) => (pos + 4 <= size ? at(f, pos, 4) : null)) : null;
  const git = inGit.has(f);
  if (MIDI_EXT.test(f) || kind === "midi") { midi.push(rel); continue; }
  if ((kind && !["parquet", "zip", "gzip"].includes(kind)) || AUDIO_EXT.test(f) || PCM_EXT.test(f)) {
    const hash = size ? sha(f) : "";
    const o = owned.get(hash);
    found.push({ path: rel, bytes: size, format: kind ?? (PCM_EXT.test(f) ? "headerless samples" : "named as audio"), git, owned: o ? `${o.lane}: ${o.license}` : null });
    continue;
  }
  if (kind === "zip" || /\.(tar\.gz|tgz|tar)$/i.test(f)) { const m = archiveMembers(f); archives.push({ path: rel, bytes: size, git, ...m, audioCount: m.audio.length }); continue; }
  if (kind === "parquet") {
    const cols = parquetColumns(f);
    if (!cols) { review.push({ path: rel, bytes: size, git, why: "parquet without a readable schema" }); continue; }
    parquet.push({ path: rel, bytes: size, columns: cols.length, audioish: cols.filter((c) => (c.type === "bytes" && !ID_COL.test(c.name)) || /audio|wav|pcm|waveform|mp3|signal|sample_?data/i.test(c.name)).map((c) => `${c.name}:${c.type}`) });
    continue;
  }
  if (/\.(br|gz)$/i.test(f)) { const ib = await innerHead(f); const k = ib && ib.length ? magic(Buffer.concat([ib, Buffer.alloc(64)])) : null; compressed.push({ path: rel, bytes: size, inside: k && !["parquet", "zip", "gzip", "midi"].includes(k) ? k : "no audio header" }); continue; }
  if (TEXT_EXT.test(f) || looksText(b)) {
    const hits = await embeddedAudio(f); if (hits) embedded.push({ path: rel, hits, git });
    const arrays = longNumberArrays(f); if (arrays) numeric.push({ path: rel, arrays, git });
    continue;
  }
  if (size >= 1048576) review.push({ path: rel, bytes: size, git });
}

const prints = await printWidths(path.join(ROOT, "data", "prints"));
// A file the print store accounts for, record by record, has been read; it is not left for a person to read.
if (prints?.numbersOnly) for (let i = review.length - 1; i >= 0; i--) if (prints.files.some((x) => path.join("data", "prints", x.file) === review[i].path)) review.splice(i, 1);
const unlisted = found.filter((x) => !x.owned);
const mb = (n) => (n / 1048576).toFixed(1);
const report = {
  root: ROOT, files: files.length,
  audio: found.length, owned: found.length - unlisted.length, unlisted: unlisted.length, unlistedMB: Number(mb(unlisted.reduce((a, x) => a + x.bytes, 0))),
  archiveAudio: archives.reduce((a, x) => a + x.audioCount, 0), embedded: embedded.length, numeric: numeric.length,
  zero: unlisted.length === 0 && archives.every((x) => x.audioCount === 0) && embedded.length === 0 && numeric.length === 0
    && parquet.every((p) => !p.audioish.length) && compressed.every((c) => c.inside === "no audio header") && (!prints || prints.numbersOnly),
  found, archives, embeddedIn: embedded, numericIn: numeric, parquet, compressed, review, prints, midiFiles: midi.length,
};
if (JSON_OUT) { console.log(JSON.stringify(report, null, 1)); process.exit(0); }
const say = (s) => process.stdout.write(`[audit] ${s}\n`);
say(`walked ${files.length} files under ${ROOT} (skipping ${[...SKIP].join(", ")})`);
say(`audio files by their bytes or their names: ${found.length}; owned and listed in docs/SOURCES_MANIFEST.json: ${report.owned}; not listed: ${unlisted.length} (${report.unlistedMB} MB)`);
const byDir = new Map();
for (const x of unlisted) { const d = path.dirname(x.path); const v = byDir.get(d) ?? { n: 0, bytes: 0, git: 0, formats: new Set() }; v.n++; v.bytes += x.bytes; v.git += x.git ? 1 : 0; v.formats.add(x.format); byDir.set(d, v); }
for (const [d, v] of byDir) say(`  not listed: ${d}/ ${v.n} files, ${mb(v.bytes)} MB, ${v.git} in git, ${[...v.formats].join(" + ")}`);
for (const a of archives) say(`archive ${a.path}: ${a.total} members, ${a.audioCount} audio${a.audioCount ? ` (${a.audio.slice(0, 3).join(", ")}${a.audio.length > 3 ? ", ..." : ""})` : ""}, ${a.midi} MIDI${a.git ? ", in git" : ""}`);
say(`text files with base64 or data-URI audio: ${embedded.length}${embedded.length ? ` (${embedded.map((e) => e.path).join(", ")})` : ""}`);
say(`JSON arrays of ${SAMPLES_PER_SECOND}+ plain numbers (a second of samples or more): ${numeric.length}${numeric.length ? ` (${numeric.map((e) => e.path).join(", ")})` : ""}`);
say(`parquet tables: ${parquet.length} (${parquet.reduce((a, p) => a + p.columns, 0)} columns), columns of raw bytes or named for sound: ${parquet.flatMap((p) => p.audioish).length}${parquet.some((p) => p.audioish.length) ? ` (${parquet.filter((p) => p.audioish.length).map((p) => `${p.path}: ${p.audioish.join(", ")}`).join("; ")})` : ""}`);
say(`compressed single files: ${compressed.length}, with an audio header inside: ${compressed.filter((c) => c.inside !== "no audio header").length}`);
say(`MIDI files (notes, not sound): ${midi.length}`);
if (prints) say(`print store data/prints: ${prints.n} records; ${prints.files.map((x) => `${x.file} ${x.text ? "text" : `${x.perRecord} bytes a record`}`).join(", ")}; ${prints.numbersOnly ? "fixed width, numbers only" : "NOT fixed width, read it by hand"}`);
say(`unrecognised binaries of 1 MB or more, for a person to read: ${review.length}${review.length ? ` (${review.map((r) => r.path).join(", ")})` : ""}`);
say(report.zero ? "ZERO: every piece of audio in this repository is listed as ours." : "NOT ZERO: audio that is not listed as ours is still in this repository.");
