// The vocal block of MusicFacts: what the ears measured on the last voice placed in this record (vocalCheck.ts),
// kept by the tracks it placed, so the facts carry it only while that voice is still in the song. Tone-free.
import type { Song } from "../song/types";
import type { MusicFacts } from "./facts";

export type VocalFacts = {
  source: string; slot: string; lands: string; tracks: string[];
  anchorErrMs: number; anchorErrBeats: number; masked: number; maskGapDb: number; inScale: number; chordFit: number;
  leadCollisions: number; crossesBoundary: boolean; pass: boolean;
};

let last: VocalFacts | null = null;
export function setVocalFacts(v: VocalFacts | null) { last = v; }
/** The block for this record, or null once its voice has left it. */
export function vocalFactsFor(song: Song): VocalFacts | null {
  if (!last) return null;
  const ids = new Set(song.tracks.map((t) => t.id));
  return last.tracks.some((t) => ids.has(t)) ? last : null;
}
/** Put the block on facts heard from this record (a listen never measures it: only the placement's own check does). */
export function attachVocal(f: MusicFacts, song: Song): MusicFacts {
  const v = vocalFactsFor(song);
  if (v) f.vocal = v; else delete f.vocal;
  return f;
}
