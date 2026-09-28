// The voice's stretch and shift: Signalsmith Stretch (MIT, npm signalsmith-stretch, a WASM AudioWorklet), rendered
// once, offline, into a new buffer, with formants kept so a moved voice still sounds like the singer. The asset store
// calls this for a `vocal:` key (lib/song/fit.ts) and keeps the result like any decoded sound, so a clip, tempo and
// key is rendered once and every later play is a plain buffer at rate 1. Measured in headless Chrome: 4 s of mono
// in 49 to 71 ms, onsets within 3 ms of where the rate puts them at 0.95 to 1.12 and -3 to +3 semitones.
//
// Browser only (it needs an OfflineAudioContext with an audio worklet). Tone-free.
import type { Fit } from "../song/fit";

type StretchNode = AudioWorkletNode & {
  addBuffers: (channels: Float32Array[]) => Promise<number>;
  schedule: (o: Record<string, number | boolean>) => Promise<void>;
};
type Factory = (c: BaseAudioContext, o?: AudioWorkletNodeOptions) => Promise<StretchNode>;

let factory: Promise<Factory> | null = null;
const load = () => (factory ??= import("signalsmith-stretch").then((m) => (m as unknown as { default: Factory }).default));

/** `buf` played `rate` times as fast (0.9 is slower and longer) and `semitones` higher, formants kept. */
export async function stretchBuffer(buf: AudioBuffer, f: Fit): Promise<AudioBuffer> {
  const make = await load();
  const ch = buf.numberOfChannels, sr = buf.sampleRate;
  const length = Math.max(1, Math.ceil((buf.length / f.rate)));
  const ctx = new OfflineAudioContext(ch, length, sr);
  const node = await make(ctx, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [ch] });
  node.connect(ctx.destination);
  const channels: Float32Array[] = [];
  for (let c = 0; c < ch; c++) channels.push(Float32Array.from(buf.getChannelData(c)));
  await node.addBuffers(channels);
  // The voice's own formants stay where they are (formantCompensation), found by the node's pitch tracking.
  await node.schedule({ active: true, output: 0, input: 0, rate: f.rate, semitones: f.semitones, formantCompensation: true, formantBaseHz: 0 });
  const out = await ctx.startRendering();
  node.disconnect();
  return out;
}

/** `buf` at its own speed with its pitch moved by `segments` (from each `at`, in seconds, `semitones` until the next),
 *  formants kept: the tuner's per-note corrections in one pass. The node orders its changes by its own clock, so each
 *  one is handed in while the render is suspended just before it (50 ms ahead, the node's latency to catch up). */
export async function shiftSegments(buf: AudioBuffer, segments: { at: number; semitones: number }[]): Promise<AudioBuffer> {
  if (!segments.length) return buf;
  const make = await load();
  const ch = buf.numberOfChannels, sr = buf.sampleRate;
  const ctx = new OfflineAudioContext(ch, buf.length, sr);
  const node = await make(ctx, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [ch] });
  node.connect(ctx.destination);
  const channels: Float32Array[] = [];
  for (let c = 0; c < ch; c++) channels.push(Float32Array.from(buf.getChannelData(c)));
  await node.addBuffers(channels);
  await node.schedule({ active: true, output: 0, input: 0, rate: 1, semitones: 0, formantCompensation: true, formantBaseHz: 0 });
  const quantum = 128 / sr, used = new Set<number>();
  for (const s of [...segments].sort((a, b) => a.at - b.at)) {
    const q = Math.floor(Math.max(0, s.at - 0.05) / quantum);
    if (used.has(q) || q * quantum >= buf.duration) continue;
    used.add(q);
    void ctx.suspend(q * quantum).then(async () => {
      await node.schedule({ active: true, output: Math.max(q * quantum, s.at), rate: 1, semitones: s.semitones, formantCompensation: true, formantBaseHz: 0 });
      await ctx.resume();
    });
  }
  const out = await ctx.startRendering();
  node.disconnect();
  return out;
}
