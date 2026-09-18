// A finished hearing, turned into what the store keeps. One record of this shape per record the
// studio has listened to, whether a person asked for it or the producer went and learned it itself.
// Store rebuilds truncate dna_songs; this table is never truncated, so the store only grows.
import type { SupabaseClient } from "@supabase/supabase-js";
import { norm } from "@/lib/brain/norm";
import { keyPcOf, progressionOf, harmonyClass, structureOf, grid16, bass16, syncopationOf, familyFromGenres } from "@/lib/brain/harmony";

export type Facts = { bpm?: number; key?: string; bars?: number; name?: string; dropAt?: number | null; blocks?: { bar: number; energy: number }[] };
export type Identity = { title?: string; artist?: string; year?: string | number; label?: string; isrc?: string; key?: string };
export type Hearing = { drumGrids?: Record<string, string>; bass?: { eighthRhythm?: string; root?: string }; chords?: string[]; blocks?: { level?: number }[]; clap?: { genres?: unknown; descriptors?: unknown } };
export type JobResult = { name?: string; facts?: Facts; identity?: Identity | null; hearing?: Hearing | null } | null;

/** What this record is called in the store: its identity when a name was heard, else its name. */
export function keyOf(res: JobResult, fallback: string): string {
  const idn = res?.identity ?? null;
  if (idn?.key) return `id:${idn.key}`;
  const f = res?.facts ?? {};
  const title = idn?.title ?? (res?.name ?? f.name ?? "").replace(/^.*?\s-\s/, "");
  const artist = idn?.artist ?? ((res?.name ?? f.name ?? "").includes(" - ") ? (res?.name ?? f.name ?? "").split(" - ")[0] : null);
  return `name:${norm(`${artist ?? ""} ${title ?? ""}`) || fallback}`;
}

/** Everything the store learns from one hearing, ready to upsert.
 *  `known.family` wins over the ears' guess: a chart that says a record is house is better evidence
 *  than a genre classifier, which calls a UK Dance number one dubstep. */
export function heardRow(res: JobResult, fallbackKey: string, known?: { family?: string | null; year?: number | null }) {
  const f = res?.facts ?? {}; const idn = res?.identity ?? null;
  const title = idn?.title ?? (res?.name ?? f.name ?? "").replace(/^.*?\s-\s/, "") ?? null;
  const artist = idn?.artist ?? ((res?.name ?? f.name ?? "").includes(" - ") ? (res?.name ?? f.name ?? "").split(" - ")[0] : null);
  const key = keyOf(res, fallbackKey);
  const energy = Array.isArray(f.blocks) ? f.blocks.map((b) => Math.round((b.energy ?? 0) * 100) / 100).slice(0, 64) : null;
  const year = idn?.year !== undefined && /^\d{4}$/.test(String(idn.year)) ? Number(idn.year) : null;
  const h = res?.hearing ?? null; const k = keyPcOf(f.key);
  const progression = h?.chords?.length ? progressionOf(h.chords, f.key) : null;
  const kick = grid16(h?.drumGrids?.kick);
  const descriptors = Array.isArray(h?.clap?.descriptors) ? (h!.clap!.descriptors as unknown[]).slice(0, 4).map((d) => (Array.isArray(d) ? String(d[0]) : String(d))).join(", ") : null;
  // The DNA of the record, from the hearing: the same fields the board's rows carry, so the Hands can quote how it is built.
  const dna = {
    key_pc: k?.pc ?? null, mode: k?.mode ?? null, progression, harmony_class: progression ? harmonyClass(progression) : null, chords: h?.chords?.length ? h.chords.join(" ") : null,
    structure: Array.isArray(f.blocks) ? structureOf(f.blocks) : null,
    kick_grid: kick, snare_grid: grid16(h?.drumGrids?.snare), hat_grid: grid16(h?.drumGrids?.hat), bass_rhythm: bass16(h?.bass?.eighthRhythm), bass_root: h?.bass?.root ?? null, syncopation: syncopationOf(kick),
    energy: Array.isArray(f.blocks) && f.blocks.length ? Math.round((f.blocks.reduce((a, b) => a + (b.energy ?? 0), 0) / f.blocks.length) * 1000) / 1000 : null,
    family: known?.family ?? familyFromGenres(h?.clap?.genres), descriptors,
  };
  return {
    row: { key, title, artist, artist_norm: norm(artist ?? ""), title_norm: norm(title ?? ""), year: year ?? known?.year ?? null, label: idn?.label ?? null, isrc: idn?.isrc ?? null, tempo: f.bpm ?? null, key_name: f.key ?? null, bars: f.bars ?? null, energy_contour: energy, hearing: res?.hearing ?? null, last_heard: new Date().toISOString(), ...dna },
    key, title, artist, dna,
  };
}

/** Write it, counting how many times this record has now been heard. */
export async function rememberHeard(admin: SupabaseClient, res: JobResult, fallbackKey: string, known?: { family?: string | null; year?: number | null }) {
  const { row, key, title, artist, dna } = heardRow(res, fallbackKey, known);
  const existing = await admin.from("dna_heard").select("heard_count").eq("key", key).maybeSingle();
  const { error } = await admin.from("dna_heard").upsert({ ...row, heard_count: (existing.data?.heard_count ?? 0) + 1 }, { onConflict: "key" });
  return { ok: !error, error: error?.message ?? null, key, title, artist, tempo: res?.facts?.bpm ?? null, dna };
}
