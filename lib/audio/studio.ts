// The one realtime audio context the studio owns. The record, the producer's voice, the mic and a take
// recorder all run in it, so there is one clock, one device buffer and one final ceiling. It is a plain
// native AudioContext made here, with no Tone in this file, so the landing can hold it (and the voice
// can speak through it) without pulling the engine into the first bundle. The engine hands this same
// context to Tone (lib/engine/context.ts) and disposes the one Tone made on import.
//
// One sample rate: 44,100 Hz by default. A decode measured 375 ms at 44.1 kHz against 1,320 ms at 48 kHz,
// and every sound in the library is 44.1 kHz. `?sr=device` (or localStorage producer.sr = "device") runs at
// the device's own rate instead, for the A/B on Brady's machine; the choice is read once per page.

export const STUDIO_RATE = 44100;
const RATE_KEY = "producer.sr";

let ctx: AudioContext | null = null;
const listeners = new Set<(c: AudioContext) => void>();

/** The rate the studio runs at, or undefined for the device's own rate (the A/B's other side). */
export function studioRate(): number | undefined {
  if (typeof window === "undefined") return STUDIO_RATE;
  try {
    const q = new URLSearchParams(window.location.search).get("sr");
    const pick = q ?? window.localStorage.getItem(RATE_KEY);
    if (pick === "device") return undefined;
    const n = Number(pick);
    if (Number.isFinite(n) && n >= 22050 && n <= 96000) return n;
  } catch { /* storage blocked: the default */ }
  return STUDIO_RATE;
}

/** The studio's context, made on first ask. Browser only. It starts suspended until a press resumes it. */
export function studioContext(): AudioContext {
  if (ctx) return ctx;
  const rate = studioRate();
  const made = new AudioContext(rate ? { latencyHint: "playback", sampleRate: rate } : { latencyHint: "playback" });
  ctx = made;
  for (const l of listeners) { try { l(made); } catch { /* a listener never blocks the context */ } }
  return made;
}

/** The context if it exists yet, without making one. */
export const studioContextIfAny = (): AudioContext | null => ctx;

/** Called once when the context is made (at once if it already is). */
export function onStudioContext(fn: (c: AudioContext) => void): () => void {
  if (ctx) fn(ctx);
  else listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Resume inside a gesture. Safe to call as often as you like. */
export async function resumeStudio(): Promise<void> {
  const c = studioContext();
  if (c.state === "suspended") await c.resume().catch(() => {});
}
