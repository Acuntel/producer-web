// Every record the studio hears becomes knowledge. When a stems job finishes, the browser posts
// its id here; the server reads the job (owner-checked) and writes what the store keeps. The
// learning lane writes through the same function, so a record learned by the producer and a record
// pulled in by hand leave exactly the same row.
import { supabaseAdmin, userFromRequest } from "@/lib/account/supabase";
import { rememberHeard, type JobResult } from "@/lib/dna/heard";

export const maxDuration = 15;

export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return Response.json({ ok: false, error: "sign in" }, { status: 401 });
  const admin = supabaseAdmin();
  if (!admin) return Response.json({ ok: false, error: "no admin" }, { status: 503 });
  const { jobId } = (await req.json().catch(() => ({}))) as { jobId?: string };
  if (!jobId) return Response.json({ ok: false, error: "jobId" }, { status: 400 });
  const { data: job } = await admin.from("jobs").select("id, owner, kind, status, result").eq("id", jobId).eq("owner", user.id).maybeSingle();
  if (!job || job.kind !== "stems" || job.status !== "done") return Response.json({ ok: false, error: "not a finished stems job" }, { status: 400 });
  const out = await rememberHeard(admin, job.result as JobResult, jobId);
  return Response.json(out, { status: out.ok ? 200 : 500 });
}
