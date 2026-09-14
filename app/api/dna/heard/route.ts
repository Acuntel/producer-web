// Every record the studio hears becomes knowledge. When a stems job finishes, the browser
// posts its id here; the server reads the job (owner-checked), and upserts one dna_heard row:
// identity (when Shazam named it), tempo, key, bars, the energy contour and the hearing report.
// Store rebuilds truncate dna_songs; this table is never truncated, so the store only grows.
import { supabaseAdmin, userFromRequest } from "@/lib/account/supabase";
import { norm } from "@/lib/brain/galton";

export const maxDuration = 15;

type Facts = { bpm?: number; key?: string; bars?: number; name?: string; blocks?: { bar: number; energy: number }[] };
type Identity = { title?: string; artist?: string; year?: string | number; label?: string; isrc?: string; key?: string };

export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return Response.json({ ok: false, error: "sign in" }, { status: 401 });
  const admin = supabaseAdmin();
  if (!admin) return Response.json({ ok: false, error: "no admin" }, { status: 503 });
  const { jobId } = (await req.json().catch(() => ({}))) as { jobId?: string };
  if (!jobId) return Response.json({ ok: false, error: "jobId" }, { status: 400 });
  const { data: job } = await admin.from("jobs").select("id, owner, kind, status, result").eq("id", jobId).eq("owner", user.id).maybeSingle();
  if (!job || job.kind !== "stems" || job.status !== "done") return Response.json({ ok: false, error: "not a finished stems job" }, { status: 400 });
  const res = job.result as { name?: string; facts?: Facts; identity?: Identity | null; hearing?: unknown } | null;
  const f = res?.facts ?? {}; const idn = res?.identity ?? null;
  const title = idn?.title ?? (res?.name ?? f.name ?? "").replace(/^.*?\s-\s/, "") ?? null;
  const artist = idn?.artist ?? ((res?.name ?? f.name ?? "").includes(" - ") ? (res?.name ?? f.name ?? "").split(" - ")[0] : null);
  const key = idn?.key ? `id:${idn.key}` : `name:${norm(`${artist ?? ""} ${title ?? ""}`) || jobId}`;
  const energy = Array.isArray(f.blocks) ? f.blocks.map((b) => Math.round((b.energy ?? 0) * 100) / 100).slice(0, 64) : null;
  const year = idn?.year !== undefined && /^\d{4}$/.test(String(idn.year)) ? Number(idn.year) : null;
  const row = { key, title, artist, artist_norm: norm(artist ?? ""), title_norm: norm(title ?? ""), year, label: idn?.label ?? null, isrc: idn?.isrc ?? null, tempo: f.bpm ?? null, key_name: f.key ?? null, bars: f.bars ?? null, energy_contour: energy, hearing: res?.hearing ?? null, last_heard: new Date().toISOString() };
  const existing = await admin.from("dna_heard").select("heard_count").eq("key", key).maybeSingle();
  const { error } = await admin.from("dna_heard").upsert({ ...row, heard_count: (existing.data?.heard_count ?? 0) + 1 }, { onConflict: "key" });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, key, title, artist, tempo: f.bpm ?? null });
}
