// The producer's voice: ElevenLabs low-latency TTS, streamed back as it is generated.
// format "pcm" returns 16-bit mono PCM at 24 kHz (the client schedules it straight into
// Web Audio, so speech starts within a few hundred milliseconds); anything else is MP3.
// No key = 503, and the client falls back to the browser voice.
import { userElevenLabsKey } from "@/lib/account/keys";

export const maxDuration = 30;

const VOICE = () => process.env.ELEVENLABS_VOICE_ID || "CwhRBWXzGAHq8TQ4Fs17";

// A warm-up with no speech: the landing calls it so the first greeting does not pay for a cold key lookup.
export async function GET(req: Request) {
  await userElevenLabsKey(req).catch(() => null);
  return new Response(null, { status: 204 });
}

export async function POST(req: Request) {
  const key = (await userElevenLabsKey(req).catch(() => null)) ?? process.env.ELEVENLABS_API_KEY;
  if (!key) return new Response("no voice configured", { status: 503 });
  const { text, format } = (await req.json()) as { text?: string; format?: string };
  const clean = (text ?? "").toString().slice(0, 600).trim();
  if (!clean) return new Response("empty", { status: 400 });
  const pcm = format === "pcm";
  const out = pcm ? "pcm_24000" : "mp3_22050_32";
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE()}/stream?output_format=${out}&optimize_streaming_latency=3`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text: clean, model_id: "eleven_flash_v2_5", voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } }),
  });
  if (!r.ok || !r.body) return new Response(`voice error ${r.status}`, { status: 502 });
  return new Response(r.body, { headers: { "Content-Type": pcm ? "audio/pcm; rate=24000" : "audio/mpeg", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
