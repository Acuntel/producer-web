// What the brain sees each exchange: the song, what the ears measured, the
// reference, the deltas, now-playing, and the taste ledger. Compact by design.
import type { Song } from "../song/types";

export type ExchangeInput = {
  messages: { role: "user" | "assistant"; content: string }[];
  song: Song;
  facts?: unknown;          // compact MusicFacts of the current render
  reference?: { name: string; facts: unknown } | null;
  deltas?: unknown;         // compare(render, reference)
  nowPlaying?: unknown;
  taste?: string;           // ledger summary
  clips?: { clipId: string; name: string; bpm?: number; key?: string; durationSec?: number }[];
};

// Strip the song to what the brain needs; notes stay (they are the music).
export function compactSong(song: Song): unknown {
  return {
    ...song,
    tracks: song.tracks.map((t) => ({
      ...t,
      notes: t.notes.map((n) => n.map((x, i) => (i === 0 || i === 3 ? Math.round(x) : Math.round(x * 100) / 100))),
      patterns: t.patterns ? Object.fromEntries(Object.entries(t.patterns).map(([k, v]) => [k, v.map((n) => n.map((x, i) => (i === 0 || i === 3 ? Math.round(x) : Math.round(x * 100) / 100)))])) : undefined,
    })),
  };
}

export function mixerLine(song: Song): string {
  const anySolo = song.tracks.some((t) => t.solo);
  return song.tracks.map((t) => {
    const flags = [t.mute ? "MUTED" : "", t.solo ? "SOLO" : "", anySolo && !t.solo && !t.mute ? "(silent: others soloed)" : ""].filter(Boolean).join(" ");
    const fx = t.fx ? Object.keys(t.fx).join(",") : "";
    return `${t.id}[${t.role}] ${t.volume}dB${t.duck ? " duck" : ""}${fx ? " fx:" + fx : ""}${t.patterns ? " patterns:" + Object.keys(t.patterns).join("/") : ""}${t.clip ? " clip:" + t.clip.name : ""} ${flags}`.trim();
  }).join("\n");
}

export function buildUserBlock(x: ExchangeInput, lastUser: string): string {
  const parts: string[] = [];
  parts.push(`CURRENT SONG (SongDoc v3):\n${JSON.stringify(compactSong(x.song))}`);
  parts.push(`MIXER:\n${mixerLine(x.song)}`);
  if (x.facts) parts.push(`MEASURED SOUND (your ears on the actual full render): ${JSON.stringify(x.facts)}`);
  else parts.push(`MEASURED SOUND: not measured yet for this version (the ears run after every change).`);
  if (x.reference) parts.push(`REFERENCE TRACK "${x.reference.name}" (what they want it to sound like; emulate the DNA, never the recording): ${JSON.stringify(x.reference.facts)}`);
  if (x.deltas) parts.push(`DELTAS (render minus reference): ${JSON.stringify(x.deltas)}`);
  if (x.clips && x.clips.length) parts.push(`AUDIO CLIPS IN THE LIBRARY (usable as role "audio" tracks): ${JSON.stringify(x.clips)}`);
  if (x.nowPlaying) parts.push(`NOW PLAYING when they spoke: ${JSON.stringify(x.nowPlaying)}`);
  if (x.taste) parts.push(`TASTE LEDGER:\n${x.taste}`);
  parts.push(`USER SAYS: ${lastUser}`);
  return parts.join("\n\n");
}
