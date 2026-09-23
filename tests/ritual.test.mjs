// The order of work as ops (lib/song/ritual.ts), the grid a chop is cut on (lib/engine/slice.ts), the patience
// numbers (lib/ritual/patience.ts), the source record's tempo and its confidence (lib/ritual/source.ts), and the
// words that reach them (local intents, the mock voice, the brain's actions).
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps } from "../lib/song/ops.ts";
import { downLevels, upLevels, seedOf, SEED_ID } from "../lib/song/ritual.ts";
import { phraseOnGrid } from "../lib/engine/slice.ts";
import { watchFor, due, hearWords, passesSince, VERDICT_WINDOW_MS, PROMPT_CAP_MS, DEAD_PASSES } from "../lib/ritual/patience.ts";
import { tempoPrior, parseRecordName, sourceLine, earsConfidence, LOW_CONFIDENCE } from "../lib/ritual/source.ts";
import { localIntent } from "../lib/brain/local.ts";
import { mockVoice } from "../lib/brain/mock.ts";
import { normalizeAction } from "../lib/brain/parse.ts";

const blank = () => ({ version: 3, id: "rec_t", title: "Untitled", bpm: 124, key: "A minor", lane: "tech-house", humanize: { swing: 0.54, velVar: 0.1, clapLateMs: 8, seed: 7 }, tracks: [], sections: [{ id: "sketch", name: "Sketch", bars: 8, active: [], fill: "none" }], arrangement: ["sketch"] });
const source = { op: "source", name: "Summer by Calvin Harris", bpm: 128, key: "G major", tempoConfidence: 0.75, keyConfidence: 0.65, from: "store", alt: null };
const clip = (id) => ({ clipId: id, name: id, bpm: 128, startSec: 0, gainDb: 0, durationSec: 3.75 });

test("source sets the grid from the record before anything exists, and refuses a tempo that is not one", () => {
  const { song, applied } = applyOps(blank(), [source]);
  assert.equal(applied, 1);
  assert.equal(song.bpm, 128, "the grid is the record's tempo, not the blank record's 124");
  assert.equal(song.key, "G major");
  assert.deepEqual(song.source, { name: "Summer by Calvin Harris", bpm: 128, tempoConfidence: 0.75, from: "store", alt: null, key: "G major", keyConfidence: 0.65 });
  assert.equal(song.tracks.length, 0, "nothing else exists yet");
  assert.equal(applyOps(blank(), [{ ...source, bpm: 12 }]).applied, 0);
  assert.equal(applyOps(blank(), [{ ...source, name: "" }]).applied, 0);
});

test("chop puts a phrase on its own audio track as a loop on the grid; next swaps what it plays and keeps its fader", () => {
  const chopped = applyOps(applyOps(blank(), [source]).song, [{ op: "chop", clip: clip("chop_a"), beats: 8 }]).song;
  const t = chopped.tracks.find((x) => x.id === SEED_ID);
  assert.ok(t, "the chop is a track");
  assert.equal(t.role, "audio");
  assert.equal(t.loopBeats, 8);
  assert.deepEqual({ oneShot: t.clip.oneShot, warp: t.clip.warp, lengthBeats: t.clip.lengthBeats, bpm: t.clip.bpm }, { oneShot: false, warp: true, lengthBeats: 8, bpm: 128 });
  assert.deepEqual(chopped.sections[0].active, [SEED_ID], "it is alone on the record");
  assert.deepEqual(chopped.loop, { startBar: 1, endBar: 2 }, "the transport loops exactly the phrase's two bars");
  const faded = applyOps(chopped, [{ op: "set", track: SEED_ID, path: "volume", value: -7 }]).song;
  const swapped = applyOps(faded, [{ op: "next", clip: clip("chop_b"), beats: 4 }]).song;
  const s = swapped.tracks.find((x) => x.id === SEED_ID);
  assert.equal(swapped.tracks.length, 1, "next swaps the seed, it does not stack a second one");
  assert.equal(s.clip.clipId, "chop_b", "a different candidate plays");
  assert.equal(s.loopBeats, 4);
  assert.equal(s.volume, -7, "the fader stays where it was");
  assert.deepEqual(swapped.loop, { startBar: 1, endBar: 2 }, "a one bar phrase goes round twice in the smallest loop region, two bars");
  const long = applyOps(swapped, [{ op: "next", clip: clip("chop_c"), beats: 16 }]).song;
  assert.deepEqual(long.loop, { startBar: 1, endBar: 4 }, "the loop follows the new phrase's length");
  assert.equal(applyOps(blank(), [{ op: "chop", clip: { name: "no id" }, beats: 8 }]).applied, 0);
});

test("alone solos the chop and keeps its phrase looping; the beat unsolos everything and never plays at a default tempo", () => {
  const withChop = applyOps(applyOps(blank(), [source]).song, [{ op: "chop", clip: clip("chop_a"), beats: 8 }]).song;
  const alone = applyOps(withChop, [{ op: "alone" }]).song;
  assert.equal(alone.tracks.find((x) => x.id === SEED_ID).solo, true);
  assert.deepEqual(alone.loop, { startBar: 1, endBar: 2 }, "still looping the phrase");
  assert.ok(alone.tracks.filter((t) => t.id !== SEED_ID).every((t) => !t.solo));
  // No source, no beat: the first law refuses a default tempo.
  const noSource = applyOps(blank(), [{ op: "beat" }]);
  assert.equal(noSource.applied, 0);
  assert.equal(noSource.song.tracks.length, 0);
  const beat = applyOps(alone, [{ op: "beat" }]).song;
  assert.equal(beat.bpm, 128, "the beat is at the source tempo");
  assert.deepEqual(beat.tracks.map((t) => t.id).sort(), ["bass", "chop", "clap", "hat", "kick"]);
  assert.ok(beat.tracks.every((t) => !t.solo), "the beat comes to the vocal: everything plays together");
  assert.deepEqual(beat.sections[0].active.sort(), ["bass", "chop", "clap", "hat", "kick"]);
  const kick = beat.tracks.find((t) => t.id === "kick");
  assert.deepEqual(kick.notes.map((n) => n[1]), [0, 1, 2, 3], "four on the floor at 128");
  assert.equal(beat.tracks.find((t) => t.id === "bass").notes[0][0], 43, "the bass sits on G, the source key");
  const slow = applyOps(applyOps(blank(), [{ ...source, bpm: 90, key: "D minor" }]).song, [{ op: "beat" }]).song;
  assert.deepEqual(slow.tracks.find((t) => t.id === "kick").notes.map((n) => n[1]), [0, 1.5, 2.5], "a broken pocket below the dance tempos");
  assert.equal(slow.bpm, 90);
});

test("down pulls every track but the seed ten dB for a listen, and never edits the record", () => {
  const s = applyOps(applyOps(applyOps(blank(), [source]).song, [{ op: "chop", clip: clip("chop_a"), beats: 8 }]).song, [{ op: "beat" }]).song;
  const { keep, levels } = downLevels(s);
  assert.equal(keep, SEED_ID);
  for (const t of s.tracks) assert.equal(levels[t.id], t.id === SEED_ID ? t.volume : t.volume - 10, `${t.id} level`);
  assert.equal(downLevels(s, "bass").levels.bass, s.tracks.find((t) => t.id === "bass").volume, "any one track can be the one kept");
  assert.deepEqual(upLevels(s), Object.fromEntries(s.tracks.map((t) => [t.id, t.volume])));
  const r = applyOps(s, [{ op: "down" }]);
  assert.equal(r.applied, 0, "down is a listen on the graph; as an edit it changes nothing");
  assert.deepEqual(r.song, s);
  assert.equal(seedOf(s).id, SEED_ID);
});

test("a phrase lands on the record's own grid: back to its beat, whole bars long", () => {
  // 128 bpm, first beat at 0.1 s: a line sung from 7.03 s to 9.4 s.
  const g = phraseOnGrid(7.03, 9.4, 128, 0.1);
  const beat = 60 / 128;
  assert.ok(Math.abs((g.startSec - 0.1) / beat - Math.round((g.startSec - 0.1) / beat)) < 1e-9, "the start is on a beat of the record");
  assert.ok(g.startSec <= 7.03 + 0.08 && g.startSec > 7.03 - beat, "the beat at or just before the first word");
  assert.equal(g.bars, 2); assert.equal(g.beats, 8);
  assert.ok(Math.abs(g.lengthSec - 8 * beat) < 1e-9);
  assert.ok(g.startSec + g.lengthSec >= 9.4 - 0.1 * (9.4 - 7.03), "long enough to hold the line");
  // A pickup sung 50 ms early stays with its beat.
  assert.ok(Math.abs(phraseOnGrid(2 * beat - 0.05, 2 * beat + 1, 128).startSec - 2 * beat) < 1e-9);
  assert.equal(phraseOnGrid(1, 1.5, 128).bars, 1);
  assert.equal(phraseOnGrid(0, 20, 128).bars, 4, "four bars at most");
});

test("patience: a verdict prompt at the first pass, never before 8 s and always by 20 s, and a swap after three passes", () => {
  const t0 = 1_000_000;
  const w = watchFor("beat", "m1", t0, 10, 0.2);   // landed a fifth of the way into the loop
  assert.equal(due(w, t0 + 5000, 10), null, "nothing before a pass");
  assert.equal(due(w, t0 + 6000, 11), null, "a pass, but not yet eight seconds");
  assert.equal(due(w, t0 + 9000, 11), "prompt", "the first pass after eight seconds");
  assert.equal(due(w, t0 + PROMPT_CAP_MS, 10), "prompt", "twenty seconds is the latest, even with a long loop");
  assert.ok(PROMPT_CAP_MS < VERDICT_WINDOW_MS, "so the answer can still land inside the thirty seconds");
  const said = hearWords(w, "loop it alone", null, t0 + 3000);
  assert.equal(due(said, t0 + 9000, 11), null, "they are already talking over it: no prompt");
  const liked = hearWords(w, "I kinda like that", "liked", t0 + 12000);
  assert.equal(liked.verdict, "liked"); assert.equal(liked.saidAt, t0 + 12000);
  assert.equal(due(liked, t0 + 60000, 20), null, "a verdict ends the watch");
  assert.equal(hearWords(w, "yes", "liked", t0 + VERDICT_WINDOW_MS + 1).verdict, null, "words after the window judge nothing");
  const prompted = { ...w, promptedAt: t0 + 9000 };
  assert.equal(due(prompted, t0 + 40000, 10 + DEAD_PASSES - 1), null);
  assert.equal(due(prompted, t0 + 40000, 10 + DEAD_PASSES), "swap", "three passes with no verdict");
  assert.equal(due(prompted, t0 + 12000, 10 + DEAD_PASSES + 3), null, "a short loop's passes do not cut its thirty seconds short");
  // Landing late in a loop: that first short trip does not count as a pass.
  const late = watchFor("next", null, t0, 10, 0.8);
  assert.equal(passesSince(late, 11), 0); assert.equal(passesSince(late, 14), 3);
});

test("the source record's tempo carries a confidence, and low confidence is said out loud", () => {
  assert.deepEqual(tempoPrior(128.1, "house"), { bpm: 128, confidence: 0.75, alt: null });
  assert.deepEqual(tempoPrior(64, "house"), { bpm: 128, confidence: 0.45, alt: 64 }, "an octave off the family's home is doubted");
  assert.deepEqual(tempoPrior(92, "hiphop"), { bpm: 92, confidence: 0.75, alt: null });
  assert.deepEqual(parseRecordName("Summer by Calvin Harris"), { artist: "Calvin Harris", title: "Summer" });
  assert.deepEqual(parseRecordName("Calvin Harris - Summer"), { artist: "Calvin Harris", title: "Summer" });
  assert.deepEqual(parseRecordName("the song What's Next"), { artist: null, title: "What's Next" });
  const sure = sourceLine({ found: true, name: "Summer by Calvin Harris", bpm: 128, key: "G major", tempoConfidence: 0.75, keyConfidence: 0.65, from: "store", alt: null });
  assert.match(sure, /Summer by Calvin Harris sits at 128\. The grid is set\. It is in G major\./);
  const unsure = sourceLine({ found: true, name: "X", bpm: 128, key: "Bb minor", tempoConfidence: 0.45, keyConfidence: 0.4, from: "store", alt: 64 });
  assert.match(unsure, /not sure of that\. It could be 64/); assert.match(unsure, /B flat minor, but I would not bet on it/);
  assert.ok(!/[–—]/.test(sure + unsure), "no dashes in spoken copy");
  assert.ok(earsConfidence(0.42, null) >= LOW_CONFIDENCE, "an unfolded worker read is trusted");
  assert.ok(earsConfidence(0.9, 87) < LOW_CONFIDENCE, "a folded octave is said out loud");
  assert.ok(earsConfidence(0.1, null, true) < LOW_CONFIDENCE && earsConfidence(undefined) < LOW_CONFIDENCE);
});

test("the words reach the six: instant local listens, the voice lane's controls, the brain's actions", () => {
  const s = applyOps(applyOps(applyOps(blank(), [source]).song, [{ op: "chop", clip: clip("chop_a"), beats: 8 }]).song, [{ op: "beat" }]).song;
  assert.equal(localIntent("pull it down", s).action.type, "down", "no longer a master nudge");
  assert.equal(localIntent("pull everything down", s).action.type, "down");
  assert.equal(localIntent("next one", s).action.type, "next");
  assert.equal(localIntent("I'm going to go to the next one", s).action.type, "next");
  assert.equal(localIntent("turn it down", s).ops[0].path, "volume", "turn it down is still quieter");
  const v = (t) => mockVoice({ screen: "stage", song: s, paused: false, inflight: [], research: [], localMoves: [], reports: [], messages: [] }, t).control;
  assert.deepEqual(v("What's the tempo of Summer by Calvin Harris?"), { source: { name: "Summer by Calvin Harris" } });
  assert.deepEqual(v("I'm making a chop"), { chop: { at: null, bars: null } });
  assert.deepEqual(v("loop the chop alone"), { alone: true });
  assert.deepEqual(v("Let's go. To the beat."), { beat: true });
  assert.deepEqual(v("go to the next one"), { next: true });
  assert.deepEqual(v("pull everything down, let me hear the vocal"), { down: { keep: null } });
  assert.deepEqual(normalizeAction({ type: "chop", at: 12.5 }), { type: "chop", at: 12.5, section: undefined, bar: undefined, beats: undefined, track: undefined, kind: undefined });
  assert.equal(normalizeAction({ type: "source", query: "Calvin Harris - Summer" }).query, "Calvin Harris - Summer");
  assert.equal(normalizeAction({ type: "down", track: "bass" }).track, "bass");
});
