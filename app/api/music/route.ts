// Real sung vocals: the producer writes the brief, ElevenLabs Music composes a short
// piece on the user's key, the file lands in their library, and the stems worker
// separates the vocal so it can be placed in the record. Signed-in users only.
import { supabaseAdmin, userFromRequest } from "@/lib/account/supabase";
import { userElevenLabsKey } from "@/lib/account/keys";

export const maxDuration = 120;

export async function POST(req: Request) {
  const user = await userFromRequest(req);
  const admin = supabaseAdmin();
  if (!user || !admin) return Response.json({ error: "Sign in to render vocals." }, { status: 401 });
  const key = (await userElevenLabsKey(req).catch(() => null)) ?? process.env.ELEVENLABS_API_KEY;
  if (!key) return Response.json({ error: "No music engine configured." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { prompt?: string; lyrics?: string; lengthMs?: number; bpm?: number; key?: string; instrumental?: boolean };
  const prompt = (body.prompt ?? "").toString().trim().slice(0, 600);
  if (!prompt) return Response.json({ error: "Tell me what the vocal should be." }, { status: 400 });
  const lengthMs = Math.max(3000, Math.min(60000, Math.round(body.lengthMs ?? 12000)));
  const lyrics = (body.lyrics ?? "").toString().trim().slice(0, 1200);
  // One composition plan: a single section carrying the lyrics, styled by the brief, on the song's tempo and key.
  const styles = [prompt, body.bpm ? `${Math.round(body.bpm)} bpm` : "", body.key ? `key of ${body.key}` : "", lyrics ? "lead vocal forward, minimal backing" : ""].filter(Boolean);
  const plan = {
    positive_global_styles: styles,
    negative_global_styles: ["spoken word", "low quality", "distorted vocals", "off key"],
    sections: [{ section_name: "Hook", positive_local_styles: styles.slice(0, 3), negative_local_styles: [], duration_ms: lengthMs, lines: lyrics ? lyrics.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 12) : [] }],
  };
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
      method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: "music_v2", composition_plan: plan, music_length_ms: lengthMs, force_instrumental: !!body.instrumental }),
    });
    if (!r.ok) { const t = await r.text(); return Response.json({ error: `Music engine ${r.status}: ${t.slice(0, 160)}` }, { status: 502 }); }
    const bytes = new Uint8Array(await r.arrayBuffer());
    const name = `Vocal ${prompt.slice(0, 28).replace(/[^\w\s-]/g, "").trim() || "hook"}`;
    const path = `${user.id}/vocals/${Date.now()}-${name.replace(/\s+/g, "-").toLowerCase()}.mp3`;
    const up = await admin.storage.from("clips").upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
    if (up.error) return Response.json({ error: up.error.message }, { status: 500 });
    return Response.json({ storagePath: path, name, lengthMs, bytes: bytes.length });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "music engine error" }, { status: 502 }); }
}
