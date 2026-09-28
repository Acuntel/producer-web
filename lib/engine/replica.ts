// The room, replayed offline, exactly as the live transport plays it. The ears' render (offline.ts)
// ticks the clock every 128 samples with no lookahead, which is kinder than the room: a value set
// at now() lands on time there and 0 to 100 ms late here. This replica runs the clock the way the
// live context does (a 0.2 s lookahead, a tick every 0.1 s) and pauses the render at every tick,
// so a node disposed or connected at that moment changes the sound at that audio time, not for the
// whole render. What the desk probe measures here is what Brady hears, glitches included.
//
// Why a NATIVE OfflineAudioContext: standardized-audio-context builds the native offline graph in
// one piece when rendering starts, so a change made during a suspend never reaches the audio.
// Tone accepts a native context, and suspend() then works as the spec says.
import * as Tone from "tone";

type Transport = ReturnType<typeof Tone.getTransport>;
type Clock = { _currentTime: number };

export type Replica = {
  ctx: Tone.OfflineContext;
  transport: Transport;
  /** Run code with the replica's context as Tone's global one (node construction reads it). */
  inside: <T>(f: () => T) => T;
  /** Run fn once the audio clock has passed delaySec from now: the replica's wall timer. */
  defer: (delaySec: number, fn: () => void) => void;
  /** The audio clock, in seconds. */
  now: () => number;
};
/** A move made while the record plays, at an audio time in seconds. */
export type ReplicaAction = { at: number; run: () => void };

export async function renderReplica(
  secs: number, sampleRate: number,
  setup: (r: Replica) => void,
  actions: ReplicaAction[] = [],
  opts?: { lookAhead?: number; tick?: number; channels?: number },
): Promise<AudioBuffer> {
  const lookAhead = opts?.lookAhead ?? 0.2;
  const tick = opts?.tick ?? lookAhead / 2;
  const native = new OfflineAudioContext(opts?.channels ?? 2, Math.ceil(secs * sampleRate), sampleRate);
  const live = Tone.getContext();
  const ctx = new Tone.OfflineContext(native as unknown as ConstructorParameters<typeof Tone.OfflineContext>[0]);
  ctx.lookAhead = lookAhead;
  const clock = ctx as unknown as Clock;
  // Live, Context.now() is the audio clock plus the lookahead, and every Tone call without a time
  // (rampTo, a Time with no argument) means that. OfflineContext.now() drops the lookahead, which
  // would make the replica kinder than the room, so the live meaning is put back.
  (ctx as unknown as { now: () => number }).now = () => clock._currentTime + lookAhead;
  const inside = <T>(f: () => T): T => { Tone.setContext(ctx); try { return f(); } finally { Tone.setContext(live); } };
  const pending: { at: number; fn: () => void }[] = [];
  const replica: Replica = {
    ctx, transport: ctx.transport, inside,
    defer: (delaySec, fn) => { pending.push({ at: clock._currentTime + Math.max(0, delaySec), fn }); },
    now: () => clock._currentTime,
  };
  const queue = [...actions].sort((a, b) => a.at - b.at);
  const errors: string[] = [];
  const step = () => {
    clock._currentTime = native.currentTime;
    inside(() => {
      while (queue.length && queue[0].at <= clock._currentTime + 1e-9) queue.shift()!.run();
      for (let i = 0; i < pending.length;) {
        if (pending[i].at <= clock._currentTime + 1e-9) pending.splice(i, 1)[0].fn(); else i++;
      }
      ctx.emit("tick");
    });
  };
  inside(() => setup(replica));
  // A pause at every tick, on a render quantum, the way the live ticker wakes up.
  const quantum = 128 / sampleRate;
  let last = -1;
  for (let t = tick; t < secs - quantum; t += tick) {
    const q = Math.round(t / quantum);
    if (q <= last) continue;
    last = q;
    native.suspend(q * quantum).then(() => { try { step(); } catch (e) { errors.push(String(e)); } return native.resume(); }).catch((e) => errors.push(String(e)));
  }
  step();
  const out = await native.startRendering();
  if (errors.length) throw new Error(`replica: ${errors.slice(0, 3).join(" | ")}`);
  return out;
}
