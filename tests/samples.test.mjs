import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseManifest, validateManifest, pickKit, samplesForBrain, sampleKey, licenseAllowed, KIT_SOUNDS, SAMPLE_ROLES, MAX_PACK_BYTES } from "../lib/samples/manifest.ts";
import { sampleKit, setManifest } from "../lib/engine/samples.ts";
import { creditsFor, usesSamples, creditsFileName, attributionRequired } from "../lib/samples-attribution.ts";
import { applyOps } from "../lib/song/ops.ts";
import { migrateSong } from "../lib/song/migrate.ts";
import { scheduleEvents } from "../lib/engine/schedule.ts";
import { clipKeysFor, clipBuffer } from "../lib/engine/clips.ts";
import { localIntent } from "../lib/brain/local.ts";
import { diffSongs } from "../lib/song/history.ts";
import { SEED_TECH_HOUSE, SEED_HARD_HOUSE } from "../lib/song/seeds.ts";
import { CONTRACT, SAMPLES_BLOCK } from "../lib/brain/contract.ts";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "samples", "starter");
const raw = JSON.parse(readFileSync(path.join(DIR, "manifest.json"), "utf8"));
const manifest = parseManifest(raw);
const fileSize = (file) => (existsSync(path.join(DIR, file)) ? statSync(path.join(DIR, file)).size : false);
const seed = () => JSON.parse(JSON.stringify(SEED_TECH_HOUSE));
const clone = (x) => JSON.parse(JSON.stringify(x));

test("manifest validates: files exist, licenses allowed, roles valid, kits consistent, under the size cap", () => {
  assert.equal(manifest.pack, "starter");
  assert.equal(manifest.samples.length, 40);
  assert.deepEqual(validateManifest(manifest, fileSize), []);
  const ids = new Set(manifest.samples.map((s) => s.id));
  assert.equal(ids.size, manifest.samples.length, "ids are unique");
  for (const s of manifest.samples) {
    assert.ok(licenseAllowed(s.license), `${s.id}: ${s.license}`);
    assert.ok(SAMPLE_ROLES.includes(s.role), `${s.id}: role ${s.role}`);
    assert.ok(s.url.startsWith("https://"), `${s.id}: url`);
    assert.ok(s.attribution.length > 10 && s.author.length > 0, `${s.id}: provenance`);
    assert.equal(fileSize(s.file), s.bytes, `${s.id}: bytes match the file on disk`);
    assert.ok(s.seconds > 0.05, `${s.id}: duration known`);
  }
  const total = manifest.samples.reduce((a, s) => a + fileSize(s.file), 0);
  assert.ok(total <= MAX_PACK_BYTES, `pack is ${total} bytes`);
  assert.ok(manifest.kits.some((k) => k.id === "starter"), "the starter kit exists");
  for (const k of manifest.kits) for (const sound of KIT_SOUNDS) assert.equal(manifest.samples.find((s) => s.id === k.sounds[sound])?.role, sound, `kit ${k.id} ${sound}`);
  // The plain-array form the pack first shipped as still parses (ids come from filenames).
  const legacy = parseManifest(raw.samples.map(({ id: _id, ...rest }) => rest));
  assert.equal(legacy.samples[0].id, "kick_house"); assert.deepEqual(legacy.kits, []);
});

test("validation names every problem in plain words", () => {
  const bad = clone(manifest);
  bad.samples[0].role = "drums";
  bad.samples[1].license = "CC BY-NC 4.0";
  bad.samples[2].file = "missing.wav";
  bad.samples[3].id = bad.samples[4].id;
  bad.samples.push({ ...bad.samples[5], id: "cc_by_no_credit", file: bad.samples[5].file, license: "CC BY 4.0", attribution: "" });
  bad.kits[0].sounds.kick = "clap_solo";
  bad.kits[1].sounds.hat = "nope";
  const problems = validateManifest(bad, fileSize);
  for (const needle of ['invalid role "drums"', "CC BY-NC 4.0", "missing.wav is missing", "duplicate id", "needs an attribution line", "whose role is clap", 'unknown sample "nope"']) {
    assert.ok(problems.some((p) => p.includes(needle)), `expected a problem mentioning ${needle}; got ${problems.join(" | ")}`);
  }
  const huge = clone(manifest); huge.samples[0].bytes = 7 * 1024 * 1024;
  assert.ok(validateManifest(huge).some((p) => p.includes("cap is")));
});

test("kit assembly picks by role with fallback flags", () => {
  const starter = pickKit(manifest, "starter");
  assert.equal(starter.kitId, "starter"); assert.deepEqual(starter.fallback, []);
  for (const sound of KIT_SOUNDS) assert.equal(starter.picks[sound].role, sound);
  assert.equal(starter.picks.kick.id, "kick_house");
  assert.equal(pickKit(manifest, "hard-house").kitId, "starter-hard", "a lane name picks the kit for that lane");
  assert.equal(pickKit(manifest, "starter-808").picks.kick.id, "kick_808_deep");
  assert.equal(pickKit(manifest, "no-such-kit", "hard-house").kitId, "starter-hard", "unknown ids fall back to the lane kit");
  assert.equal(pickKit(manifest, "no-such-kit").kitId, "starter", "then to the first kit");
  const noOpen = { ...manifest, samples: manifest.samples.filter((s) => s.role !== "openhat") };
  const p = pickKit(noOpen, "starter");
  assert.equal(p.picks.openhat, null); assert.deepEqual(p.fallback, ["openhat"]);
  const wrongRole = clone(manifest); wrongRole.kits[0].sounds.snare = "kick_tek";
  assert.equal(pickKit(wrongRole, "starter").picks.snare.id, "snare_dub", "a wrong-role kit entry falls back to the first sample of that role");
  const noKits = { ...manifest, kits: [] };
  const auto = pickKit(noKits, "starter");
  assert.equal(auto.kitId, "auto"); assert.deepEqual(auto.fallback, []); assert.equal(auto.picks.clap.id, "clap_solo");
});

test("sampleKit assembles a playable Kit and falls back per sound", async () => {
  setManifest(manifest);
  const synth = Object.fromEntries(KIT_SOUNDS.map((s) => [s, { synth: s }]));
  const decode = async (id) => (id === "openhat_gui" ? null : { sample: id });
  const r = await sampleKit("starter", "tech-house", { manifest, decode, synth });
  assert.equal(r.kitId, "starter");
  assert.deepEqual(r.kit.kick, { sample: "kick_house" });
  assert.deepEqual(r.kit.openhat, { synth: "openhat" }, "a sound that fails to decode uses the synthesized one");
  assert.deepEqual(r.fallback, ["openhat"]); assert.equal(r.used.openhat, null); assert.equal(r.used.kick, "kick_house");
  const dead = await sampleKit("starter-hard", "hard-house", { manifest, decode: async () => null, synth });
  assert.deepEqual(dead.fallback, [...KIT_SOUNDS]); assert.deepEqual(dead.kit, synth);
  const none = await sampleKit("tech-house", "tech-house", { manifest: { ...manifest, samples: [] }, decode, synth });
  assert.deepEqual(none.fallback, [...KIT_SOUNDS]);
  setManifest(null);
});

test("library samples as tracks: addTrack normalizes the clip, loaders key it, the schedule plays it", () => {
  const s = seed();
  const { song, skipped } = applyOps(s, [
    { op: "addTrack", track: { id: "vox", name: "Hey", role: "audio", volume: -4, loopBeats: 4, notes: [[60, 1.5, 0.5, 110]], clip: { sampleId: "vocal_hey_abm_124" } } },
    { op: "addTrack", track: { id: "brk", role: "audio", volume: -8, notes: [], clip: { sampleId: "loop_breakbeat_126", bpm: 126, warp: true, lengthBeats: 4 } } },
    { op: "addTrack", track: { id: "noclip", role: "audio", volume: -8, notes: [], clip: { name: "nothing" } } },
    { op: "active", section: "drop", add: ["vox", "brk"] },
    { op: "set", track: "song", path: "kit", value: "starter" },
  ]);
  assert.equal(skipped.length, 0);
  const vox = song.tracks.find((t) => t.id === "vox");
  assert.equal(vox.clip.clipId, sampleKey("vocal_hey_abm_124")); assert.equal(vox.clip.name, "vocal_hey_abm_124", "a clip with no name is labelled by its sample id"); assert.equal(vox.clip.oneShot, true, "a sample with no loop settings is a one-shot");
  const brk = song.tracks.find((t) => t.id === "brk");
  assert.equal(brk.clip.name, "loop_breakbeat_126"); assert.equal(brk.clip.oneShot, undefined, "a warped loop stays a loop");
  assert.equal(song.tracks.find((t) => t.id === "noclip").clip, undefined, "a clip without any key is dropped");
  assert.equal(song.kit, "starter");
  assert.deepEqual(clipKeysFor(song), ["sample:vocal_hey_abm_124", "sample:loop_breakbeat_126"]);
  const sch = scheduleEvents(song);
  const drop = sch.sectionStarts.find((x) => x.id === "drop");
  const hits = sch.perTrack.get("vox");
  assert.ok(hits.length === drop.beats / 4 && hits.every((e) => e.note[0] === 60), "the one-shot fires from its notes in the drop");
  assert.ok(sch.clipSpans.some((c) => c.trackId === "brk" && c.startBeat === drop.startBeat), "the loop runs as a span");
  const clips = new Map([[sampleKey("vocal_hey_abm_124"), "BUF"], ["clip_x", "UPLOAD"]]);
  assert.equal(clipBuffer(clips, vox.clip), "BUF");
  assert.equal(clipBuffer(clips, { clipId: "clip_x", name: "u" }), "UPLOAD");
  assert.equal(clipBuffer(clips, undefined), undefined);
  const m = migrateSong(JSON.parse(JSON.stringify(song)));
  assert.equal(m.kit, "starter"); assert.equal(m.tracks.find((t) => t.id === "vox").clip.sampleId, "vocal_hey_abm_124");
  assert.ok(diffSongs(s, song).includes("kit synth→starter"));
});

test("local intents: real drums, synth drums, named kits", () => {
  const s = seed();
  const kitOf = (text, song = s) => localIntent(text, song)?.ops?.find((o) => o.op === "set" && o.track === "song" && o.path === "kit")?.value;
  assert.equal(kitOf("use real drums"), "starter");
  assert.equal(kitOf("use the samples"), "starter");
  assert.equal(kitOf("switch to the sampled kit"), "starter");
  assert.equal(kitOf("back to synth drums"), "synth");
  assert.equal(kitOf("go back to the synth kit"), "synth");
  assert.equal(kitOf("use the 808 kit"), "starter-808");
  assert.equal(kitOf("try the acoustic drums"), "starter-acoustic");
  assert.equal(kitOf("use real drums", SEED_HARD_HOUSE), "starter-hard", "hard-house gets the hard kit");
  assert.equal(localIntent("use real drums", s).say, "Real drums are on.");
  assert.equal(localIntent("make the drums real and punchy", s), null, "vaguer asks go to the brain");
  assert.equal(localIntent("use real drums on the drop only", s), null);
});

test("attribution: credits list every library sound the song uses; CC0 needs no sidecar, CC BY does", () => {
  const s = seed();
  assert.equal(usesSamples(s), false);
  const { song } = applyOps(s, [
    { op: "addTrack", track: { id: "vox", role: "audio", volume: -4, notes: [[60, 1.5, 0.5, 110]], clip: { sampleId: "vocal_hey_abm_124" } } },
    { op: "set", track: "song", path: "kit", value: "starter" },
  ]);
  assert.equal(usesSamples(song), true);
  const c = creditsFor(song, manifest);
  const ids = c.entries.map((e) => e.id);
  assert.ok(ids.includes("vocal_hey_abm_124") && ids.includes("kick_house") && ids.includes("clap_solo") && ids.includes("hat_closed_clean"));
  assert.ok(!ids.includes("snare_dub"), "the seed has no snare track, so the kit snare is not credited");
  assert.equal(c.required, false);
  assert.ok(c.text.includes("Sung: Hey") && c.text.includes("https://") && c.text.includes("no credit required"));
  assert.ok(!/[—–]/.test(c.text), "no em or en dashes in user-facing text");
  const by = clone(manifest);
  const v = by.samples.find((x) => x.id === "vocal_hey_abm_124"); v.license = "CC BY 4.0"; v.attribution = '"Hey" by Producer Space (https://example.org/hey) licensed under CC BY 4.0';
  const c2 = creditsFor(song, by);
  assert.equal(c2.required, true); assert.ok(attributionRequired(c2.entries));
  assert.ok(c2.text.includes("Credit lines to publish with the song:") && c2.text.includes("licensed under CC BY 4.0"));
  assert.equal(creditsFileName(song), "GLOW-credits.txt");
  assert.equal(creditsFor(s, manifest).entries.length, 0);
});

test("the contract lists the library for the brain", () => {
  assert.ok(CONTRACT.includes("## SAMPLES AVAILABLE"));
  assert.ok(CONTRACT.includes('"kit"?: "synth"|"starter"'));
  assert.ok(CONTRACT.includes('"sampleId"?'));
  assert.ok(SAMPLES_BLOCK.includes("starter-hard (hard-house)"));
  assert.ok(SAMPLES_BLOCK.includes('vocal_hey_abm_124 "Sung: Hey" 0.9s 124bpm Ab minor'));
  assert.ok(SAMPLES_BLOCK.includes('loop_breakbeat_126 "Breakbeat, 1 bar at 126" 1.9s 126bpm'));
  assert.equal(samplesForBrain(manifest), SAMPLES_BLOCK);
  assert.ok(SAMPLES_BLOCK.length < 4000, `listing is compact (${SAMPLES_BLOCK.length} chars)`);
});
