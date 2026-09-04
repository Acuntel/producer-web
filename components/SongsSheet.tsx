"use client";
// The library: every song version, every clip. Nothing is ever lost.
import { useEffect } from "react";
import type { Song } from "@/lib/song/types";
import { Button, IconButton, Empty } from "./ui";
import { Icon } from "./Icon";

export type SavedSong = { song: Song; savedAt: number };
export type ClipMeta = { id: string; name: string; bpm?: number; key?: string; durationSec?: number };

function when(ts: number) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SongsSheet({
  library, clips, onOpen, onDownload, onClose,
}: {
  library: SavedSong[]; clips: ClipMeta[];
  onOpen: (s: SavedSong) => void; onDownload: (s: Song) => void; onClose: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="My songs"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="panel max-h-[82vh] w-full animate-slide-up overflow-hidden rounded-t-3xl sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line/50 px-4 py-3">
          <h2 className="text-lg font-semibold">My songs</h2>
          <IconButton name="close" label="Close" onClick={onClose} size={32} />
        </div>

        <div className="scroll-y max-h-[calc(82vh-56px)] px-4 py-3">
          {library.length === 0 ? (
            <Empty icon="library" title="Nothing saved yet" hint="Your songs save automatically as you work. Every version stays here." />
          ) : (
            <ul className="space-y-2">
              {library.map((item, i) => (
                <li key={i} className="flex items-center gap-3 rounded-2xl border border-line/40 bg-s2/60 px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{item.song.title}</div>
                    <div className="tnum truncate text-xs text-ink-3">
                      {item.song.bpm} BPM · {item.song.key} · {item.song.tracks.length} tracks · {when(item.savedAt)}
                    </div>
                  </div>
                  <Button tone="accent" onClick={() => onOpen(item)}>Open</Button>
                  <IconButton name="download" label={`Download ${item.song.title} as WAV`} onClick={() => onDownload(item.song)} size={32} />
                </li>
              ))}
            </ul>
          )}

          {clips.length > 0 && (
            <>
              <h3 className="eyebrow mb-2 mt-5">Audio clips</h3>
              <ul className="space-y-1.5">
                {clips.map((c) => (
                  <li key={c.id} className="flex items-center gap-2.5 rounded-xl bg-s2/50 px-3 py-2">
                    <Icon name="waveform" size={15} className="shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.name}</span>
                    <span className="tnum shrink-0 text-xs text-ink-3">
                      {c.bpm ? `${Math.round(c.bpm)} BPM` : ""}{c.key ? ` · ${c.key}` : ""}{c.durationSec ? ` · ${c.durationSec.toFixed(1)}s` : ""}
                    </span>
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
