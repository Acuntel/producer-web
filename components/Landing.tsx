"use client";
// The first screen. Black. Two choices: a new project, or one you already have.
// Both are tappable and both can be said out loud.
import type { ProjectCard } from "@/lib/account/projects";
import type { SavedSong } from "@/lib/types/ui";
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

export function Landing({ projects, device, signedIn, loading, onNew, onOpen, onOpenLocal, onSignIn }: {
  projects: ProjectCard[]; device: SavedSong[]; signedIn: boolean; loading: boolean;
  onNew: () => void; onOpen: (id: string) => void; onOpenLocal: (s: SavedSong) => void; onSignIn?: () => void;
}) {
  const has = projects.length > 0 || device.length > 0;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="mb-10 flex flex-col items-center gap-3 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ink text-stage shadow-[0_0_60px_-10px_rgb(255_45_146/0.8)]"><Icon name="logo" size={26} /></span>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">The Producer</h1>
        <p className="max-w-[34ch] text-base text-ink-2">Talk. It builds the record in front of you. Nothing to click but this.</p>
      </div>

      <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
        <button onClick={onNew} data-role="new-project" className="group flex items-center gap-4 rounded-3xl border border-accent/40 bg-accent/10 p-5 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-accent/20 active:scale-[0.99]">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-accent-ink"><Icon name="plus" size={22} /></span>
          <span className="min-w-0">
            <span className="block text-lg font-semibold text-ink">New project</span>
            <span className="block text-sm text-ink-2">The producer asks who we are chasing.</span>
          </span>
        </button>
        <div className="rounded-3xl border border-line/60 bg-s1/70 p-5">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-s3 text-live"><Icon name="folder" size={22} /></span>
            <span className="min-w-0">
              <span className="block text-lg font-semibold text-ink">Existing project</span>
              <span className="block text-sm text-ink-2">{signedIn ? "Pick up where you left off." : has ? "Saved on this device." : "Nothing saved yet."}</span>
            </span>
          </div>
          {loading && projects.length === 0 && <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-10 rounded-xl" />)}</div>}
          {(projects.length > 0 || device.length > 0) && (
            <ul className="scroll-y mt-4 max-h-[32dvh] space-y-1.5" data-role="project-list">
              {projects.map((p) => (
                <li key={p.id}>
                  <button onClick={() => onOpen(p.id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-s2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{p.title}</span>
                      <span className="tnum block truncate text-xs text-ink-3">{p.bpm ? `${Math.round(Number(p.bpm))} BPM · ` : ""}{p.key ?? ""}{p.lane ? ` · ${p.lane.replace(/-/g, " ")}` : ""} · {when(p.updated_at)}</span>
                    </span>
                    <Icon name="play" size={14} className="shrink-0 text-ink-3" />
                  </button>
                </li>
              ))}
              {device.map((s, i) => (
                <li key={`d${i}`}>
                  <button onClick={() => onOpenLocal(s)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-s2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{s.song.title}</span>
                      <span className="tnum block truncate text-xs text-ink-3">{s.song.bpm} BPM · {s.song.key} · on this device · {when(s.savedAt)}</span>
                    </span>
                    <Icon name="play" size={14} className="shrink-0 text-ink-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!signedIn && onSignIn && (
            <button onClick={onSignIn} className="mt-4 text-sm font-medium text-live hover:underline">Sign in to keep projects everywhere</button>
          )}
        </div>
      </div>
      <p className="mt-8 text-xs text-ink-3">Chrome with headphones works best. The microphone is asked for on your first press.</p>
    </div>
  );
}
