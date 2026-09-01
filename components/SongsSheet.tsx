"use client";
// The library: every song version, every clip. Nothing is ever lost.
import type { Song } from "@/lib/song/types";

export type SavedSong = { song: Song; savedAt: number };
export type ClipMeta = { id: string; name: string; bpm?: number; key?: string; durationSec?: number };

export function SongsSheet({ library, clips, onOpen, onDownload, onClose }: {
  library: SavedSong[]; clips: ClipMeta[]; onOpen: (s: SavedSong) => void; onDownload: (s: Song) => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[75vh] w-full max-w-md overflow-y-auto rounded-3xl bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">My songs</h2>
          <button onClick={onClose} className="rounded-full bg-zinc-800 px-3 py-1 text-sm">✕</button>
        </div>
        {library.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">Nothing saved yet. Your songs save automatically as you work.</p>}
        {library.map((item, i) => (
          <div key={i} className="mb-2 flex items-center justify-between rounded-2xl bg-zinc-800 px-4 py-3">
            <div>
              <div className="text-sm font-semibold">{item.song.title}</div>
              <div className="text-xs text-zinc-500">{item.song.bpm} BPM · {item.song.key} · {new Date(item.savedAt).toLocaleString()}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onOpen(item)} className="rounded-full bg-amber-500 px-4 py-1.5 text-sm font-bold text-black">Open</button>
              <button onClick={() => onDownload(item.song)} className="rounded-full bg-zinc-700 px-3 py-1.5 text-sm" title="Download WAV">⬇</button>
            </div>
          </div>
        ))}
        {clips.length > 0 && (
          <>
            <h3 className="mb-2 mt-4 text-sm font-bold text-zinc-400">Audio clips</h3>
            {clips.map((c) => (
              <div key={c.id} className="mb-1.5 rounded-2xl bg-zinc-800 px-4 py-2 text-sm">
                <span className="font-semibold">{c.name}</span>
                <span className="ml-2 text-xs text-zinc-500">{c.bpm ? `${Math.round(c.bpm)} BPM` : ""}{c.key ? ` · ${c.key}` : ""}{c.durationSec ? ` · ${c.durationSec.toFixed(1)}s` : ""}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
