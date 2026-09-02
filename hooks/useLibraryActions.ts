"use client";
// Library actions: open a saved version, save now, download a WAV. Nothing is ever lost.
// When a song uses library samples whose license asks for credit, the download also
// writes a credits .txt next to the WAV.
import { useCallback } from "react";
import type { Song } from "@/lib/song";
import type { SavedSong } from "@/components/SongsSheet";

type Deps = { autoSave: (s: Song) => void; flash: (t: string) => void; say: (t: string) => void; setSong: (s: Song, o?: { label?: string }) => Promise<void>; started: boolean; getSong: () => Song; setRendering: (b: boolean) => void };

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// The credits sidecar, only when a used sample's license requires attribution (CC0 needs none).
async function creditsSidecar(song: Song): Promise<{ text: string; file: string } | null> {
  try {
    const attr = await import("@/lib/samples-attribution");
    if (!attr.usesSamples(song)) return null;
    const { loadManifest } = await import("@/lib/engine");
    const c = attr.creditsFor(song, await loadManifest());
    return c.required ? { text: c.text, file: attr.creditsFileName(song) } : null;
  } catch { return null; }
}

export function useLibraryActions(d: Deps) {
  const loadSaved = useCallback(async (item: SavedSong) => { await d.setSong(item.song, { label: `open ${item.song.title}` }); d.flash(`Loaded ${item.song.title}`); if (d.started) d.say(`Loaded ${item.song.title}. Where were we?`); }, [d]);
  const saveNow = useCallback(() => { d.autoSave(d.getSong()); d.flash(`Saved ${d.getSong().title}`); }, [d]);
  const download = useCallback(async (s?: Song) => {
    d.setRendering(true);
    try {
      const target = s ?? d.getSong();
      const { renderWav } = await import("@/lib/engine");
      saveBlob(await renderWav(target), `${target.title.replace(/\s+/g, "-")}.wav`);
      const credits = await creditsSidecar(target);
      if (credits) { saveBlob(new Blob([credits.text], { type: "text/plain" }), credits.file); d.flash("Downloading your song and its sample credits"); }
      else d.flash("Downloading your song");
    } finally { d.setRendering(false); }
  }, [d]);
  return { loadSaved, saveNow, download };
}
