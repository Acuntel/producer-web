// Fit and place (masterprompt 5.4 and 5.5), as arithmetic: the voice's pre-render keys, the beat moved to the voice,
// the candidate slots, the anchor on its downbeat with the source's pickup kept, and the ops that land it.
import test from "node:test";
import assert from "node:assert/strict";
import { voiceFit, fitKey, parseFitKey, baseKeyOf, playedClip, fitCost, rateOnto, keyShift, fitOnto, tempoForVoice } from "../lib/song/fit.ts";
import { keyOfClip, clipKeysFor, sourceKeysFor } from "../lib/engine/keys.ts";
import { compileDraft } from "../lib/song/draft.ts";
import { laneDna } from "../lib/song/drafting/sources.ts";
import { planPlacements, placementOps, voiceFromMap, layout, placementWindow } from "../lib/song/place.ts";
import { applyOps } from "../lib/song/ops.ts";

const song = () => compileDraft(laneDna("tech-house"), { songId: "place-test" });

// A made-up record's map (no real lyrics): a chorus line repeated, a verse, a short tag. Times on the source.
function map(bpm = 126, key = "A minor") {
  const beat = 60 / bpm;
  const ph = (id, start, len, text, hookScore, more = {}) => {
    const words = text.split(" ").map((w, i) => ({ w, start: start + 0.1 + i * beat / 2, end: start + 0.1 + (i + 1) * beat / 2, p: 0.9 }));
    return { id, start, end: start + len, loudest: [start, start + len], text, words, notes: words.map((w, i) => ({ start: w.start, end: w.end, midi: [69, 72, 76, 74][i % 4] })),
      keyRelToSource: 0, inKey: 1, section: "verse", repeats: 1, repeatsWords: 1, repeatsMelody: 1, hookScore, sourceBar: 0, sourceBeat: 0,
      pickupBeats: 1, stressOnset: words[Math.min(2, words.length - 1)].start, rmsDb: -20, peakDb: -10, ...more };
  };
  return {
    version: 1, source: { name: "test record", bpm, key, durationSec: 120, grid: "tempo", beatSec: beat, downbeats: [0] },
    words: { model: "x", language: "en", count: 20 }, melody: { model: "pyin" },
    sections: [{ label: "verse", startBar: 0, endBar: 16, start: 0, end: 30, energy: 0.5, low: 0.5 }, { label: "drop", startBar: 16, endBar: 32, start: 30, end: 60, energy: 0.9, low: 0.9 }],
    hook: 2,
    phrases: [
      ph(0, 4, 3.2, "one two three four five six", 0.2),
      ph(1, 9, 3.4, "seven eight nine ten eleven twelve", 0.25),
      ph(2, 31, 2.2, "la la oh la la", 0.88, { section: "drop", repeats: 6, repeatsWords: 6 }),
      ph(3, 40, 0.9, "hey yeah", 0.3, { section: "drop" }),
    ],
  };
}
const voice = (m = map()) => voiceFromMap(m, { name: "Test", clipKey: "stem_job_vocals" });
const beatOf = (s, x, slot, bpm) => { const secs = layout(s); return secs[x.hostIndex].startBeat + x.noteBeat + ((x.anchorInCut / slot.fit.rate) * bpm) / 60; };

test("a voice plays its pre-render: keys by tempo and key, the unmoved voice is its own clip, the vault keeps the source", () => {
  const clip = { clipId: "cut:abc", name: "v", voice: true, oneShot: true, bpm: 120, semitones: 2 };
  const f = voiceFit(clip, 126);
  assert.equal(f.rate, 1.05); assert.equal(f.semitones, 2);
  const k = fitKey("cut:abc", f);
  assert.equal(k, "vocal:cut:abc@1.0500@2.00");
  assert.deepEqual(parseFitKey(k), { base: "cut:abc", rate: 1.05, semitones: 2 });
  assert.equal(baseKeyOf(k), "cut:abc");
  assert.equal(fitKey("cut:abc", { rate: 1, semitones: 0 }), "cut:abc");
  assert.equal(keyOfClip(clip, 126), k);
  assert.equal(keyOfClip({ ...clip, voice: false }, 126), "cut:abc");
  const played = playedClip({ ...clip, startSec: 1.05 }, 126);
  assert.equal(played.semitones, 0); assert.equal(played.warp, false); assert.ok(Math.abs(played.startSec - 1) < 1e-9);
  const s = song(); s.tracks.push({ id: "v", name: "v", role: "audio", volume: 0, loopBeats: 4, notes: [[60, 0, 1, 100]], clip });
  assert.ok(clipKeysFor(s).includes(fitKey("cut:abc", voiceFit(clip, s.bpm))));
  assert.ok(sourceKeysFor(s).includes("cut:abc") && !sourceKeysFor(s).some((x) => x.startsWith("vocal:")));
});

test("the beat moves to the voice: double or half time, 12% and 3 semitones at most, else it does not fit", () => {
  assert.deepEqual(rateOnto(64, 128), { playsAt: 128, rate: 1 });
  assert.equal(tempoForVoice(64, 126), 128);
  assert.equal(keyShift("A minor", "C major"), 0);
  assert.equal(keyShift("A minor", "B minor"), 2);
  assert.ok(fitCost({ rate: 1.12, semitones: 0 }) <= 1.0001);
  assert.ok(fitCost({ rate: 1.2, semitones: 0 }) > 1);
  assert.ok(fitCost({ rate: 1, semitones: 4 }) > 1);
  assert.equal(fitOnto({ bpm: 120, key: "A minor" }, { bpm: 126, key: "A minor" }).fits, true);
  assert.equal(fitOnto({ bpm: 100, key: "A minor" }, { bpm: 126, key: "A minor" }).fits, false);
});

test("the hook lands on the one of both drops with its pickup kept, at -3, 0 and +3 semitones and a tempo 5% away", () => {
  for (const [bpm, key] of [[126, "A minor"], [120, "A minor"], [132.3, "A minor"], [126, "F# minor"], [126, "C minor"]]) {
    const s = song(); s.key = "A minor";
    const slots = planPlacements(voice(map(bpm, key)), s, { seed: "t" });
    const hook = slots.find((x) => x.kind === "drop-hook");
    assert.ok(hook, `a drop-hook slot at ${bpm} ${key}`);
    const drops = layout(s).filter((x) => x.role === "drop");
    assert.equal(hook.instances.length, drops.length);
    hook.instances.forEach((x, i) => {
      assert.equal(x.anchorBeat, drops[i].startBeat);
      assert.ok(Math.abs(beatOf(s, x, hook, s.bpm) - drops[i].startBeat) < 1e-6, "the stressed syllable is on the downbeat");
      assert.ok(x.anchorInCut > 0, "the pickup before the one is kept");
    });
    assert.ok(hook.instances[1]?.double, "the second drop doubles the hook");
    assert.ok(Math.abs(hook.fit.semitones) <= 3 && Math.abs(Math.log(hook.fit.rate)) <= Math.log(1.12) + 1e-9);
  }
});

test("a voice too far from the beat gets no slot (the beat moves instead), and the plan is the same on every reload", () => {
  const s = song();
  assert.equal(planPlacements(voice(map(100, "A minor")), s).length, 0);
  const a = planPlacements(voice(), s, { seed: "same" }).map((x) => `${x.kind}:${x.phrase.id}`);
  const b = planPlacements(voice(), s, { seed: "same" }).map((x) => `${x.kind}:${x.phrase.id}`);
  assert.deepEqual(a, b);
  const kinds = new Set(planPlacements(voice(), s).map((x) => x.kind));
  for (const k of ["drop-hook", "lead-in", "drop-chop"]) assert.ok(kinds.has(k), `a ${k} slot`);
  for (const x of planPlacements(voice(), s)) for (const t of Object.values(x.terms)) assert.ok(Number.isFinite(t));
});

test("the ops land a fitted voice on its bar and take the lead out of its register while it sings", () => {
  const s = song();
  const slot = planPlacements(voice(), s, { seed: "t" }).find((x) => x.kind === "drop-hook");
  const { ops, tracks } = placementOps(slot, voice(), s, slot.instances.map((_, i) => `cut:x${i}`), "vox_t");
  const r = applyOps(s, ops);
  assert.equal(r.skipped.length, 0, r.skipped.join("; "));
  const t = r.song.tracks.find((x) => x.id === tracks[0]);
  assert.equal(t.clip.voice, true);
  assert.ok(Math.abs(s.bpm / t.clip.bpm - slot.fit.rate) < 1e-3);
  const host = layout(r.song)[slot.instances[0].hostIndex];
  assert.ok(r.song.sections.find((x) => x.id === host.id).active.includes(t.id));
  const w = placementWindow(slot, s);
  assert.ok(w.fromBeat <= w.anchorBeat && w.toBeat > w.anchorBeat);
});
