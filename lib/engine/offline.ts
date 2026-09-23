// The offline render, driven so the record in the room never waits on it.
//
// Tone's own driver (Tone.Offline) builds the whole offline graph in one piece, then runs the
// render's clock on this thread and gives the thread back once per second of audio. On a dense
// record each of those pieces is 100 to 500 ms, far past the live scheduler's lookahead, so the
// record stutters exactly while the studio listens to itself. Here the build is a generator run
// one step at a time, and the clock gives the thread back after a few milliseconds of work.
//
// Why a step can never cross the wires. Tone gives a node the global context at the moment it is
// built. The offline context is made global only inside one synchronous call (one step of the
// build) and the live one is put back in a `finally` before that call returns. JavaScript runs a
// synchronous call to completion, so no live code runs while the offline context is global, and
// no build step runs while the live one is. A generator cannot await, so a step cannot pause
// halfway through with the wrong context current. Tone.Offline, by contrast, keeps the offline
// context global across its whole (possibly awaited) callback.
import * as Tone from "tone";

type Transport = ReturnType<typeof Tone.getTransport>;
// The clock Tone's own renderer drives. Private in its types, so it is checked before it is used,
// and a Tone that changed it falls back to Tone's own render (correct, only less smooth).
type Clock = { _currentTime: number; _duration: number; emit: (event: "tick") => unknown };

const SLICE_MS = 6;   // work done before the thread goes back to the live scheduler

// Give the thread back. A posted message runs after the tasks already queued (the live scheduler's
// tick among them) and, unlike a timer, is never clamped to 4 ms, so the render is not slowed down.
function yieldThread(): Promise<void> {
  return new Promise((resolve) => { const ch = new MessageChannel(); ch.port1.onmessage = () => { ch.port1.close(); resolve(); }; ch.port2.postMessage(0); });
}

/** Render `secs` of audio from a graph that `build` lays on the offline transport, a step at a time. */
export async function renderInSteps(secs: number, channels: number, sampleRate: number, build: (transport: Transport) => Iterator<unknown>): Promise<AudioBuffer> {
  const live = Tone.getContext();
  const ctx = new Tone.OfflineContext(channels, secs, sampleRate);
  const inside = <T>(step: () => T): T => { Tone.setContext(ctx); try { return step(); } finally { Tone.setContext(live); } };
  const steps = inside(() => build(ctx.transport));
  let t0 = performance.now();
  while (!inside(() => steps.next()).done) {
    if (performance.now() - t0 > SLICE_MS) { await yieldThread(); t0 = performance.now(); }
  }
  const clock = ctx as unknown as Clock;
  if (typeof clock._currentTime !== "number" || typeof clock._duration !== "number") return (await ctx.render()).get() as AudioBuffer;
  await (ctx as unknown as { workletsAreReady: () => Promise<void> }).workletsAreReady();
  // Tone's own clock loop, block by block, with the yield on work done rather than on audio made.
  const block = 128 / ctx.sampleRate;
  t0 = performance.now();
  while (clock._duration - clock._currentTime >= 0) {
    clock.emit("tick");
    clock._currentTime += block;
    if (performance.now() - t0 > SLICE_MS) { await yieldThread(); t0 = performance.now(); }
  }
  return (await (ctx.rawContext as unknown as OfflineAudioContext).startRendering()) as AudioBuffer;
}
