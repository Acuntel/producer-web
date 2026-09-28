// The producer going and learning, by itself, from the website.
//
// The store knows what a hundred thousand records ARE, from tags and charts. It knows what almost
// none of them SOUND like, because hearing one means separating it and listening. This is the lane
// that closes that: pick famous records the studio has never heard, send them through the same
// worker a person's own record goes through, and keep the DNA. Nothing is downloaded to stay:
// the job goes out with learn: true, so the worker separates and listens in its own scratch space,
// uploads no stem, one-shot or vocal, registers no clip, and keeps only the numbers (facts, hearing,
// vocal map, the vocal placement rows), which is the line docs/MASTERPROMPT_PRODUCER.md section 7 draws.
// The chart's family rides along so the placement rows file under the SOURCE record's family.
import { supabaseAdmin, userFromRequest } from "@/lib/account/supabase";
import { familiesIn, yearIn } from "@/lib/brain/families";
import { rememberHeard, type JobResult } from "@/lib/dna/heard";

export const maxDuration = 60;

const MAX = 20;
type Pick = { artist: string; title: string; chart: string | null; year: number | null; position: number | null };

export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return Response.json({ ok: false, error: "sign in" }, { status: 401 });
  const admin = supabaseAdmin();
  if (!admin) return Response.json({ ok: false, error: "no admin" }, { status: 503 });
  const worker = process.env.STEMS_WORKER_URL, secret = process.env.STEMS_WORKER_SECRET;
  if (!worker || !secret) return Response.json({ ok: false, error: "the worker is not configured" }, { status: 503 });
  // Learning hears public copies the same way a person's "pull that record in" does, so it answers
  // to the same switch. One control, not two.
  if (process.env.ALLOW_LINK_DOWNLOAD !== "1") return Response.json({ ok: false, error: "This studio is not set up to fetch records by name." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { what?: string; count?: number };
  const what = (body.what ?? "").slice(0, 160);
  const count = Math.max(1, Math.min(MAX, Math.floor(body.count ?? 6)));
  const families = familiesIn(what);
  const year = yearIn(what);

  // The famous end of whatever they named, most recent and highest placed first.
  let q = admin.from("dna_charts").select("artist, title, artist_norm, title_norm, chart, year, position, store_family").not("artist", "is", null).not("title", "is", null);
  if (families.length) q = q.in("store_family", families);
  if (year) q = q.eq("year", year);
  const { data: rows, error } = await q.order("position", { ascending: true }).order("year", { ascending: false }).limit(count * 8);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const candidates = (rows ?? []) as (Pick & { artist_norm: string; title_norm: string })[];
  if (!candidates.length) return Response.json({ ok: true, started: [], pool: 0, note: `The charts hold nothing for ${what || "that"} yet.` });

  // Never learn the same record twice, and never two copies of the same record in one run.
  // The asking is what is remembered, under the name the chart uses: a record comes back from the ears
  // under the name the recognition service knows, which is not the name the chart printed, so matching
  // the heard rows by name would send the studio after the same record for ever.
  const norms = [...new Set(candidates.map((c) => `${c.artist_norm}|${c.title_norm}`))];
  const heard = new Set<string>();
  const { data: asked } = await admin.from("dna_learned_asks").select("artist_norm, title_norm, ok, tries").in("title_norm", [...new Set(candidates.map((c) => c.title_norm))].slice(0, 200));
  for (const a of (asked ?? []) as { artist_norm: string; title_norm: string; ok: boolean; tries: number }[]) {
    if (a.ok || a.tries >= 2) heard.add(`${a.artist_norm}|${a.title_norm}`);   // heard it, or it cannot be found
  }
  const { data: known } = await admin.from("dna_heard").select("artist_norm, title_norm").in("title_norm", [...new Set(candidates.map((c) => c.title_norm))].slice(0, 200));
  for (const k of (known ?? []) as { artist_norm: string; title_norm: string }[]) heard.add(`${k.artist_norm}|${k.title_norm}`);
  const seen = new Set<string>();
  const picks = candidates.filter((c) => {
    const id = `${c.artist_norm}|${c.title_norm}`;
    if (heard.has(id) || seen.has(id)) return false;
    seen.add(id); return true;
  }).slice(0, count);

  const run = `learn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const started: { jobId: string; artist: string; title: string }[] = [];
  for (const p of picks) {
    const query = `${p.artist} ${p.title}`.replace(/\s+/g, " ").trim().slice(0, 160);
    // The chart knows the family and the year; the ears do not need to guess at what is already written down.
    const source = { query, name: `${p.artist} - ${p.title}`.slice(0, 120), learn: true, run, chart: p.chart, year: p.year, position: p.position, family: (p as Pick & { store_family?: string | null }).store_family ?? null, artist_norm: p.artist_norm, title_norm: p.title_norm };
    const { data: job } = await admin.from("jobs").insert({ owner: user.id, kind: "stems", source, status: "queued" }).select("id").single();
    if (!job) continue;
    try {
      const r = await fetch(`${worker.replace(/\/$/, "")}/jobs`, { method: "POST", headers: { "Content-Type": "application/json", "X-Worker-Secret": secret }, body: JSON.stringify({ job_id: job.id, owner: user.id, kind: "stems", source: { query, name: source.name, learn: true, family: source.family } }) });
      if (!r.ok) throw new Error(`worker ${r.status}`);
      started.push({ jobId: job.id, artist: p.artist, title: p.title });
    } catch (e) {
      await admin.from("jobs").update({ status: "error", error: e instanceof Error ? e.message : "worker unreachable" }).eq("id", job.id);
    }
  }
  return Response.json({ ok: true, run, started, pool: norms.length, families, year, note: started.length ? null : "The worker did not take any of them." });
}

/** How a run is going, and the writing of what it has already learned. Safe to call as often as you like. */
export async function GET(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return Response.json({ ok: false, error: "sign in" }, { status: 401 });
  const admin = supabaseAdmin();
  if (!admin) return Response.json({ ok: false, error: "no admin" }, { status: 503 });
  const run = new URL(req.url).searchParams.get("run");
  const { data } = await admin.from("jobs").select("id, status, progress, result, error, source").eq("owner", user.id).eq("kind", "stems").order("created_at", { ascending: false }).limit(60);
  let jobs = ((data ?? []) as { id: string; status: string; progress: number; result: unknown; error: string | null; source: Record<string, unknown> }[]).filter((j) => j.source?.learn === true);
  if (run) jobs = jobs.filter((j) => j.source?.run === run);
  else if (jobs.length) { const latest = jobs[0].source?.run; jobs = jobs.filter((j) => j.source?.run === latest); }

  const learned: { title: string; artist: string | null; tempo: number | null; family: string | null }[] = [];
  for (const j of jobs) {
    const askedAs = { artist_norm: j.source?.artist_norm as string | undefined, title_norm: j.source?.title_norm as string | undefined };
    if (j.status === "error" && j.source?.learned !== true && askedAs.artist_norm && askedAs.title_norm) {
      // A record that could not be found is remembered too, so the studio does not chase it for ever.
      const { data: prior } = await admin.from("dna_learned_asks").select("tries").eq("artist_norm", askedAs.artist_norm).eq("title_norm", askedAs.title_norm).maybeSingle();
      await admin.from("dna_learned_asks").upsert({ ...askedAs, ok: false, tries: ((prior as { tries?: number } | null)?.tries ?? 0) + 1, last_error: (j.error ?? "").slice(0, 200), last_try: new Date().toISOString() }, { onConflict: "artist_norm,title_norm" });
      await admin.from("jobs").update({ source: { ...j.source, learned: true } }).eq("id", j.id);
      continue;
    }
    if (j.status !== "done" || j.source?.learned === true) continue;
    const out = await rememberHeard(admin, j.result as JobResult, j.id, { family: (j.source?.family as string | null) ?? null, year: (j.source?.year as number | null) ?? null });
    if (askedAs.artist_norm && askedAs.title_norm) {
      await admin.from("dna_learned_asks").upsert({ ...askedAs, heard_key: out.key, ok: out.ok, tries: 1, last_try: new Date().toISOString() }, { onConflict: "artist_norm,title_norm" });
    }
    // Marked on the job, so a second poll never counts the same record twice.
    await admin.from("jobs").update({ source: { ...j.source, learned: true } }).eq("id", j.id);
    if (out.ok) learned.push({ title: out.title ?? String(j.source?.name ?? "a record"), artist: out.artist ?? null, tempo: out.tempo, family: out.dna.family });
  }
  const done = jobs.filter((j) => j.status === "done").length;
  const failed = jobs.filter((j) => j.status === "error").length;
  const { count: total } = await admin.from("dna_heard").select("key", { count: "exact", head: true });
  return Response.json({
    ok: true, run: run ?? (jobs[0]?.source?.run as string | undefined) ?? null,
    records: jobs.length, done, failed, running: jobs.length - done - failed,
    learned, heardInStore: total ?? null,
    names: jobs.map((j) => ({ name: String(j.source?.name ?? ""), status: j.status, error: j.error })),
  });
}
