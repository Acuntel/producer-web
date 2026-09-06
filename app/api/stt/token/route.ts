// A short-lived token for the realtime speech engine, so the browser never sees the ElevenLabs key.
import { userElevenLabsKey } from "@/lib/account/keys";

export const maxDuration = 10;

export async function POST(req: Request) {
  const key = (await userElevenLabsKey(req).catch(() => null)) ?? process.env.ELEVENLABS_API_KEY;
  if (!key) return Response.json({ error: "no speech engine configured" }, { status: 503 });
  try {
    let r = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", { method: "POST", headers: { "xi-api-key": key } });
    if (!r.ok) r = await fetch("https://api.elevenlabs.io/v1/speech-to-text/get-realtime-token", { method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ model_id: "scribe_v2_realtime", ttl_secs: 900 }) });
    if (!r.ok) return Response.json({ error: `speech engine ${r.status}` }, { status: 502 });
    const j = (await r.json()) as { token?: string };
    if (!j.token) return Response.json({ error: "no token" }, { status: 502 });
    return Response.json({ token: j.token, model: "scribe_v2_realtime" }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 502 }); }
}
