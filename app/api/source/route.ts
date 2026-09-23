// The source record's tempo and key, from what the studio already knows: the records its own ears have
// heard first, then the measured catalog (the in-process prints, then the song table). No model and no
// download. A miss says so, and the browser falls back to hearing the record through the stems job.
import { supabaseAdmin } from "@/lib/account/supabase";
import { norm } from "@/lib/brain/norm";
import { findRecord, printOf } from "@/lib/brain/prints";
import { lookupSongs } from "@/lib/brain/galton";
import { parseRecordName, tempoPrior, keyNameOf, KEY_PRIOR, type SourceHit, type SourceMiss } from "@/lib/ritual/source";

export const maxDuration = 15;

type HeardRow = { title: string | null; artist: string | null; tempo: number | null; key_name: string | null; family: string | null };

async function heard(artist: string | null, title: string): Promise<SourceHit | null> {
  const sb = supabaseAdmin(); if (!sb) return null;
  try {
    let q = sb.from("dna_heard").select("title,artist,tempo,key_name,family").ilike("title_norm", `%${norm(title)}%`);
    if (artist) q = q.ilike("artist_norm", `%${norm(artist)}%`);
    const r = await q.order("heard_count", { ascending: false }).limit(1);
    const row = (r.data?.[0] ?? null) as HeardRow | null;
    if (!row?.tempo) return null;
    const t = tempoPrior(row.tempo, row.family);
    return { found: true, name: `${row.title ?? title}${row.artist ? ` by ${row.artist}` : ""}`, bpm: t.bpm, tempoConfidence: t.confidence, alt: t.alt, from: "heard", family: row.family,
      ...(row.key_name ? { key: row.key_name, keyConfidence: KEY_PRIOR } : {}) };
  } catch { return null; }
}

function store(artist: string | null, title: string): SourceHit | null {
  if (!artist) return null;
  const row = findRecord(norm(artist), norm(title));
  if (row === null) return null;
  const p = printOf(row);
  if (!p.tempo) return null;
  const t = tempoPrior(p.tempo, p.family);
  const key = keyNameOf(p.keyPc, p.mode);
  const cleanTitle = p.title.replace(/\s*[([].*?[)\]]\s*/g, " ").trim() || p.title;
  return { found: true, name: `${cleanTitle} by ${p.artist}`, bpm: t.bpm, tempoConfidence: t.confidence, alt: t.alt, from: "store", family: p.family, ...(key ? { key, keyConfidence: KEY_PRIOR } : {}) };
}

async function songs(artist: string | null, title: string): Promise<SourceHit | null> {
  const rows = await lookupSongs(title, artist ?? undefined, 1);
  const s = rows.find((x) => typeof x.tempo === "number" && x.tempo > 0);
  if (!s?.tempo) return null;
  const t = tempoPrior(s.tempo, s.family ?? null);
  const key = keyNameOf(s.key_pc, s.mode);
  return { found: true, name: `${s.title} by ${s.artist}`, bpm: t.bpm, tempoConfidence: t.confidence, alt: t.alt, from: "store", family: s.family ?? null, ...(key ? { key, keyConfidence: KEY_PRIOR } : {}) };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  const name = (body?.name ?? "").toString().trim().slice(0, 160);
  if (!name) return Response.json({ found: false, name } satisfies SourceMiss, { status: 400 });
  const { artist, title } = parseRecordName(name);
  const hit = (await heard(artist, title)) ?? store(artist, title) ?? (await songs(artist, title));
  return Response.json(hit ?? ({ found: false, name } satisfies SourceMiss));
}
