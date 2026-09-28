// The studio's audio context: a record, not an instrument. Tone's default is the smallest (interactive)
// buffer, and on a busy laptop that is what crackles: the audio thread misses a 3 ms deadline and the
// device plays a hole. A playback-sized buffer rides out a busy audio thread, and a 0.2 s lookahead rides
// out a busy main thread. A spoken change landing 0.2 s later is not heard as late; a crackle is.
// The context itself is the studio's one native context (lib/audio/studio.ts, 44.1 kHz by default), shared
// with the producer's voice and the mic. The one Tone made when it was imported is disposed here, so only
// the studio's context stays open.
import * as Tone from "tone";
import { studioContext } from "../audio/studio";

let ready = false;

/** Make the studio's context Tone's global one, once, before any node or transport exists. Browser only. */
export function ensureStudioContext(): void {
  if (ready || typeof window === "undefined") return;
  ready = true;
  // Tone accepts a native context (its worklet nodes take the native constructor for one).
  Tone.setContext(new Tone.Context({ context: studioContext() as never, latencyHint: "playback", lookAhead: 0.2 }), true);
}

// The reverb's impulse: decaying stereo noise, darkened as it rings (the old Freeverb's damping at 2.8 kHz),
// from a fixed seed so every render of a record is the same. Built once per sample rate. A convolver is
// native and runs off the audio thread's JavaScript; Freeverb was eight AudioWorklets on it.
const impulses = new Map<number, Float32Array[]>();
export function reverbImpulse(sampleRate: number, seconds = 2.4, t60 = 2.1, dampHz = 2800): Float32Array[] {
  const hit = impulses.get(sampleRate); if (hit) return hit;
  const n = Math.round(seconds * sampleRate);
  const k = Math.log(1000) / (t60 * sampleRate);             // -60 dB at t60
  let seed = 0x2f6b1d3;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  const out = [new Float32Array(n), new Float32Array(n)];
  for (const ch of out) {
    let lp = 0;
    for (let i = 0; i < n; i++) {
      // The damping closes as the tail rings: bright at the front, dark at the back, like a room.
      const a = Math.exp((-2 * Math.PI * dampHz * (1 - 0.6 * (i / n))) / sampleRate);
      lp = (1 - a) * rnd() + a * lp;
      ch[i] = lp * Math.exp(-k * i);
    }
  }
  impulses.set(sampleRate, out);
  return out;
}
