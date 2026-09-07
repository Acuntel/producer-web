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
  const body = (await req.json().catch(() => ({}))) as { url?: string; storagePath?: string; name?: string; query?: string; projectId?: string | null; kind?: "stems" | "hear" | "tracklist"; stemPaths?: Record<string, string>; fromSec?: number };
  const kind = body.kind === "tracklist" ? "tracklist" : "stems";
  if (body.kind === "hear") {
    // Our own render: the browser rendered the mix and its stem groups; the worker only listens.
    const paths = body.stemPaths ?? {};
    if (!paths.mix || Object.values(paths).some((p) => typeof p !== "string" || !p.startsWith(`${user.id}/`))) return Response.json({ error: "hear needs your own rendered files" }, { status: 400 });
    const { data: job, error } = await admin.from("jobs").insert({ owner: user.id, project_id: body.projectId ?? null, kind: "hear", source: { stem_paths: paths, name: body.name?.slice(0, 120) ?? "our render" }, status: "queued" }).select("id").single();
    if (error || !job) return Response.json({ error: error?.message ?? "could not create the job" }, { status: 500 });
    try {
      const r = await fetch(`${worker.replace(/\/$/, "")}/jobs`, { method: "POST", headers: { "Content-Type": "application/json", "X-Worker-Secret": secret }, body: JSON.stringify({ job_id: job.id, owner: user.id, project_id: body.projectId ?? null, kind: "hear", source: { stem_paths: paths, name: body.name ?? "our render" } }) });
      if (!r.ok) throw new Error(`worker ${r.status}`);
    } catch (e) { await admin.from("jobs").update({ status: "error", error: e instanceof Error ? e.message : "worker unreachable" }).eq("id", job.id); return Response.json({ error: "The analysis worker did not answer." }, { status: 502 }); }
    return Response.json({ jobId: job.id });
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 160) : "";
  if (!url && !storagePath && !query) return Response.json({ error: "Name a record, paste a link, or upload a file." }, { status: 400 });
  if ((url || query) && process.env.ALLOW_LINK_DOWNLOAD !== "1") return Response.json({ error: "Links are not downloaded server-side. Upload the file, or capture what is playing in your browser." }, { status: 400 });
  if (url && !/^https?:\/\/\S+$/i.test(url)) return Response.json({ error: "That does not look like a link." }, { status: 400 });
  if (storagePath && !storagePath.startsWith(`${user.id}/`)) return Response.json({ error: "That file is not yours." }, { status: 403 });
  const fromSec = kind === "tracklist" && typeof body.fromSec === "number" && body.fromSec > 0 ? Math.floor(body.fromSec) : undefined;
  const source = { url: url || undefined, storage_path: storagePath || undefined, query: query || undefined, name: body.name?.slice(0, 120), from_sec: fromSec };
  const { data: job, error } = await admin.from("jobs").insert({ owner: user.id, project_id: body.projectId ?? null, kind, source, status: "queued" }).select("id").single();
  if (error || !job) return Response.json({ error: error?.message ?? "could not create the job" }, { status: 500 });
  try {
    const r = await fetch(`${worker.replace(/\/$/, "")}/jobs`, { method: "POST", headers: { "Content-Type": "application/json", "X-Worker-Secret": secret }, body: JSON.stringify({ job_id: job.id, owner: user.id, project_id: body.projectId ?? null, kind, source }) });
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
  const { data, error } = await admin.from("jobs").select("id, kind, status, progress, result, error, source, created_at").eq("id", id).eq("owner", user.id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "no such job" }, { status: 404 });
  return Response.json(data);
}
