// The free voice: Kokoro 82M running in the browser (Apache weights, MIT library). Used when
// no ElevenLabs key is configured. The model downloads once (about 90 MB at q8) and is
// cached by the browser; WebGPU when the machine has it, WASM otherwise. Loaded lazily so
// the main bundle never carries it.
export type LocalSpeech = { samples: Float32Array; sampleRate: number };

type Kokoro = { generate: (text: string, opts: { voice: string }) => Promise<{ audio: Float32Array; sampling_rate: number }> };
let loading: Promise<Kokoro | null> | null = null;
export const KOKORO_VOICE = "af_heart";

export function kokoroSupported(): boolean {
  return typeof window !== "undefined" && typeof WebAssembly !== "undefined";
}

export function loadKokoro(): Promise<Kokoro | null> {
  if (!kokoroSupported()) return Promise.resolve(null);
  loading ??= (async () => {
    try {
      const mod = await import("kokoro-js");
      const hasGpu = "gpu" in navigator;
      const tts = await mod.KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: hasGpu ? "fp32" : "q8", device: hasGpu ? "webgpu" : "wasm" } as never);
      console.info(`kokoro: loaded (${hasGpu ? "webgpu" : "wasm"})`);
      return tts as unknown as Kokoro;
    } catch (e) { console.warn("kokoro: unavailable", e instanceof Error ? e.message : e); return null; }
  })();
  return loading;
}

export async function speakLocal(text: string): Promise<LocalSpeech | null> {
  const tts = await loadKokoro(); if (!tts) return null;
  try {
    const out = await tts.generate(text, { voice: KOKORO_VOICE });
    return { samples: out.audio, sampleRate: out.sampling_rate };
  } catch (e) { console.warn("kokoro: generate failed", e instanceof Error ? e.message : e); return null; }
}
