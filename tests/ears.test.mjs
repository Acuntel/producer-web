import "./ts-resolve.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { synth } from "./synth.mjs";

const { hear, compare, keyFromCamelot, describe } = await import("../lib/ears/index.ts");
const SR = 22050;

const near = (a, b, tol) => Math.abs(a - b) <= tol;
const tempoOk = (f, bpm) => near(f.tempo.bpm, bpm, 1.5) || near(f.tempo.alt, bpm, 1.5);

test("126 BPM D minor groove: tempo, key, loudness, pump", () => {
  const dry = hear([synth({ bpm: 126, seconds: 30 })], SR);
  console.log("dry:", dry.read);
  assert.ok(tempoOk(dry, 126), `bpm ${dry.tempo.bpm} alt ${dry.tempo.alt}`);
  assert.ok(near(dry.tempo.bpm, 126, 1.5), `primary bpm should be 126, got ${dry.tempo.bpm}`);
  assert.ok(["D minor", "F major"].includes(dry.key.name), `key ${dry.key.name}`);
  assert.equal(dry.key.tonic, "D", `tonic preferred D, got ${dry.key.name} (alt ${dry.key.alt})`);
  assert.ok(dry.loudness.integrated > -30 && dry.loudness.integrated < -5, `lufs ${dry.loudness.integrated}`);
  assert.ok(dry.groove.kickDensity > 3.4 && dry.groove.kickDensity < 4.6, `kicks/bar ${dry.groove.kickDensity}`);
  const ducked = hear([synth({ bpm: 126, seconds: 30, duck: true })], SR);
  console.log("ducked pump", ducked.groove.pump, "dry pump", dry.groove.pump);
  assert.ok(ducked.groove.pump > 0.1, `pump ${ducked.groove.pump}`);
  assert.ok(ducked.groove.pump > dry.groove.pump + 0.08, "ducking must raise the pump reading");
  assert.ok(dry.read.length > 40 && !dry.read.includes("—"), "read must be prose without em dashes");
});

test("142 BPM F minor variant", () => {
  const f = hear([synth({ bpm: 142, seconds: 30, bassMidi: [41, 44, 48], padMidi: [65, 68, 72] })], SR);
  console.log("142:", f.read);
  assert.ok(near(f.tempo.bpm, 142, 1.5), `bpm ${f.tempo.bpm} alt ${f.tempo.alt}`);
  assert.ok(["F minor", "Ab major"].includes(f.key.name), `key ${f.key.name}`);
  assert.equal(f.key.tonic, "F");
});

test("bright fat-saw timbre still reads D minor (the app's own synth voices)", () => {
  const f = hear([synth({ bpm: 126, seconds: 24, bright: true })], SR, { bpmHint: 126 });
  console.log("bright:", f.key.name, "alt", f.key.alt, "chords", f.chords.progression.join(" "));
  assert.ok(["D minor", "F major"].includes(f.key.name), `key ${f.key.name} (alt ${f.key.alt})`);
  assert.ok(f.chords.progression.length > 0, "chords must not come back empty on a clear Dm groove");
  const g = hear([synth({ bpm: 142, seconds: 24, bright: true, bassMidi: [41, 44, 48], padMidi: [65, 68, 72] })], SR, { bpmHint: 142 });
  console.log("bright F:", g.key.name, "alt", g.key.alt);
  assert.ok(["F minor", "Ab major"].includes(g.key.name), `key ${g.key.name} (alt ${g.key.alt})`);
});

test("bpmHint locks the grid without lying", () => {
  const f = hear([synth({ bpm: 126, seconds: 20 })], SR, { bpmHint: 126 });
  assert.ok(near(f.tempo.bpm, 126, 1), `bpm ${f.tempo.bpm}`);
});

test("quiet intro then loud drop: dropAt near 20 s", () => {
  const f = hear([synth({ bpm: 126, seconds: 40, quietUntil: 20, kickFrom: 20 })], SR);
  console.log("drop:", f.structure.dropAt, f.structure.sections.map((s) => `${s.label}@${s.start}`).join(" "));
  assert.notEqual(f.structure.dropAt, null, "drop must be found");
  assert.ok(near(f.structure.dropAt, 20, 2.5), `dropAt ${f.structure.dropAt}`);
  assert.ok(f.structure.sections[0].label === "intro" || f.structure.sections[0].label === "break", `first section ${f.structure.sections[0].label}`);
  assert.equal(f.structure.sections[0].hasKick, false);
});

test("compare(): signs and key relations", () => {
  const ref = hear([synth({ bpm: 126, seconds: 20 })], SR);
  const quiet = hear([synth({ bpm: 126, seconds: 20, gain: 0.5 })], SR);
  const c = compare(quiet, ref);
  console.log("compare:", c.text);
  assert.ok(c.deltas.lufs < -3 && c.deltas.lufs > -9, `lufs delta ${c.deltas.lufs}`);
  assert.ok(near(c.deltas.tempoRatio, 1, 0.02));
  assert.equal(c.deltas.sameKey, true);
  assert.ok(c.text.includes("louder"));
  const other = hear([synth({ bpm: 126, seconds: 20, bassMidi: [41, 41, 48, 41], padMidi: [65, 69, 72, 77] })], SR); // F major: root and fifth bass, F A C F pad
  const c2 = compare(other, ref);
  console.log("relative:", other.key.name, "vs", ref.key.name, "->", c2.text);
  assert.ok(["F major", "D minor"].includes(other.key.name), `expected F major, got ${other.key.name} (alt ${other.key.alt})`);
  assert.ok(c2.deltas.sameKey || c2.deltas.relativeKey, "D minor and F major are relatives");
  const rel = { ...ref, key: { ...ref.key, name: "F major", tonic: "F", mode: "major" } };
  assert.equal(compare(rel, ref).deltas.relativeKey, true);
});

test("keyFromCamelot table", () => {
  assert.equal(keyFromCamelot("10A"), "B minor");
  assert.equal(keyFromCamelot("8B"), "C major");
  assert.equal(keyFromCamelot("2A"), "Eb minor");
  assert.equal(keyFromCamelot("12A"), "Db minor");
  assert.equal(keyFromCamelot("11A"), "F# minor");
  assert.equal(keyFromCamelot("1A"), "Ab minor");
  assert.equal(keyFromCamelot("7B"), "F major");
  assert.equal(keyFromCamelot("12B"), "E major");
  assert.equal(keyFromCamelot("x"), "");
});

test("describe is deterministic", () => {
  const f = hear([synth({ bpm: 126, seconds: 12 })], SR);
  assert.equal(describe(f), describe(f));
});
