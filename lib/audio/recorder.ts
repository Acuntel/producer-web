// The studio's input tap: an AudioWorklet in the studio's own context (public/worklets/recorder.js). The
// talk mic, a hum and a take all come through it, so there is one context, no ScriptProcessor on the main
// thread, and every block carries the audio frame it was heard at, which is what a take is cut by.
// Tone-free. Phase 10 records takes through `recordBetween`.
const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

/** The worklet module, added once per context. */
export function loadRecorder(c: BaseAudioContext): Promise<void> {
  let p = loaded.get(c);
  if (!p) { p = c.audioWorklet.addModule("/worklets/recorder.js"); loaded.set(c, p); p.catch(() => loaded.delete(c)); }
  return p;
}

export type Tap = { stop: () => void; capture: (on: boolean) => void };
type On = { level?: (rms: number) => void; chunk?: (samples: Float32Array, frame: number) => void };

/** Listen to `source` in context `c`: its level on every block, and its samples while capturing. */
export async function tapInput(c: AudioContext, source: AudioNode, on: On, capture = true): Promise<Tap> {
  await loadRecorder(c);
  const node = new AudioWorkletNode(c, "producer-recorder", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: "explicit" });
  // A silent path to the output keeps the node pulled by the graph; it adds nothing to what is heard.
  const sink = c.createGain(); sink.gain.value = 0; node.connect(sink); sink.connect(c.destination);
  node.port.onmessage = (e: MessageEvent<{ frame: number; rms: number; samples: Float32Array | null }>) => { on.level?.(e.data.rms); if (e.data.samples) on.chunk?.(e.data.samples, e.data.frame); };
  node.port.postMessage({ capture });
  source.connect(node);
  return {
    stop: () => { try { source.disconnect(node); } catch { /* gone */ } try { node.disconnect(); sink.disconnect(); node.port.close(); } catch { /* gone */ } },
    capture: (v) => node.port.postMessage({ capture: v }),
  };
}

/** Exactly the samples heard between two audio times (a take on a bar, after its count-in). */
export async function recordBetween(c: AudioContext, source: AudioNode, startTime: number, endTime: number): Promise<Float32Array> {
  const from = Math.round(startTime * c.sampleRate), to = Math.round(endTime * c.sampleRate);
  const out = new Float32Array(Math.max(0, to - from));
  let done: () => void = () => {};
  const finished = new Promise<void>((r) => { done = r; });
  const tap = await tapInput(c, source, {
    chunk: (s, frame) => {
      const a = Math.max(from, frame), b = Math.min(to, frame + s.length);
      if (b > a) out.set(s.subarray(a - frame, b - frame), a - from);
      if (frame + s.length >= to) done();
    },
  });
  await finished; tap.stop();
  return out;
}
