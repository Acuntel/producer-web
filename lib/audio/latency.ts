// How late a take is: what the browser reports (output plus base latency plus the track's own), confirmed once per
// device by a loopback click (a click played out, heard back in, cross-correlated) and kept per device, because the
// reported numbers are known to be wrong (Chrome reported a flat 10 ms track latency in Jeff Kaufman's 2021
// measurements; Firefox's outputLatency was under half the real value). Tone-free.
import { recordBetween } from "./recorder";

export type DeviceLatency = { deviceId: string; offsetMs: number; reportedMs: number; measured: boolean; spreadMs: number; at: number };
const KEY = "producer.latency.v1";

/** Seconds the browser says a sound takes out and back in. */
export function reportedLatency(ctx: AudioContext, track?: MediaStreamTrack | null): number {
  const out = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
  const settings = track?.getSettings?.() as (MediaTrackSettings & { latency?: number }) | undefined;
  return out + (typeof settings?.latency === "number" ? settings.latency : 0);
}

export function storedLatency(deviceId: string): DeviceLatency | null {
  try { const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, DeviceLatency>; return all[deviceId] ?? null; } catch { return null; }
}
export function storeLatency(l: DeviceLatency) {
  try { const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, DeviceLatency>; all[l.deviceId] = l; localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* the reported number stands */ }
}

/** A short click: two samples up, then silence, so where it is heard is a sample. */
export function clickBuffer(sampleRate: number): AudioBuffer {
  const b = new AudioBuffer({ length: Math.round(sampleRate * 0.01), numberOfChannels: 1, sampleRate });
  const d = b.getChannelData(0); d[0] = 0.9; d[1] = -0.6;
  return b;
}

/** Play `clicks` clicks into `output` and hear them back on `input`: the median delay, and how much it wandered. Null
 *  when the clicks were not heard (headphones on, the mic muted). */
export async function measureLoopback(ctx: AudioContext, input: AudioNode, output: AudioNode, clicks = 6, gapSec = 0.3): Promise<{ offsetSec: number; spreadSec: number; heard: number } | null> {
  const click = clickBuffer(ctx.sampleRate);
  const t0 = ctx.currentTime + 0.25;
  for (let i = 0; i < clicks; i++) { const s = ctx.createBufferSource(); s.buffer = click; s.connect(output); s.start(t0 + i * gapSec); s.onended = () => s.disconnect(); }
  const rec = await recordBetween(ctx, input, t0 - 0.02, t0 + clicks * gapSec + 0.25);
  const sr = ctx.sampleRate, found: number[] = [];
  for (let i = 0; i < clicks; i++) {
    const a = Math.round((0.02 + i * gapSec) * sr), b = Math.min(rec.length, a + Math.round(0.25 * sr));
    let peak = 0; for (let j = a; j < b; j++) peak = Math.max(peak, Math.abs(rec[j]));
    if (peak < 0.01) continue;
    for (let j = a; j < b; j++) if (Math.abs(rec[j]) >= peak * 0.5) { found.push((j - a) / sr); break; }
  }
  if (found.length < Math.ceil(clicks / 2)) return null;
  const s = [...found].sort((x, y) => x - y), med = s[Math.floor(s.length / 2)];
  return { offsetSec: med, spreadSec: s[s.length - 1] - s[0], heard: found.length };
}
