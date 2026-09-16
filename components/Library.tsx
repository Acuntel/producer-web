"use client";
// Everything the account has made, one screen from the stage: each record with its tempo, key, lane, how many
// versions it holds and when it last moved. Open, rename, duplicate, delete, and the versions of a record, by tap
// here or by voice ("open GLOW", "open the library"). Nothing here needs a dialog: a delete asks inline.
import { useEffect, useState } from "react";
import type { ProjectCard, VersionRow } from "@/lib/account/projects";
import type { SavedSong } from "@/lib/types/ui";
import { Icon } from "./Icon";

function when(ts: number | string) {
  const t = typeof ts === "string" ? new Date(ts).getTime() : ts;
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now"; if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60); if (hrs < 24) return `${hrs} hr ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Props = {
  projects: ProjectCard[]; device: SavedSong[]; signedIn: boolean; loading: boolean;
  onOpen: (id: string) => void; onOpenLocal: (s: SavedSong) => void; onNew: () => void; onBack: () => void;
  onRename: (id: string, title: string) => Promise<void>; onDelete: (id: string) => Promise<void>; onDuplicate: (id: string) => Promise<void>;
  versionsOf: (id: string) => Promise<VersionRow[]>; onOpenVersion: (v: VersionRow) => void; onSignIn?: () => void;
};

export function Library({ projects, device, signedIn, loading, onOpen, onOpenLocal, onNew, onBack, onRename, onDelete, onDuplicate, versionsOf, onOpenVersion, onSignIn }: Props) {
  const [q, setQ] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, VersionRow[]>>({});
  useEffect(() => { if (expanded && !versions[expanded]) void versionsOf(expanded).then((v) => setVersions((m) => ({ ...m, [expanded]: v }))); }, [expanded, versions, versionsOf]);
  const needle = q.trim().toLowerCase();
  const shown = projects.filter((p) => !needle || p.title.toLowerCase().includes(needle) || (p.lane ?? "").includes(needle));
  const local = device.filter((s) => !needle || s.song.title.toLowerCase().includes(needle));
  const empty = !loading && shown.length === 0 && local.length === 0;

  return (
    <div className="relative mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col px-4 pb-4 pt-4 sm:px-8 sm:pt-5" data-role="library">
      <header className="flex shrink-0 items-center justify-between gap-3">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-ink-2 transition-colors hover:text-ink" aria-label="Back">
          <span className="mark h-7 w-7" /><span className="hidden sm:inline">The Producer</span>
        </button>
        <h1 className="text-sm font-semibold text-ink">Library</h1>
        <button onClick={onNew} className="rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-ink transition-transform active:scale-95" data-role="library-new">New record</button>
      </header>

      <div className="mt-5 flex shrink-0 items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-s1 px-3 py-2 ring-1 ring-inset ring-line/50 focus-within:ring-accent/60">
          <Icon name="search" size={15} className="shrink-0 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a record" aria-label="Find a record" className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none" />
        </label>
        <span className="tnum shrink-0 text-xs text-ink-3">{projects.length + device.length} {projects.length + device.length === 1 ? "record" : "records"}</span>
      </div>

      <div className="scroll-y mt-4 min-h-0 flex-1">
        {loading && projects.length === 0 && <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}</div>}
        {empty && (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <span className="mark h-12 w-12 opacity-80" />
            <p className="text-lg text-ink">{needle ? "Nothing by that name." : "No records yet."}</p>
            <p className="max-w-[36ch] text-sm text-ink-2">{needle ? "Try another word, or start a new one." : "Start a new record and the producer asks who we are chasing. Every record you make lands here with its versions."}</p>
            {!signedIn && onSignIn && <button onClick={onSignIn} className="mt-1 text-sm font-medium text-live hover:underline">Sign in to keep records everywhere</button>}
          </div>
        )}
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-role="library-list">
          {shown.map((p) => {
            const open = expanded === p.id;
            return (
              <li key={p.id} className="panel rounded-2xl p-3.5">
                <div className="flex items-start gap-3">
                  <button onClick={() => onOpen(p.id)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-s2 text-ink transition-colors hover:bg-live hover:text-accent-ink" aria-label={`Open ${p.title}`}><Icon name="play" size={18} /></button>
                  <div className="min-w-0 flex-1">
                    {renaming === p.id ? (
                      <input autoFocus defaultValue={p.title} aria-label="New name" className="w-full rounded-md bg-s2 px-2 py-1 text-sm font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                        onKeyDown={async (e) => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); if (v) await onRename(p.id, v); setRenaming(null); } if (e.key === "Escape") setRenaming(null); }} onBlur={() => setRenaming(null)} />
                    ) : (
                      <button onClick={() => onOpen(p.id)} className="block w-full truncate text-left text-base font-semibold text-ink">{p.title}</button>
                    )}
                    <p className="tnum mt-0.5 truncate text-xs text-ink-3">{p.bpm ? `${Math.round(Number(p.bpm))} BPM · ` : ""}{p.key ?? ""}{p.lane ? ` · ${p.lane.replace(/-/g, " ")}` : ""} · {p.version_count ?? 1} {(p.version_count ?? 1) === 1 ? "version" : "versions"} · {when(p.updated_at)}</p>
                    {p.summary && <p className="mt-1.5 line-clamp-2 text-xs text-ink-2">{p.summary}</p>}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1 text-xs">
                  <button onClick={() => setExpanded(open ? null : p.id)} className="rounded-full px-2.5 py-1 text-ink-3 transition-colors hover:bg-s2 hover:text-ink" aria-expanded={open}>Versions</button>
                  <button onClick={() => setRenaming(p.id)} className="rounded-full px-2.5 py-1 text-ink-3 transition-colors hover:bg-s2 hover:text-ink">Rename</button>
                  <button onClick={() => void onDuplicate(p.id)} className="rounded-full px-2.5 py-1 text-ink-3 transition-colors hover:bg-s2 hover:text-ink">Duplicate</button>
                  <span className="flex-1" />
                  {confirming === p.id ? (
                    <span className="flex items-center gap-1">
                      <span className="text-ink-2">Delete this record?</span>
                      <button onClick={async () => { await onDelete(p.id); setConfirming(null); }} className="rounded-full bg-warn/20 px-2.5 py-1 font-semibold text-warn">Delete</button>
                      <button onClick={() => setConfirming(null)} className="rounded-full px-2.5 py-1 text-ink-3 hover:bg-s2">Keep</button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirming(p.id)} className="rounded-full px-2.5 py-1 text-ink-3 transition-colors hover:bg-s2 hover:text-warn" aria-label={`Delete ${p.title}`}><Icon name="trash" size={14} /></button>
                  )}
                </div>
                {open && (
                  <ul className="mt-2 space-y-1 border-t border-line/40 pt-2">
                    {(versions[p.id] ?? []).length === 0 && <li className="text-xs text-ink-3">Loading versions</li>}
                    {(versions[p.id] ?? []).map((v) => (
                      <li key={v.id}><button onClick={() => onOpenVersion(v)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-s2"><span className="truncate text-ink-2">{v.label ?? "version"}</span><span className="tnum shrink-0 text-ink-3">{when(v.created_at)}</span></button></li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
          {local.map((s, i) => (
            <li key={`d${i}`} className="panel rounded-2xl p-3.5">
              <div className="flex items-start gap-3">
                <button onClick={() => onOpenLocal(s)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-s2 text-ink transition-colors hover:bg-live hover:text-accent-ink" aria-label={`Open ${s.song.title}`}><Icon name="play" size={18} /></button>
                <div className="min-w-0 flex-1">
                  <button onClick={() => onOpenLocal(s)} className="block w-full truncate text-left text-base font-semibold text-ink">{s.song.title}</button>
                  <p className="tnum mt-0.5 truncate text-xs text-ink-3">{s.song.bpm} BPM · {s.song.key} · on this device · {when(s.savedAt)}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
