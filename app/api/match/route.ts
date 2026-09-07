// Sound search by voice: the user hummed or beatboxed a sound; find the closest ones among
// their own clips (stems, one-shots, slices with embeddings) via the worker's CLAP.
import { supabaseAdmin, userFromRequest } from "@/lib/account/supabase";

export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await userFromRequest(req);
  const admin = supabaseAdmin();
  if (!user || !admin) return Response.json({ error: "Sign in to search sounds by voice." }, { status: 401 });
  const worker = process.env.STEMS_WORKER_URL, secret = process.env.STEMS_WORKER_SECRET;
  if (!worker || !secret) return Response.json({ error: "The analysis worker is not configured yet." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { storagePath?: string };
  const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
  if (!storagePath.startsWith(`${user.id}/`)) return Response.json({ error: "That recording is not yours." }, { status: 403 });
  const { data: rows } = await admin.from("clips").select("id, name, storage_path, duration_sec, source").eq("owner", user.id).order("created_at", { ascending: false }).limit(400);
  const candidates = (rows ?? []).map((r) => ({ id: r.id as string, name: r.name as string, embedding: (r.source as { embedding?: number[] } | null)?.embedding ?? null, storage_path: r.storage_path as string, kind: (r.source as { kind?: string } | null)?.kind, role: (r.source as { role?: string } | null)?.role, duration_sec: r.duration_sec as number | null })).filter((c) => Array.isArray(c.embedding));
  try {
    const r = await fetch(`${worker.replace(/\/$/, "")}/match`, { method: "POST", headers: { "Content-Type": "application/json", "X-Worker-Secret": secret }, body: JSON.stringify({ owner: user.id, storage_path: storagePath, candidates: candidates.map((c) => ({ id: c.id, name: c.name, embedding: c.embedding })) }) });
    if (!r.ok) return Response.json({ error: `worker ${r.status}` }, { status: 502 });
    const j = (await r.json()) as { matches: { id: string; name: string; score: number }[]; contour: string[]; hits: number; durationSec: number };
    const byId = new Map(candidates.map((c) => [c.id, c]));
    return Response.json({ ...j, matches: j.matches.map((m) => ({ ...m, storagePath: byId.get(m.id)?.storage_path, kind: byId.get(m.id)?.kind, role: byId.get(m.id)?.role, durationSec: byId.get(m.id)?.duration_sec })), searched: candidates.length });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "match failed" }, { status: 502 }); }
}
