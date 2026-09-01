import { test } from "node:test";
import assert from "node:assert/strict";
import { yin, trackPitch, smoothFrames, framesToNotes, hzToMidi } from "../lib/engine/hum.ts";

const sr = 44100;
const tone = (hz, secs, amp = 0.4) => { const n = Math.floor(secs * sr); const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = amp * (Math.sin(2 * Math.PI * hz * i / sr) + 0.3 * Math.sin(2 * Math.PI * 2 * hz * i / sr)); return out; };
const concat = (parts) => { const total = parts.reduce((a, p) => a + p.length, 0); const out = new Float32Array(total); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

test("yin finds the pitch of a harmonic tone", () => {
  for (const hz of [110, 220, 330, 440]) {
    const { hz: got, conf } = yin(tone(hz, 0.1).subarray(0, 2048), sr);
    assert.ok(Math.abs(hzToMidi(got) - hzToMidi(hz)) < 0.3, `${hz} -> ${got}`);
    assert.ok(conf > 0.8);
  }
  assert.equal(yin(new Float32Array(2048), sr).hz, null);
});

test("a hummed phrase becomes quantized notes on the grid", () => {
  const bpm = 120, beat = 0.5; // seconds per beat
  const sig = concat([tone(261.63, beat), tone(329.63, beat), tone(392.0, beat * 2), new Float32Array(Math.floor(beat * sr)), tone(220, beat)]);
  const frames = smoothFrames(trackPitch(sig, sr));
  const notes = framesToNotes(frames, bpm, { loopBeats: 8 });
  const midis = notes.map((n) => n[0]);
  assert.deepEqual(midis, [60, 64, 67, 57], JSON.stringify(notes));
  assert.ok(Math.abs(notes[0][1] - 0) < 0.26 && Math.abs(notes[1][1] - 1) < 0.26 && Math.abs(notes[2][1] - 2) < 0.26 && Math.abs(notes[3][1] - 5) < 0.26);
  assert.ok(notes[2][2] >= 1.5, "the long note is long");
});
