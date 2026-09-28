"use client";
// Keeping the record on this device. The song, the chat and the library are written once a change is
// committed and the thread is idle, coalesced: a burst of moves (or a fader drag) is one write, never
// one per move, and a write never lands in the frame the scheduler needs. A full store is said, not
// swallowed, because that is how a session's work used to disappear without anyone being told.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Song } from "@/lib/song";
import type { SavedSong } from "@/lib/types/ui";
import { idleWriter } from "@/lib/idle";

export const LIB_KEY = "producer.library.v2", SONG_KEY = "producer.song.v4", CHAT_KEY = "producer.chat.v3";
type Msg = { role: "user" | "assistant"; content: string };

export const loadLibrary = (): SavedSong[] => { try { return JSON.parse(localStorage.getItem(LIB_KEY) ?? "[]"); } catch { return []; } };
// A record is itself, not its name: two records called Untitled used to overwrite each other here.
const sameRecord = (a: Song, b: Song) => (a.id && b.id ? a.id === b.id : a.title === b.title);
/** Writes that can fail. The browser's store is small and it throws when it is full. */
const keep = (key: string, value: string): boolean => { try { localStorage.setItem(key, value); return true; } catch { return false; } };
const persistLibrary = (lib: SavedSong[]) => keep(LIB_KEY, JSON.stringify(lib.slice(0, 30)));

export function useDeviceSave(song: Song, messages: Msg[]) {
  const [library, setLibrary] = useState<SavedSong[]>([]);
  const [notSaved, setNotSaved] = useState(false);
  const libRef = useRef<SavedSong[] | null>(null);
  const writer = useMemo(() => idleWriter(), []);
  useEffect(() => { const l = loadLibrary(); libRef.current = l; setLibrary(l); }, []);
  // Leaving the page writes whatever is still waiting. (Not on unmount: a dev double mount would
  // write the seed over the record before it was read back.)
  useEffect(() => {
    const flush = () => writer.flush();
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [writer]);

  useEffect(() => {
    writer.schedule("song", () => {
      const body = JSON.stringify(song);
      if (keep(SONG_KEY, body) && keep(CHAT_KEY, JSON.stringify(messages.slice(-40)))) { setNotSaved(false); return; }
      try { localStorage.removeItem(CHAT_KEY); } catch { /* nothing to free */ }
      persistLibrary((libRef.current ?? loadLibrary()).slice(0, 6));
      setNotSaved(!keep(SONG_KEY, body));
    });
  }, [song, messages, writer]);

  const autoSave = useCallback((s: Song) => {
    const lib = [{ song: s, savedAt: Date.now() }, ...(libRef.current ?? loadLibrary()).filter((x) => !sameRecord(x.song, s))].slice(0, 30);
    libRef.current = lib; setLibrary(lib);
    writer.schedule("library", () => { if (!persistLibrary(libRef.current ?? lib)) setNotSaved(true); });
  }, [writer]);

  return { library, notSaved, autoSave };
}
