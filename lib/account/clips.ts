// The clip vault. A record is its song document plus the audio that document names, and until
// now that audio lived only in the browser that made it: a record opened anywhere else played
// silence where an upload, a stem or a grab should have been. Every clip a record references is
// registered here by the same key the song carries, so the record can always be made whole again.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Song } from "@/lib/song/types";
import { clipKeysFor } from "@/lib/engine";

export type ClipRow = { id: string; clip_key: string; name: string; storage_path: string; mime: string | null; duration_sec: number | null; bpm: number | null; key: string | null; bytes: number | null };
export type ClipMetaIn = { durationSec?: number; bpm?: number; key?: string; mime?: string; bytes?: number };

const COLS = "id, clip_key, name, storage_path, mime, duration_sec, bpm, key, bytes";
/** Library samples ship with the app and are never a user's to keep. */
export const needsVault = (key: string) => !key.startsWith("sample:");
/** The audio a record cannot be played without. */
export const vaultKeysOf = (song: Song) => clipKeysFor(song).filter(needsVault);

const rowOf = (key: string, name: string, path: string, m: ClipMetaIn) => ({
  clip_key: key, name: name.slice(0, 200), storage_path: path,
  mime: m.mime ?? null, duration_sec: m.durationSec ?? null, bpm: m.bpm ?? null, key: m.key ?? null, bytes: m.bytes ?? null,
});

/** Which of these keys the account already holds. */
export async function findClips(sb: SupabaseClient, keys: string[]): Promise<Map<string, ClipRow>> {
  const out = new Map<string, ClipRow>();
  for (let i = 0; i < keys.length; i += 80) {
    const { data } = await sb.from("clips").select(COLS).in("clip_key", keys.slice(i, i + 80));
    for (const r of (data ?? []) as ClipRow[]) if (r.clip_key) out.set(r.clip_key, r);
  }
  return out;
}

/** The bytes are already in storage (a stem, a one shot, an analysed upload): just record where. */
export async function registerClip(sb: SupabaseClient, owner: string, projectId: string | null, key: string, name: string, path: string, meta: ClipMetaIn = {}): Promise<void> {
  await sb.from("clips").upsert({ owner, project_id: projectId, ...rowOf(key, name, path, meta) }, { onConflict: "owner,clip_key" });
}

/** The bytes were made in the browser (an upload, a recording, a grab): put them somewhere they survive. */
export async function mirrorClip(sb: SupabaseClient, owner: string, projectId: string | null, key: string, name: string, bytes: ArrayBuffer, meta: ClipMetaIn = {}): Promise<string | null> {
  const path = `${owner}/vault/${key.replace(/[^a-zA-Z0-9._:-]/g, "_")}`;
  const { error } = await sb.storage.from("clips").upload(path, bytes, { contentType: meta.mime ?? "audio/wav", upsert: true });
  if (error) return null;
  await registerClip(sb, owner, projectId, key, name, path, { ...meta, bytes: bytes.byteLength });
  return path;
}

/** The bytes back out, for a record opened on a machine that has never seen them. */
export async function fetchClip(sb: SupabaseClient, row: ClipRow): Promise<ArrayBuffer | null> {
  const { data } = await sb.storage.from("clips").createSignedUrl(row.storage_path, 600);
  if (!data?.signedUrl) return null;
  try { const r = await fetch(data.signedUrl); return r.ok ? await r.arrayBuffer() : null; } catch { return null; }
}
