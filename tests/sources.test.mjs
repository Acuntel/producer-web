// Where the sounds come from (docs/MASTERPROMPT_SMOOTH.md phase 4): the owned manifest against the files and against
// lib/samples-attribution.ts, the owned lane's ranking and the seed it places, the Splice lane's flag and its hard
// line, and the audit tool finding audio that was planted where it should not be.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseManifest, attributionFree, COMMISSIONED } from "../lib/samples/manifest.ts";
import { creditsFor, creditsText } from "../lib/samples-attribution.ts";
import { checkOwned } from "../lib/sources/manifest.ts";
import { ownedLane, candidateOf, stretchTo, shiftTo, INFERRED_TEMPO } from "../lib/sources/owned.ts";
import { spliceLane, spliceOn, spliceMayGo, spliceKey, staysOnDevice, deviceOnlyTracks, spliceLicense, DESTINATIONS } from "../lib/sources/splice.ts";
import { nextFrom } from "../lib/sources/lane.ts";
import { laneNext, candidateLine, lanesFor } from "../lib/sources/index.ts";
import { applyOps } from "../lib/song/ops.ts";
import { clipKeysFor } from "../lib/engine/clips.ts";
import { LOW_CONFIDENCE } from "../lib/ritual/source.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));
const owned = readJson("docs/SOURCES_MANIFEST.json");
const pack = parseManifest(readJson("public/samples/starter/manifest.json"));
const onDisk = (p) => { const f = path.join(ROOT, p); if (!existsSync(f)) return null; const b = readFileSync(f); return { sha256: createHash("sha256").update(b).digest("hex"), bytes: b.length }; };
const AUDIO = /\.(wav|mp3|flac|ogg|oga|opus|m4a|aac|aif|aiff|caf|webm)$/i;
const walk = (dir) => readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
const shipped = walk("public").filter((p) => AUDIO.test(p));
const clone = (x) => JSON.parse(JSON.stringify(x));
const blank = (bpm = 124, key = "A minor") => ({ version: 3, id: "rec_t", title: "Untitled", bpm, key, lane: "tech-house", humanize: { swing: 0.54, velVar: 0.1, clapLateMs: 8, seed: 7 }, tracks: [], sections: [{ id: "sketch", name: "Sketch", bars: 8, active: [], fill: "none" }], arrangement: ["sketch"] });
const withSource = (bpm, key) => applyOps(blank(), [{ op: "source", name: "The record", bpm, key, tempoConfidence: 0.75, keyConfidence: 0.65, from: "store", alt: null }]).song;

test("the owned manifest lists every sound the product ships, with its license and its exact bytes", () => {
  assert.equal(owned.files.length, 40);
  assert.equal(shipped.length, 40, "everything under public/ that is audio");
  assert.deepEqual(checkOwned(owned, pack, onDisk, shipped), []);
  for (const e of owned.files) assert.ok(attributionFree(e.license), `${e.path}: ${e.license} owes no credit`);
  const kinds = owned.files.reduce((a, e) => ({ ...a, [e.kind]: (a[e.kind] ?? 0) + 1 }), {});
  assert.deepEqual(kinds, { "freesound-cc0": 23, "cc0-library": 17 });
});

test("the manifest check names every problem in plain words", () => {
  const bad = clone(owned);
  bad.files[0].sha256 = "0".repeat(64);
  bad.files[1].license = "CC BY-NC 4.0";
  bad.files[2].url = "https://splice.com/sounds/packs/some-pack";
  bad.files[3] = { ...bad.files[3], kind: "commissioned", license: COMMISSIONED };
  bad.files[4] = { ...bad.files[4], kind: "freesound-cc0", url: "https://freesound.org/search/?q=kick" };
  bad.files[5].author = "someone else";
  bad.files.push(clone(bad.files[6]));
  const problems = checkOwned(bad, pack, onDisk, [...shipped, "public/samples/starter/new_vocal.wav"]);
  for (const needle of ["not the file whose license was recorded", '"CC BY-NC 4.0" is not one the product can own', "per-user license host", "signed buyout", "Freesound page and CC0", "disagree", "listed twice", "new_vocal.wav: shipped but not listed"]) {
    assert.ok(problems.some((p) => p.includes(needle)), `expected a problem mentioning ${needle}; got ${problems.join(" | ")}`);
  }
  const good = { ...clone(owned.files[0]), path: "public/samples/owned/hook.wav", kind: "commissioned", license: COMMISSIONED, contract: "contracts/2026-10-hook-buyout.pdf" };
  assert.ok(!checkOwned({ ...owned, files: [...owned.files, good] }, pack, (p) => (p === good.path ? { sha256: good.sha256, bytes: good.bytes } : onDisk(p)), shipped).some((p) => p.startsWith(good.path)), "a commissioned sound with its contract is owned");
});

test("the owned manifest and lib/samples-attribution.ts agree: a record made from the whole pack owes no credit line", () => {
  const song = blank();
  song.tracks = pack.samples.map((s, i) => ({ id: `t${i}`, name: s.name, role: "audio", volume: 0, duck: false, loopBeats: 4, notes: [], clip: { clipId: `sample:${s.id}`, sampleId: s.id, name: s.name } }));
  const credits = creditsFor(song, pack);
  assert.equal(credits.entries.length, 40);
  assert.equal(credits.required, false);
  assert.match(credits.text, /Nothing here requires a credit line/);
  for (const e of credits.entries) assert.equal(owned.files.find((f) => f.id === e.id)?.license, e.license, `${e.id}: the credits file and the owned manifest name the same license`);
  const commissioned = { ...pack.samples[0], id: "hook", name: "Commissioned hook", license: COMMISSIONED, attribution: "" };
  assert.match(creditsText(song, [commissioned]), /Commissioned buyout \(no credit required\)/);
});

test("the owned lane ranks the library's vocals onto the grid: stretched the least, moved into key, the unsure tempo marked", async () => {
  const lane = ownedLane(pack);
  const at128 = await lane.candidates({ bpm: 128, key: "C# minor" });
  assert.ok(at128.every((c) => c.role === "vocal" && c.license.holder === "product" && c.id.startsWith("owned:")));
  assert.equal(at128.length, 7);
  assert.equal(at128[0].id, "owned:vocal_chop_loop_csm_128");
  assert.equal(at128[0].fit, 1);
  assert.equal(at128[0].beats, 32, "15 s at 128 is eight bars");
  assert.deepEqual(stretchTo(124, 62), { playsAt: 62, stretch: 0 }, "a 124 loop sits on a 62 grid at half time with no stretch");
  assert.equal(shiftTo("Ab minor", "A minor"), 1);
  assert.equal(shiftTo("Ab minor", "C major"), 1, "a minor loop goes to the relative minor of a major grid");
  const feel = candidateOf(pack.samples.find((s) => s.id === "vocal_feel_it_abm_124"), { bpm: 124, key: "A minor" });
  assert.equal(feel.semitones, 1); assert.equal(feel.clip.semitones, 1); assert.equal(feel.clip.bpm, 124); assert.equal(feel.beats, 4);
  const far = candidateOf(pack.samples.find((s) => s.id === "vocal_feel_it_abm_124"), { bpm: 124, key: "C# minor" });
  assert.equal(far.semitones, 0, "five semitones is too far to move a voice"); assert.ok(far.fit < feel.fit);
  const dnb = candidateOf(pack.samples.find((s) => s.id === "loop_dnb_160"), { bpm: 128 });
  assert.equal(dnb.tempoConfidence, INFERRED_TEMPO); assert.ok(dnb.tempoConfidence < LOW_CONFIDENCE, "an inferred tempo is said out loud");
  const phrase = candidateOf(pack.samples.find((s) => s.id === "vocal_come_on"), { bpm: 128 });
  assert.equal(phrase.clip.bpm, undefined, "a phrase with no tempo plays at its own speed"); assert.equal(phrase.beats, 4); assert.equal(phrase.tempoConfidence, 0);
  const withCcBy = { ...pack, samples: [...pack.samples, { ...pack.samples.find((s) => s.role === "vocal"), id: "cc_by_vocal", license: "CC BY 4.0", attribution: "credit" }] };
  assert.ok(!(await ownedLane(withCcBy).candidates({ bpm: 128 })).some((c) => c.id === "owned:cc_by_vocal"), "a sound that owes a credit is not the product's own");
});

test("next draws from the lanes when the records run out: a library vocal becomes the seed on the record's grid, never twice", async () => {
  const song = withSource(128, "C# minor");
  const played = new Set();
  const first = await laneNext(song, played, pack);
  assert.equal(first.id, "owned:vocal_chop_loop_csm_128");
  const { song: after, applied } = applyOps(song, [{ op: "next", clip: first.clip, beats: first.beats }]);
  assert.equal(applied, 1);
  const seed = after.tracks.find((t) => t.id === "chop");
  assert.equal(seed.clip.sampleId, "vocal_chop_loop_csm_128");
  assert.equal(seed.clip.lengthBeats, 32);
  assert.deepEqual(after.loop, { startBar: 1, endBar: 8 }, "the transport loops the seed's own bars");
  assert.ok(clipKeysFor(after).includes("sample:vocal_chop_loop_csm_128"), "the engine loads it from the library, not from anyone's storage");
  played.add(first.id);
  const second = await laneNext(after, played, pack);
  assert.notEqual(second.id, first.id);
  const line = candidateLine(second, 128, "C# minor");
  assert.doesNotMatch(line, /[–—]/, "no dashes in spoken copy");
  assert.match(line, /^Next one, from the library: .+\. .*It is ours to use, under CC0 1\.0\.$/);
  const moved = candidateLine(candidateOf(pack.samples.find((s) => s.id === "vocal_feel_it_abm_124"), { bpm: 128, key: "A minor" }), 128, "A minor");
  assert.match(moved, /It was cut at 124 and I moved it to 128\. I moved it 1 semitone up to sit in A minor\./);
  for (const c of await ownedLane(pack).candidates({ bpm: 128 })) played.add(c.id);
  assert.equal(await laneNext(after, played, pack), null, "when every lane is used up there is nothing, and the ritual says so");
});

test("the Splice lane is off unless its flag is exactly 1, and switched on it still offers nothing", async () => {
  delete process.env.NEXT_PUBLIC_SOURCES_SPLICE;
  assert.equal(spliceOn(), false, "off by default");
  assert.equal(spliceLane().on, false);
  for (const v of ["0", "true", "yes", ""]) assert.equal(spliceLane(v).on, false, `flag "${v}" is not on`);
  const on = spliceLane("1");
  assert.equal(on.on, true);
  assert.deepEqual(await on.candidates({ bpm: 128 }), []);
  assert.match(on.why, /not built yet/);
  assert.equal(await nextFrom([on], { bpm: 128 }), null);
  assert.deepEqual(lanesFor(pack).map((l) => [l.id, l.on]), [["owned", true], ["splice", false]]);
  assert.equal((await laneNext(withSource(128, "C# minor"), new Set(), pack, "1")).lane, "owned", "the owned lane still comes first");
});

test("Splice audio may go to the user's own device and nowhere else, and the clip vault refuses it", () => {
  assert.deepEqual(DESTINATIONS.filter(spliceMayGo), ["device"]);
  for (const d of ["vault", "storage", "worker", "server", "logs", "dna", "galton", "training"]) assert.equal(spliceMayGo(d), false, d);
  const key = spliceKey("abc/123 loop.wav");
  assert.equal(key, "splice:abc_123_loop.wav");
  assert.equal(staysOnDevice(key), true);
  assert.equal(staysOnDevice("sample:vocal_come_on"), false);
  assert.equal(staysOnDevice("clip_123"), false);
  const song = blank(); song.tracks = [{ id: "seed", clip: { clipId: key } }, { id: "up", clip: { clipId: "clip_1" } }, { id: "kick" }];
  assert.deepEqual(deviceOnlyTracks(song), ["seed"]);
  assert.equal(spliceLicense().holder, "user");
  // lib/account/clips.ts imports the engine (Tone.js), which needs a browser, so its wiring is read, not run.
  assert.match(readFileSync(path.join(ROOT, "lib/account/clips.ts"), "utf8"), /export const needsVault = \(key: string\) => !key\.startsWith\("sample:"\) && !staysOnDevice\(key\);/);
});

test("the audit finds audio by its bytes wherever it hides, and calls a tree zero only when every sound is listed as owned", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "sources-audit-"));
  try {
    const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt "), Buffer.alloc(64)]);
    mkdirSync(path.join(dir, "docs")); mkdirSync(path.join(dir, "public"));
    writeFileSync(path.join(dir, "public", "ours.wav"), wav);
    writeFileSync(path.join(dir, "docs", "SOURCES_MANIFEST.json"), JSON.stringify({ files: [{ path: "public/ours.wav", sha256: createHash("sha256").update(wav).digest("hex"), lane: "owned", license: "CC0 1.0" }] }));
    const run = () => JSON.parse(spawnSync(process.execPath, [path.join(ROOT, "tools/audit-audio.mjs"), dir, "--json"], { encoding: "utf8" }).stdout);
    const clean = run();
    assert.equal(clean.audio, 1); assert.equal(clean.owned, 1); assert.equal(clean.zero, true);
    writeFileSync(path.join(dir, "renamed.bin"), Buffer.concat([Buffer.from("ID3"), Buffer.alloc(61)]));
    writeFileSync(path.join(dir, "record.f32"), Buffer.alloc(4096));
    writeFileSync(path.join(dir, "notes.json"), JSON.stringify({ clip: wav.toString("base64") }));
    writeFileSync(path.join(dir, "pcm.json"), JSON.stringify({ samples: new Array(44100).fill(0.1) }));
    const dirty = run();
    assert.equal(dirty.unlisted, 2, "the renamed mp3 and the headerless samples");
    assert.equal(dirty.embedded, 1); assert.equal(dirty.numeric, 1); assert.equal(dirty.zero, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
