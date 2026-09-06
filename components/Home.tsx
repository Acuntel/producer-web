"use client";
// Home: your records, not a session. Open one to pick up where you left off, or
// start a new session (bottom right). Nothing plays until you choose.
import { useMemo, useState } from "react";
import type { ProjectCard } from "@/lib/account/projects";
import type { SavedSong } from "./SongsSheet";
import { Button, Empty } from "./ui";
import { Icon } from "./Icon";

function when(ts: number | string) {
  const t = typeof ts === "string" ? new Date(ts).getTime() : ts;
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function Home({ signedIn, email, projects, loading, localLibrary, onOpen, onOpenLocal, onNew, onSignIn }: {
  signedIn: boolean; email?: string | null; projects: ProjectCard[]; loading: boolean; localLibrary: SavedSong[];
  onOpen: (id: string) => void; onOpenLocal: (s: SavedSong) => void; onNew: () => void; onSignIn: () => void;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return s ? projects.filter((p) => p.title.toLowerCase().includes(s) || (p.lane ?? "").includes(s)) : projects; }, [projects, q]);
  const cloudTitles = useMemo(() => new Set(projects.map((p) => p.title)), [projects]);
  const device = useMemo(() => (signedIn ? localLibrary.filter((s) => !cloudTitles.has(s.song.title)) : localLibrary), [signedIn, localLibrary, cloudTitles]);
  const empty = !loading && shown.length === 0 && device.length === 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="scroll-y min-h-0 flex-1 px-4 pb-28 pt-6 sm:px-8">
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="eyebrow">Your records</div>
              <h2 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">{signedIn ? "Pick up where you left off" : "Your records on this device"}</h2>
              <p className="mt-1 text-sm text-ink-2">{signedIn ? `Every version saves to ${email ?? "your account"} as you work.` : "Sign in and they follow you everywhere."}</p>
            </div>
            {projects.length > 4 && (
              <div className="flex items-center gap-2 rounded-lg border border-line/60 bg-base px-3 py-2 focus-within:border-accent/60">
                <Icon name="search" size={15} className="shrink-0 text-ink-3" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search records" className="w-40 bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none" />
              </div>
            )}
          </div>

          {!signedIn && (
            <div className="mt-5 flex flex-col gap-3 rounded-xl border border-line/50 bg-s1 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">Sign in to keep your records everywhere.</div>
                <div className="text-xs text-ink-3">Right now they live only in this browser.</div>
              </div>
              <Button tone="accent" icon="user" onClick={onSignIn}>Sign in</Button>
            </div>
          )}

          {loading && projects.length === 0 ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-[124px] rounded-xl" />)}</div>
          ) : empty ? (
            <div className="mt-10">
              <Empty icon="folder" title="No records yet." hint="Start a session. The producer asks what you are making and builds it with you. Everything saves as you go." />
              <div className="mt-2 flex justify-center"><Button tone="accent" icon="play" onClick={onNew}>New session</Button></div>
            </div>
          ) : (
            <>
              {shown.length > 0 && (
                <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {shown.map((p) => (
                    <li key={p.id}>
                      <button onClick={() => onOpen(p.id)} className="group block w-full rounded-xl border border-line/50 bg-s1 p-4 text-left transition-colors hover:border-accent/50 hover:bg-s2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-base font-semibold text-ink">{p.title}</div>
                            <div className="tnum mt-1 truncate text-xs text-ink-2">{p.bpm ? `${Math.round(Number(p.bpm))} BPM` : ""}{p.key ? ` · ${p.key}` : ""}{p.lane ? ` · ${p.lane.replace(/-/g, " ")}` : ""}</div>
                          </div>
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-s2 text-ink-3 transition-colors group-hover:bg-accent group-hover:text-accent-ink"><Icon name="play" size={14} /></span>
                        </div>
                        <div className="tnum mt-3 flex items-center justify-between text-xs text-ink-3">
                          <span>{p.tracks} tracks · {p.version_count} {p.version_count === 1 ? "version" : "versions"}</span>
                          <span>{when(p.updated_at)}</span>
                        </div>
                        {p.summary && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-3">{p.summary}</p>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {device.length > 0 && (
                <>
                  <h3 className="eyebrow mb-2 mt-8">On this device</h3>
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {device.map((item, i) => (
                      <li key={i}>
                        <button onClick={() => onOpenLocal(item)} className="block w-full rounded-xl border border-line/40 bg-s1/70 p-3.5 text-left transition-colors hover:bg-s2">
                          <div className="truncate text-sm font-semibold text-ink">{item.song.title}</div>
                          <div className="tnum mt-1 truncate text-xs text-ink-3">{item.song.bpm} BPM · {item.song.key} · {item.song.tracks.length} tracks · {when(item.savedAt)}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </div>
      {!empty && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end p-5 sm:p-7">
          <Button tone="accent" icon="play" onClick={onNew} className="pointer-events-auto !h-12 !px-6 !text-base shadow-panel">New session</Button>
        </div>
      )}
    </div>
  );
}
