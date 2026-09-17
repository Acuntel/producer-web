// hear(), one thread over. The page keeps painting and the transport keeps its lookahead
// while a record is measured. If the worker cannot be had (an old browser, a harness, a
// bundler that will not carry it), the same call runs here and nothing is lost but the smoothness.
import { hear, type HearOptions, type MusicFacts } from "./facts";

type Reply = { id: number; facts?: MusicFacts; error?: string };

let worker: Worker | null = null;
let broken = false;
let seq = 0;
const waiting = new Map<number, (r: Reply) => void>();

function ears(): Worker | null {
  if (broken || typeof Worker === "undefined") return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./hear.worker.ts", import.meta.url));
      worker.onmessage = (e: MessageEvent<Reply>) => { const done = waiting.get(e.data.id); if (done) { waiting.delete(e.data.id); done(e.data); } };
      worker.onerror = () => { broken = true; for (const [id, done] of waiting) { waiting.delete(id); done({ id, error: "worker died" }); } worker = null; };
    } catch { broken = true; worker = null; }
  }
  return worker;
}

/** True once the worker has been built and has not died: the probes report it, nothing depends on it. */
export const workerAlive = () => !!worker && !broken;

export async function hearOffThread(channels: Float32Array[], sampleRate: number, opts: HearOptions = {}): Promise<MusicFacts> {
  const w = ears();
  if (!w) return hear(channels, sampleRate, opts);
  // The channel views belong to an AudioBuffer, so they are copied before being handed over;
  // transferring the originals would detach the buffer the engine is still playing.
  const copies = channels.map((c) => new Float32Array(c).buffer);
  const id = ++seq;
  const reply = await new Promise<Reply>((resolve) => {
    waiting.set(id, resolve);
    try { w.postMessage({ id, channels: copies, sampleRate, opts }, copies); }
    catch { waiting.delete(id); resolve({ id, error: "post failed" }); }
  });
  if (reply.facts) return reply.facts;
  return hear(channels, sampleRate, opts);
}
