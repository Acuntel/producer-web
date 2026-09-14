// Shared UI-facing types that several hooks and screens read.
import type { Song } from "@/lib/song/types";
import type { MusicFacts } from "@/lib/ears";

export type SavedSong = { song: Song; savedAt: number };
export type ClipMeta = { id: string; name: string; bpm?: number; key?: string; durationSec?: number };
export type Reference = { name: string; facts: MusicFacts };
