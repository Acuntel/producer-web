// The ears, off the main thread. The render has to happen on the page (only the page has an
// audio context), but the measuring is plain arithmetic over float arrays, and doing it here
// is what keeps the scheduler's hundred millisecond lookahead from starving mid-listen.
import { hear } from "./facts";

type Ask = { id: number; channels: ArrayBuffer[]; sampleRate: number; opts: Parameters<typeof hear>[2] };

self.onmessage = (e: MessageEvent<Ask>) => {
  const { id, channels, sampleRate, opts } = e.data;
  try {
    const facts = hear(channels.map((c) => new Float32Array(c)), sampleRate, opts);
    (self as unknown as Worker).postMessage({ id, facts });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
