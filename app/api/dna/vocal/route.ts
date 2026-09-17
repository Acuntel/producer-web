// Where a voice sits before a drop, learned from records rather than guessed at.
//
// The browser already has the isolated vocal of every record the studio pulls in, and the worker
// already found where that record's drop is. POST hands over the phrases it measured; the row that
// comes out says how long before the drop the last word finished. GET answers with the median of
// those rows for a family and a tempo, and that number is what the placement rule uses.
import { supabaseAdmin, userFromRequest } from "@/lib/account/supabase";

export const maxDuration = 15;

type Phrase = { start: number; end: number; score?: number };
type Body = { jobId?: string; family?: string | null; phrases?: Phrase[] };

const median = (xs: number[]) => { if (!xs.length) return null; const a = [...xs].sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; };
const band = (bpm: number | null | undefined) => (bpm && bpm > 0 ? Math.round(bpm / 10) * 10 : null);

export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return Response.json({ ok: false, error: "sign in" }, { status: 401 });
  const admin = supabaseAdmin();
  if (!admin) return Response.json({ ok: false, error: "no admin" }, { status: 503 });
  const { jobId, family, phrases } = (await req.json().catch(() => ({}))) as Body;
  if (!jobId || !Array.isArray(phrases) || !phrases.length) return Response.json({ ok: false, error: "jobId and phrases" }, { status: 400 });
  const { data: job } = await admin.from("jobs").select("id, owner, kind, status, result").eq("id", jobId).eq("owner", user.id).maybeSingle();
  if (!job || job.kind !== "stems" || job.status !== "done") return Response.json({ ok: false, error: "not a finished stems job" }, { status: 400 });
  const res = job.result as { name?: string; facts?: { bpm?: number; dropAt?: number | null }; identity?: { title?: string; artist?: string; key?: string } | null } | null;
  const dropAt = res?.facts?.dropAt ?? null;
  const bpm = res?.facts?.bpm ?? null;
  if (dropAt === null || dropAt === undefined) return Response.json({ ok: true, skipped: "the drop of that record was never found" });

  // The phrase that finishes closest before the drop is the one the record leads in with.
  const before = phrases.filter((p) => p.end <= dropAt + 0.2 && dropAt - p.end < 16).sort((a, b) => b.end - a.end);
  const last = before[0] ?? null;
  const leadSec = last ? Math.max(0, dropAt - last.end) : null;
  const key = res?.identity?.key ? `id:${res.identity.key}` : `job:${jobId}`;
  const row = {
    key, artist: res?.identity?.artist ?? null, title: res?.identity?.title ?? res?.name ?? null,
    family: family ?? null, tempo: bpm, drop_sec: dropAt, phrases: phrases.length,
    lead_in_sec: leadSec, lead_in_beats: leadSec !== null && bpm ? Math.round(leadSec * (bpm / 60) * 100) / 100 : null,
    phrase_sec: last ? Math.round((last.end - last.start) * 100) / 100 : null,
    carries_through: phrases.some((p) => p.start > dropAt),
    measured_at: new Date().toISOString(),
  };
  const { error } = await admin.from("dna_vocal_drops").upsert(row, { onConflict: "key" });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, leadInBeats: row.lead_in_beats, phrases: phrases.length });
}

/** The measured lead in for a family and a tempo, with how many records it rests on. */
export async function GET(req: Request) {
  const admin = supabaseAdmin();
  if (!admin) return Response.json({ leadInBeats: null, records: 0 });
  const url = new URL(req.url);
  const family = url.searchParams.get("family");
  const bpm = Number(url.searchParams.get("bpm")) || null;
  let q = admin.from("dna_vocal_drops").select("lead_in_beats, phrase_sec, tempo, family, carries_through").not("lead_in_beats", "is", null).limit(400);
  if (family) q = q.eq("family", family);
  const { data } = await q;
  let rows = (data ?? []) as { lead_in_beats: number; phrase_sec: number | null; tempo: number | null; carries_through: boolean | null }[];
  // Near this tempo first; if that is too thin to mean anything, the family as a whole answers.
  const near = band(bpm) === null ? rows : rows.filter((r) => r.tempo && Math.abs(r.tempo - (bpm as number)) <= 8);
  if (near.length >= 8) rows = near;
  return Response.json({
    leadInBeats: median(rows.map((r) => r.lead_in_beats)),
    phraseSec: median(rows.map((r) => r.phrase_sec ?? 0).filter((x) => x > 0)),
    carriesThroughShare: rows.length ? Math.round((rows.filter((r) => r.carries_through).length / rows.length) * 100) / 100 : null,
    records: rows.length,
    family: family ?? "all",
  });
}
