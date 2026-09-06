// The real speech engine: ElevenLabs realtime speech to text over a WebSocket.
// The browser mints a short-lived token from our server, streams 16 kHz PCM from
// the mic, and receives partial and committed transcripts. Same handler shape as
// the Web Speech recognizer so the voice loop does not care which one it got.
import type { RecognitionLike, RecognitionError } from "./recognition";

type Handlers = { onInterim: (t: string) => void; onFinal: (t: string) => void; onEnd: () => void; onError?: (kind: RecognitionError, code: string) => void; onStart?: () => void };

let availability: Promise<boolean> | null = null;
/** Once per page: can we get a token? If not, the loop falls back to Web Speech. */
export function scribeAvailable(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (/[?&]stt=webspeech/.test(window.location.search)) return Promise.resolve(false);
  availability ??= fetch("/api/stt/token", { method: "POST" }).then((r) => r.ok).catch(() => false);
  return availability;
}

function downsample(input: Float32Array, inRate: number, outRate: number): Int16Array {
  if (inRate === outRate) { const o = new Int16Array(input.length); for (let i = 0; i < input.length; i++) o[i] = Math.max(-32768, Math.min(32767, Math.round(input[i] * 32767))); return o; }
  const ratio = inRate / outRate; const n = Math.floor(input.length / ratio); const o = new Int16Array(n);
  for (let i = 0; i < n; i++) { const start = Math.floor(i * ratio), end = Math.min(input.length, Math.floor((i + 1) * ratio)); let sum = 0, c = 0; for (let j = start; j < end; j++) { sum += input[j]; c++; } const v = c ? sum / c : 0; o[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767))); }
  return o;
}
const b64 = (a: Int16Array) => { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 0x8000))); return btoa(s); };

export function makeScribeRecognizer(h: Handlers): RecognitionLike {
  let ws: WebSocket | null = null, ctx: AudioContext | null = null, stream: MediaStream | null = null, proc: ScriptProcessorNode | null = null, stopped = false, opened = false;
  const cleanup = () => { try { proc?.disconnect(); } catch {} try { stream?.getTracks().forEach((t) => t.stop()); } catch {} void ctx?.close().catch(() => {}); proc = null; stream = null; ctx = null; };
  const end = () => { if (stopped) return; stopped = true; cleanup(); try { ws?.close(); } catch {} ws = null; h.onEnd(); };
  const rec: RecognitionLike = {
    continuous: true, interimResults: true, lang: "en-US", onresult: null, onend: null, onerror: null,
    start: () => {
      stopped = false;
      (async () => {
        try {
          const tr = await fetch("/api/stt/token", { method: "POST" });
          if (!tr.ok) { h.onError?.(tr.status === 503 ? "unknown" : "network", `token ${tr.status}`); end(); return; }
          const { token } = (await tr.json()) as { token: string };
          console.info("scribe: token ok");
          stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
          if (stopped) { cleanup(); return; }
          ctx = new AudioContext();
          const src = ctx.createMediaStreamSource(stream);
          proc = ctx.createScriptProcessor(4096, 1, 1);
          const inRate = ctx.sampleRate;
          const url = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token=${encodeURIComponent(token)}&audio_format=pcm_16000&commit_strategy=vad&vad_silence_threshold_secs=0.7&min_speech_duration_ms=120&language_code=en&filter_background_audio=true`;
          ws = new WebSocket(url);
          ws.onopen = () => { opened = true; console.info("scribe: ws open"); h.onStart?.(); };
          ws.onmessage = (m) => {
            let d: { message_type?: string; type?: string; text?: string; error?: string; message?: string };
            try { d = JSON.parse(m.data as string); } catch { return; }
            const t = d.message_type ?? d.type ?? "";
            if (t === "session_started") console.info("scribe: session started");
            if (t === "partial_transcript") h.onInterim((d.text ?? "").trim());
            else if (t === "committed_transcript" || t === "committed_transcript_with_timestamps") { const text = (d.text ?? "").trim(); h.onInterim(""); if (text) h.onFinal(text); }
            else if (t === "auth_error") { h.onError?.("unknown", "auth"); end(); }
            else if (t === "quota_exceeded" || t === "rate_limited") { h.onError?.("network", t); end(); }
            else if (t === "error" || t === "input_error") { console.warn("scribe", d.error ?? d.message); }
          };
          ws.onerror = () => { console.warn("scribe: ws error"); h.onError?.("network", "ws"); };
          ws.onclose = (ev) => { console.info("scribe: ws close", ev.code, ev.reason); if (!stopped) end(); };
          let sent = 0;
          proc.onaudioprocess = (e) => {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            if (++sent === 10) { const d = e.inputBuffer.getChannelData(0); let pk = 0; for (let i = 0; i < d.length; i += 16) pk = Math.max(pk, Math.abs(d[i])); console.info("scribe: streaming, mic peak", pk.toFixed(3), "rate", inRate); }
            const pcm = downsample(e.inputBuffer.getChannelData(0), inRate, 16000);
            ws.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: b64(pcm), sample_rate: 16000 }));
          };
          src.connect(proc); proc.connect(ctx.destination);
        } catch (e) {
          const name = e instanceof Error ? e.name : "";
          h.onError?.(name === "NotAllowedError" || name === "SecurityError" ? "blocked" : name === "NotFoundError" ? "nodevice" : "network", name || "start");
          end();
        }
      })();
      void opened;
    },
    stop: () => end(),
    abort: () => end(),
  };
  return rec;
}
