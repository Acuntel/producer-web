"use client";
// Library actions: open a saved version, save now, download a WAV. Nothing is ever lost.
import { useCallback } from "react";
import type { Song } from "@/lib/song";
import type { SavedSong } from "@/components/SongsSheet";

type Deps = { autoSave: (s: Song) => void; flash: (t: string) => void; say: (t: string) => void; setSong: (s: Song, o?: { label?: string }) => Promise<void>; started: boolean; getSong: () => Song; setRendering: (b: boolean) => void };

export function useLibraryActions(d: Deps) {
  const loadSaved = useCallback(async (item: SavedSong) => { await d.setSong(item.song, { label: `open ${item.song.title}` }); d.flash(`Loaded ${item.song.title}`); if (d.started) d.say(`Loaded ${item.song.title}. Where were we?`); }, [d]);
  const saveNow = useCallback(() => { d.autoSave(d.getSong()); d.flash(`Saved ${d.getSong().title}`); }, [d]);
  const download = useCallback(async (s?: Song) => {
    d.setRendering(true);
    try {
      const target = s ?? d.getSong();
      const { renderWav } = await import("@/lib/engine");
      const url = URL.createObjectURL(await renderWav(target));
      const a = document.createElement("a"); a.href = url; a.download = `${target.title.replace(/\s+/g, "-")}.wav`; a.click();
      URL.revokeObjectURL(url); d.flash("Downloading your song");
    } finally { d.setRendering(false); }
  }, [d]);
  return { loadSaved, saveNow, download };
}
