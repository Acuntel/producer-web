// Analyze a record: a link or an uploaded file becomes a job for the stems worker.
// POST creates the job (signed-in users only; uploads must live under their own
// folder) and hands it to the worker. GET polls one job.
import { supabaseAdmin, userFromRequest } from "@/lib/account/supabase";

export const maxDuration = 30;

export async function POST(req: Request) {
  const user = await userFromRequest(req);
  const admin = supabaseAdmin();
  if (!user || !admin) return Response.json({ error: "Sign in to analyze a record." }, { status: 401 });
  const worker = process.env.STEMS_WORKER_URL, secret = process.env.STEMS_WORKER_SECRET;
  if (!worker || !secret) return Response.json({ error: "The analysis worker is not configured yet." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { url?: string; storagePath?: string; name?: string; projectId?: string | null };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
  if (!url && !storagePath) return Response.json({ error: "Paste a link or upload a file." }, { status: 400 });
  if (url && process.env.ALLOW_LINK_DOWNLOAD !== "1") return Response.json({ error: "Links are not downloaded server-side. Upload the file, or capture what is playing in your browser." }, { status: 400 });
  if (url && !/^https?:\/\/\S+$/i.test(url)) return Response.json({ error: "That does not look like a link." }, { status: 400 });
  if (storagePath && !storagePath.startsWith(`${user.id}/`)) return Response.json({ error: "That file is not yours." }, { status: 403 });
  const source = { url: url || undefined, storage_path: storagePath || undefined, name: body.name?.slice(0, 120) };
  const { data: job, error } = await admin.from("jobs").insert({ owner: user.id, project_id: body.projectId ?? null, kind: "stems", source, status: "queued" }).select("id").single();
  if (error || !job) return Response.json({ error: error?.message ?? "could not create the job" }, { status: 500 });
  try {
    const r = await fetch(`${worker.replace(/\/$/, "")}/jobs`, { method: "POST", headers: { "Content-Type": "application/json", "X-Worker-Secret": secret }, body: JSON.stringify({ job_id: job.id, owner: user.id, project_id: body.projectId ?? null, source }) });
    if (!r.ok) throw new Error(`worker ${r.status}`);
  } catch (e) {
    await admin.from("jobs").update({ status: "error", error: e instanceof Error ? e.message : "worker unreachable" }).eq("id", job.id);
    return Response.json({ error: "The analysis worker did not answer. Try again in a minute." }, { status: 502 });
  }
  return Response.json({ jobId: job.id });
}

export async function GET(req: Request) {
  const user = await userFromRequest(req);
  const admin = supabaseAdmin();
  if (!user || !admin) return Response.json({ error: "not signed in" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const { data, error } = await admin.from("jobs").select("id, status, progress, result, error, source, created_at").eq("id", id).eq("owner", user.id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "no such job" }, { status: 404 });
  return Response.json(data);
}
