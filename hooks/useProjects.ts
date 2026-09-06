"use client";
// Projects: the cloud library. Every auto-save becomes a version; a new record
// becomes a new project; the first sign-in imports the songs already on this device.
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Song } from "@/lib/song/types";
import { supabaseBrowser } from "@/lib/account/supabase";
import { listProjects, getProject, createProject, saveSnapshot, renameProject, deleteProject, duplicateProject, listVersions, type ProjectCard, type VersionRow, type ChatMsg } from "@/lib/account/projects";
import type { SavedSong } from "@/components/SongsSheet";

const CUR_KEY = "producer.project.v1";
export type SnapshotMeta = { label?: string; newProject?: boolean; facts?: unknown; chat?: ChatMsg[]; blank?: boolean };

type Deps = { user: User | null; loadSong: (s: Song) => Promise<void>; loadChat?: (chat: ChatMsg[], summary: string | null) => void; getSong: () => Song; localLibrary: SavedSong[]; flash: (t: string) => void };

export function useProjects(d: Deps) {
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [current, setCurrent] = useState<{ id: string; title: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const currentRef = useRef<{ id: string; title: string } | null>(null);
  const timer = useRef<number | null>(null);
  const pending = useRef<{ song: Song; meta: SnapshotMeta } | null>(null);
  const importedFor = useRef<string | null>(null);
  const sb = supabaseBrowser();
  const uid = d.user?.id ?? null;

  useEffect(() => { try { const c = JSON.parse(localStorage.getItem(CUR_KEY) ?? "null"); if (c) { setCurrent(c); currentRef.current = c; } } catch {} }, []);
  const setCur = useCallback((c: { id: string; title: string } | null) => { currentRef.current = c; setCurrent(c); try { c ? localStorage.setItem(CUR_KEY, JSON.stringify(c)) : localStorage.removeItem(CUR_KEY); } catch {} }, []);

  const refresh = useCallback(async () => {
    if (!sb || !uid) { setProjects([]); return; }
    setLoading(true);
    try { setProjects(await listProjects(sb)); } catch { /* offline */ } finally { setLoading(false); }
  }, [sb, uid]);

  // First sign-in on a device with songs: bring them along, once, then adopt the current song as a project.
  useEffect(() => {
    if (!sb || !uid || importedFor.current === uid) return;
    importedFor.current = uid;
    (async () => {
      let list: ProjectCard[] = [];
      try { list = await listProjects(sb); } catch { return; }
      if (list.length === 0 && d.localLibrary.length) {
        for (const item of d.localLibrary.slice(0, 30)) { try { await createProject(sb, uid, item.song, undefined, "imported from this device"); } catch {} }
        d.flash(`Brought ${Math.min(30, d.localLibrary.length)} songs into your account`);
        list = await listProjects(sb).catch(() => []);
      }
      setProjects(list);
      const cur = currentRef.current;
      if (cur && list.some((p) => p.id === cur.id)) return;
      const song = d.getSong();
      const match = list.find((p) => p.title === song.title);
      if (match) setCur({ id: match.id, title: match.title });
      else { try { const row = await createProject(sb, uid, song, undefined, "adopted"); setCur({ id: row.id, title: row.title }); setProjects(await listProjects(sb)); } catch {} }
    })();
  }, [sb, uid, d, setCur]);
  useEffect(() => { if (!uid) { setCur(null); setProjects([]); } }, [uid, setCur]);

  const flushSnapshot = useCallback(async () => {
    const p = pending.current; pending.current = null;
    if (!p || !sb || !uid) return;
    setSyncing(true);
    try {
      const cur = currentRef.current;
      if (p.meta.blank) return;   // an empty new session is not a record yet
      if (p.meta.newProject || !cur) {
        const row = await createProject(sb, uid, p.song, p.meta.facts, p.meta.label ?? "new record", p.meta.chat ?? []);
        setCur({ id: row.id, title: row.title });
      } else {
        await saveSnapshot(sb, uid, cur.id, p.song, p.meta.facts, p.meta.label, p.meta.chat);
        if (cur.title !== p.song.title) setCur({ id: cur.id, title: p.song.title });
      }
      setProjects(await listProjects(sb));
    } catch (e) { console.warn("cloud save failed", e instanceof Error ? e.message : e); }
    finally { setSyncing(false); }
  }, [sb, uid, setCur]);

  /** Called by the studio after every local auto-save. Debounced; a new record flushes at once. */
  const snapshot = useCallback((song: Song, meta: SnapshotMeta) => {
    if (!sb || !uid) return;
    const forceNew = meta.newProject || pending.current?.meta.newProject;
    pending.current = { song, meta: { ...meta, newProject: !!forceNew } };
    if (timer.current) window.clearTimeout(timer.current);
    if (forceNew) { void flushSnapshot(); return; }
    timer.current = window.setTimeout(() => void flushSnapshot(), 1500);
  }, [sb, uid, flushSnapshot]);

  const open = useCallback(async (id: string) => {
    if (!sb) return;
    const row = await getProject(sb, id);
    if (!row) { d.flash("That project is gone"); return; }
    if (timer.current) { window.clearTimeout(timer.current); pending.current = null; }
    setCur({ id: row.id, title: row.title });
    d.loadChat?.((row.chat ?? []) as ChatMsg[], row.summary ?? null);
    await d.loadSong(row.song);
  }, [sb, d, setCur]);

  const create = useCallback(async (song: Song) => {
    if (!sb || !uid) return;
    const row = await createProject(sb, uid, song, undefined, "new project", []);
    setCur({ id: row.id, title: row.title });
    d.loadChat?.([], null);
    await d.loadSong(row.song);
    setProjects(await listProjects(sb));
  }, [sb, uid, d, setCur]);

  const rename = useCallback(async (id: string, title: string) => { if (!sb) return; await renameProject(sb, id, title); if (currentRef.current?.id === id) setCur({ id, title }); setProjects(await listProjects(sb)); }, [sb, setCur]);
  const remove = useCallback(async (id: string) => { if (!sb) return; await deleteProject(sb, id); if (currentRef.current?.id === id) setCur(null); setProjects(await listProjects(sb)); }, [sb, setCur]);
  const duplicate = useCallback(async (id: string) => { if (!sb || !uid) return; await duplicateProject(sb, uid, id); setProjects(await listProjects(sb)); }, [sb, uid]);
  const versions = useCallback(async (id: string): Promise<VersionRow[]> => (sb ? listVersions(sb, id) : []), [sb]);
  const openVersion = useCallback(async (v: VersionRow) => { await d.loadSong(v.song); }, [d]);
  /** A brand new session: no record yet; the first real change creates one. */
  const startFresh = useCallback(() => { if (timer.current) { window.clearTimeout(timer.current); pending.current = null; } setCur(null); }, [setCur]);

  return { projects, current, loading, syncing, refresh, snapshot, open, create, rename, remove, duplicate, versions, openVersion, startFresh, signedIn: !!uid };
}
