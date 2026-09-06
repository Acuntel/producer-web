"use client";
// Projects: every record you have made, like a drive. Open, rename, duplicate,
// delete, start a new one. Signed out, the songs on this device are listed instead.
import { useEffect, useMemo, useState } from "react";
import type { Song } from "@/lib/song/types";
import type { ProjectCard } from "@/lib/account/projects";
import { Button, IconButton, Empty } from "./ui";
import { Icon } from "./Icon";
import type { SavedSong, ClipMeta } from "./SongsSheet";

function when(ts: number | string) {
  const t = typeof ts === "string" ? new Date(ts).getTime() : ts;
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ProjectsSheet({
  signedIn, projects, currentId, loading, localLibrary, clips,
  onOpen, onOpenLocal, onNew, onRename, onDelete, onDuplicate, onDownloadLocal, onSignIn, onClose,
}: {
  signedIn: boolean; projects: ProjectCard[]; currentId: string | null; loading: boolean; localLibrary: SavedSong[]; clips: ClipMeta[];
  onOpen: (id: string) => void; onOpenLocal: (s: SavedSong) => void; onNew: () => void;
  onRename: (id: string, title: string) => void; onDelete: (id: string) => void; onDuplicate: (id: string) => void;
  onDownloadLocal: (s: Song) => void; onSignIn: () => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return s ? projects.filter((p) => p.title.toLowerCase().includes(s) || (p.lane ?? "").includes(s)) : projects; }, [projects, q]);
  // Signed in, a device song that already lives in the cloud under the same title is not listed twice.
  const cloudTitles = useMemo(() => new Set(projects.map((p) => p.title)), [projects]);
  const deviceOnly = useMemo(() => (signedIn ? localLibrary.filter((s) => !cloudTitles.has(s.song.title)) : localLibrary), [signedIn, localLibrary, cloudTitles]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Projects" className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="panel flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-3xl sm:max-w-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line/50 px-4 py-3">
          <Icon name="folder" size={18} className="text-ink-3" />
          <h2 className="text-lg font-semibold">Projects</h2>
          {signedIn && <Button tone="accent" icon="plus" className="ml-auto" onClick={onNew}>New project</Button>}
          <IconButton name="close" label="Close" onClick={onClose} size={32} className={signedIn ? "" : "ml-auto"} />
        </div>

        <div className="scroll-y min-h-0 flex-1 px-4 py-3">
          {!signedIn ? (
            <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-s2/60 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">Sign in to keep your projects everywhere.</div>
                <div className="text-xs text-ink-3">Right now your songs live only in this browser.</div>
              </div>
              <Button tone="accent" icon="user" onClick={onSignIn}>Sign in</Button>
            </div>
          ) : (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-line/60 bg-base px-3 py-2 focus-within:border-accent/60">
              <Icon name="search" size={15} className="shrink-0 text-ink-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your projects" aria-label="Search projects" className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none" />
            </div>
          )}

          {signedIn && (loading && projects.length === 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[88px] rounded-2xl" />)}</div>
          ) : shown.length === 0 ? (
            <Empty icon="folder" title={q ? "No project matches that." : "No projects yet."} hint={q ? undefined : "Start the session and make a song. It saves here as you work."} />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {shown.map((p) => (
                <ProjectCardView key={p.id} p={p} current={p.id === currentId} onOpen={() => onOpen(p.id)} onRename={(t) => onRename(p.id, t)} onDelete={() => onDelete(p.id)} onDuplicate={() => onDuplicate(p.id)} />
              ))}
            </ul>
          ))}

          {(!signedIn || deviceOnly.length > 0) && (
            <>
              <h3 className="eyebrow mb-2 mt-5">On this device</h3>
              {deviceOnly.length === 0 ? (
                <Empty icon="library" title="Nothing saved yet" hint="Your songs save automatically as you work." />
              ) : (
                <ul className="space-y-2">
                  {deviceOnly.map((item, i) => (
                    <li key={i} className="flex items-center gap-3 rounded-2xl border border-line/40 bg-s2/60 px-3.5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-ink">{item.song.title}</div>
                        <div className="tnum truncate text-xs text-ink-3">{item.song.bpm} BPM · {item.song.key} · {item.song.tracks.length} tracks · {when(item.savedAt)}</div>
                      </div>
                      <Button tone="ghost" onClick={() => onOpenLocal(item)}>Open</Button>
                      <IconButton name="download" label={`Download ${item.song.title} as WAV`} onClick={() => onDownloadLocal(item.song)} size={32} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {clips.length > 0 && (
            <>
              <h3 className="eyebrow mb-2 mt-5">Sounds</h3>
              <ul className="space-y-1.5">
                {clips.map((c) => (
                  <li key={c.id} className="flex items-center gap-2.5 rounded-xl bg-s2/50 px-3 py-2">
                    <Icon name="waveform" size={15} className="shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.name}</span>
                    <span className="tnum shrink-0 text-xs text-ink-3">{c.bpm ? `${Math.round(c.bpm)} BPM` : ""}{c.key ? ` · ${c.key}` : ""}{c.durationSec ? ` · ${c.durationSec.toFixed(1)}s` : ""}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectCardView({ p, current, onOpen, onRename, onDelete, onDuplicate }: { p: ProjectCard; current: boolean; onOpen: () => void; onRename: (t: string) => void; onDelete: () => void; onDuplicate: () => void }) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(p.title);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setTitle(p.title), [p.title]);

  return (
    <li className={`relative rounded-2xl border px-3.5 py-3 transition-colors ${current ? "border-accent/50 bg-accent/5" : "border-line/40 bg-s2/60 hover:bg-s2"}`}>
      {renaming ? (
        <form onSubmit={(e) => { e.preventDefault(); const t = title.trim(); if (t && t !== p.title) onRename(t.slice(0, 60)); setRenaming(false); }} className="flex gap-2">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Project title" className="min-w-0 flex-1 rounded-lg border border-line/60 bg-base px-2 py-1 text-sm text-ink focus:border-accent/60 focus:outline-none" />
          <Button tone="accent" type="submit">Save</Button>
        </form>
      ) : (
        <button onClick={onOpen} className="block w-full text-left">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">{p.title}</div>
              <div className="tnum mt-0.5 truncate text-xs text-ink-2">{p.bpm ? `${Math.round(Number(p.bpm))} BPM` : ""}{p.key ? ` · ${p.key}` : ""}{p.lane ? ` · ${p.lane.replace(/-/g, " ")}` : ""}</div>
              <div className="tnum mt-0.5 truncate text-xs text-ink-3">{p.tracks} tracks · {p.version_count} {p.version_count === 1 ? "version" : "versions"} · {when(p.updated_at)}{current ? " · open now" : ""}</div>
            </div>
          </div>
        </button>
      )}
      {!renaming && (
        <div className="absolute right-2 top-2">
          <IconButton name="more" label={`Options for ${p.title}`} size={30} onClick={() => setMenu((v) => !v)} />
          {menu && (
            <>
              <button className="fixed inset-0 z-40 cursor-default" aria-hidden onClick={() => { setMenu(false); setConfirm(false); }} />
              <div className="panel absolute right-0 top-9 z-50 w-48 animate-fade-up overflow-hidden rounded-xl p-1">
                <MenuItem icon="edit" label="Rename" onClick={() => { setMenu(false); setRenaming(true); }} />
                <MenuItem icon="copy" label="Duplicate" onClick={() => { setMenu(false); onDuplicate(); }} />
                {confirm ? (
                  <div className="flex items-center gap-1 px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 text-xs text-warn">Delete for good?</span>
                    <Button tone="quiet" onClick={() => { setMenu(false); setConfirm(false); onDelete(); }} className="!h-7 !px-2 text-warn">Yes</Button>
                  </div>
                ) : (
                  <MenuItem icon="trash" label="Delete" onClick={() => setConfirm(true)} tone="warn" />
                )}
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function MenuItem({ icon, label, onClick, tone }: { icon: "edit" | "copy" | "trash"; label: string; onClick: () => void; tone?: "warn" }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-s2 ${tone === "warn" ? "text-warn" : "text-ink"}`}>
      <Icon name={icon} size={15} className="shrink-0 opacity-80" />
      {label}
    </button>
  );
}
