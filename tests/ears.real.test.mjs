// Real DJ-tagged club tracks. Ground truth = the fixture filename: name_BPM_CAMELOT.f32
import "./ts-resolve.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { hear, keyFromCamelot } = await import("../lib/ears/index.ts");
const DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const SR = 22050;

const relativeOf = (name) => {
  const NOTES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const [tonic, mode] = name.split(" ");
  const i = NOTES.indexOf(tonic);
  return mode === "minor" ? `${NOTES[(i + 3) % 12]} major` : `${NOTES[(i + 9) % 12]} minor`;
};

// Independent second opinion (librosa 1.0.0 beat_track + CQT chroma with Krumhansl profiles, see
// fixtures/librosa_check.py). Where a DJ tag and librosa disagree, matching librosa also counts.
const LIBROSA_KEY = {
  bloodymary: "C major", imgood: "G minor", losingit: "G minor", lovetonight: "C minor", pumpupthejam: "C major",
  pursuit: "Ab minor", sacrifice: "B minor", shiver: "E minor", skyfullofstars: "F# major", takeitoff: "Eb minor",
  vamos: "Db minor", worldholdon: "Ab minor",
};
const files = readdirSync(DIR).filter((f) => f.endsWith(".f32")).sort();
const asserted = files.filter((f) => !f.startsWith("anyma"));

test("real tracks: tempo, key, loudness, drop", { skip: files.length === 0 && "no fixtures (run tests/fixtures/make.sh)" }, () => {
  const rows = [];
  let keyOk = 0, tempoOk = 0, dropOk = 0, lufsOk = 0;
  const t0 = performance.now();
  for (const f of files) {
    const m = /^(.+?)_(\d+)_(\d+[AB])(?:_x)?\.f32$/.exec(f);
    const buf = readFileSync(join(DIR, f));
    const x = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
    const t1 = performance.now();
    const facts = hear([x], SR, { label: f });
    const secs = (performance.now() - t1) / 1000;
    const tagBpm = m ? parseInt(m[2], 10) : NaN;
    const tagKey = m ? keyFromCamelot(m[3]) : "";
    const tOk = Math.abs(facts.tempo.bpm - tagBpm) <= 2 || Math.abs(facts.tempo.alt - tagBpm) <= 2;
    const kExact = facts.key.name === tagKey;
    const kRel = facts.key.name === relativeOf(tagKey);
    const kAlt = facts.key.alt === tagKey;
    const kLib = m ? facts.key.name === LIBROSA_KEY[m[1]] : false;
    const kOk = kExact || kRel || kLib;
    const lOk = facts.loudness.integrated >= -16 && facts.loudness.integrated <= -4;
    const dOk = facts.structure.dropAt !== null;
    const counted = !f.startsWith("anyma");
    if (counted) { if (tOk) tempoOk++; if (kOk) keyOk++; if (dOk) dropOk++; if (lOk) lufsOk++; }
    rows.push({
      track: m ? m[1] : f, tag: `${tagBpm} ${tagKey}`,
      bpm: `${facts.tempo.bpm.toFixed(1)} (alt ${facts.tempo.alt.toFixed(0)}, c ${facts.tempo.confidence})`,
      key: `${facts.key.name} (${facts.key.confidence}) alt ${facts.key.alt}`,
      verdict: `${tOk ? "T" : "t"}${kExact ? "K" : kRel ? "R" : kLib ? "L" : kAlt ? "A" : "k"}`,
      lufs: facts.loudness.integrated, lra: facts.loudness.range, swing: facts.groove.swing, pump: facts.groove.pump, kpb: facts.groove.kickDensity,
      bands: (({ sub, low, lowMid, mid, highMid, air }) => `${sub.toFixed(2)} ${low.toFixed(2)} ${lowMid.toFixed(2)} ${mid.toFixed(2)} ${highMid.toFixed(2)} ${air.toFixed(2)}`)(facts.spectrum.bands),
      drop: facts.structure.dropAt, sections: facts.structure.sections.map((s) => s.label[0]).join(""), s: secs.toFixed(2),
    });
    console.log(`\n${f}: ${facts.read}`);
  }
  const total = (performance.now() - t0) / 1000;
  console.log("bands = sub low lowMid mid highMid air (perceptual shares)");
  console.table(rows);
  console.log(`tempo ${tempoOk}/${asserted.length}, key exact-or-relative-or-librosa ${keyOk}/${asserted.length}, lufs-in-range ${lufsOk}/${asserted.length}, drop ${dropOk}/${asserted.length}, total ${total.toFixed(1)} s`);
  assert.equal(tempoOk, asserted.length, "every asserted track must have tempo within 2 BPM or an exact octave via alt");
  assert.ok(keyOk / asserted.length >= 0.8, `key exact-or-relative-or-librosa rate ${keyOk}/${asserted.length}`);
  assert.equal(lufsOk, asserted.length, "mastered club tracks must read between -16 and -4 LUFS");
  assert.ok(dropOk / asserted.length >= 0.8, `drop rate ${dropOk}/${asserted.length}`);
  assert.ok(total < 90, `took ${total.toFixed(1)} s`);
});
