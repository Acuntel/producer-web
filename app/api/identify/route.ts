// What record is this: a short capture or upload (its middle 12 seconds are enough) goes to the
// worker, which names it from the sound: title, artist, ISRC, label, year, position, the DJ's pitch.
import { userFromRequest } from "@/lib/account/supabase";

export const maxDuration = 30;

export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return Response.json({ error: "Sign in to identify a record." }, { status: 401 });
  const worker = process.env.STEMS_WORKER_URL, secret = process.env.STEMS_WORKER_SECRET;
  if (!worker || !secret) return Response.json({ error: "The analysis worker is not configured yet." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { storagePath?: string };
  const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
  if (!storagePath.startsWith(`${user.id}/`)) return Response.json({ error: "That file is not yours." }, { status: 403 });
  try {
    const r = await fetch(`${worker.replace(/\/$/, "")}/identify`, { method: "POST", headers: { "Content-Type": "application/json", "X-Worker-Secret": secret }, body: JSON.stringify({ storage_path: storagePath }) });
    if (!r.ok) throw new Error(`worker ${r.status}`);
    return Response.json(await r.json());
  } catch {
    return Response.json({ error: "The worker did not answer. Try again in a minute." }, { status: 502 });
  }
}
