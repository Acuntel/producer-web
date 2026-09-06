// Projects in the cloud: one row per record, a version row per auto-save. The
// browser talks to Supabase directly under RLS; the song JSON is the truth.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Song } from "@/lib/song/types";

export type ChatMsg = { role: "user" | "assistant"; content: string };
export type ProjectRow = {
  id: string; title: string; lane: string | null; bpm: number | null; key: string | null;
  song: Song; facts: unknown; chat: ChatMsg[] | null; summary: string | null; version_count: number; created_at: string; updated_at: string; opened_at: string;
};
export type ProjectCard = Omit<ProjectRow, "song" | "facts" | "chat"> & { tracks: number };
export type VersionRow = { id: string; label: string | null; created_at: string; song: Song };

const cardOf = (r: ProjectRow): ProjectCard => ({ id: r.id, title: r.title, lane: r.lane, bpm: r.bpm, key: r.key, summary: r.summary ?? null, version_count: r.version_count, created_at: r.created_at, updated_at: r.updated_at, opened_at: r.opened_at, tracks: r.song?.tracks?.length ?? 0 });
// The producer's one-line memory of a record: its last spoken line, so the next session can pick up there.
export const summaryOf = (chat: ChatMsg[] | null | undefined): string | null => { const last = [...(chat ?? [])].reverse().find((m) => m.role === "assistant"); return last ? last.content.slice(0, 220) : null; };
const meta = (s: Song) => ({ title: s.title, lane: s.lane ?? null, bpm: s.bpm, key: s.key });

export async function listProjects(sb: SupabaseClient): Promise<ProjectCard[]> {
  const { data, error } = await sb.from("projects").select("id, title, lane, bpm, key, song, summary, version_count, created_at, updated_at, opened_at").is("deleted_at", null).order("updated_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data as ProjectRow[]).map(cardOf);
}

export async function getProject(sb: SupabaseClient, id: string): Promise<ProjectRow | null> {
  const { data, error } = await sb.from("projects").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  if (data) void sb.from("projects").update({ opened_at: new Date().toISOString() }).eq("id", id);
  return (data as ProjectRow) ?? null;
}

export async function createProject(sb: SupabaseClient, owner: string, song: Song, facts?: unknown, label = "created", chat: ChatMsg[] = []): Promise<ProjectRow> {
  const { data, error } = await sb.from("projects").insert({ owner, ...meta(song), song, facts: facts ?? null, chat, summary: summaryOf(chat) }).select("*").single();
  if (error) throw error;
  const row = data as ProjectRow;
  await sb.from("versions").insert({ project_id: row.id, owner, song, label, facts: facts ?? null });
  return row;
}

/** Every auto-save: the project's current song moves forward and a version is kept. */
export async function saveSnapshot(sb: SupabaseClient, owner: string, projectId: string, song: Song, facts?: unknown, label?: string, chat?: ChatMsg[]): Promise<void> {
  const { data } = await sb.from("projects").select("version_count").eq("id", projectId).maybeSingle();
  const count = ((data as { version_count?: number } | null)?.version_count ?? 0) + 1;
  const { error } = await sb.from("projects").update({ ...meta(song), song, facts: facts ?? null, version_count: count, ...(chat ? { chat, summary: summaryOf(chat) } : {}) }).eq("id", projectId);
  if (error) throw error;
  await sb.from("versions").insert({ project_id: projectId, owner, song, label: label ?? null, facts: facts ?? null });
}

export async function listVersions(sb: SupabaseClient, projectId: string, limit = 40): Promise<VersionRow[]> {
  const { data, error } = await sb.from("versions").select("id, label, created_at, song").eq("project_id", projectId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data as VersionRow[];
}

export async function renameProject(sb: SupabaseClient, id: string, title: string): Promise<void> {
  const { data } = await sb.from("projects").select("song").eq("id", id).maybeSingle();
  const song = (data as { song: Song } | null)?.song;
  const { error } = await sb.from("projects").update({ title, ...(song ? { song: { ...song, title } } : {}) }).eq("id", id);
  if (error) throw error;
}

export async function deleteProject(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("projects").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function duplicateProject(sb: SupabaseClient, owner: string, id: string): Promise<ProjectRow | null> {
  const src = await getProject(sb, id);
  if (!src) return null;
  const copy = { ...src.song, title: `${src.title} copy`.slice(0, 60) };
  return createProject(sb, owner, copy, src.facts, "duplicated");
}
