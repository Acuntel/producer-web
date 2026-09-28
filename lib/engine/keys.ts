// One sound has one key at every layer: the song names it, the store loads it, the ledger writes it,
// the vault keeps it. Tone-free on purpose: the page and the account code read these keys without
// pulling the engine (and Tone, which opens an audio context when imported) into the first bundle.
import type { Song, AudioClip } from "../song/types";
import { sampleKey } from "../samples/manifest";
import { fitKey, voiceFit } from "../song/fit";

/** The key a clip's own audio is stored under: the named library sample first, else the stored upload. */
export function sourceKeyOf(clip: AudioClip | undefined): string | null {
  if (!clip) return null;
  return clip.sampleId ? sampleKey(clip.sampleId) : clip.clipId ?? null;
}

/** The key a clip plays from. A voice on a grid plays its pre-render for that tempo and key (`vocal:...`,
 *  lib/song/fit.ts); anything else plays its own audio. */
export function keyOfClip(clip: AudioClip | undefined, bpm?: number): string | null {
  const base = sourceKeyOf(clip);
  if (!base || !clip?.voice || !bpm) return base;
  return fitKey(base, voiceFit(clip, bpm));
}

/** Every clip-store key a song plays: library samples by sampleId, uploads by clipId, voices by their render. */
export function clipKeysFor(song: Song): string[] {
  const keys = new Set<string>();
  for (const t of song.tracks) { const k = keyOfClip(t.clip, song.bpm); if (k) keys.add(k); }
  return [...keys];
}

/** Every stored clip a song is made from (the vault keeps these; a voice's render is made again from its source). */
export function sourceKeysFor(song: Song): string[] {
  const keys = new Set<string>();
  for (const t of song.tracks) { const k = sourceKeyOf(t.clip); if (k) keys.add(k); }
  return [...keys];
}

/** Which buffer a clip plays on a grid of `bpm`. */
export function clipBuffer(clips: Map<string, AudioBuffer>, clip: AudioClip | undefined, bpm?: number): AudioBuffer | undefined {
  const k = keyOfClip(clip, bpm);
  return k ? clips.get(k) : undefined;
}

/** The keys the section starting at `beat` plays, and the rest, in the order they will be heard. */
export function keysBySection(song: Song): { id: string; keys: string[] }[] {
  const byId = new Map(song.sections.map((s) => [s.id, s]));
  const out: { id: string; keys: string[] }[] = [];
  for (const id of song.arrangement) {
    const sec = byId.get(id); if (!sec) continue;
    const keys = new Set<string>();
    for (const t of song.tracks) { if (!sec.active.includes(t.id)) continue; const k = keyOfClip(t.clip, song.bpm); if (k) keys.add(k); }
    out.push({ id, keys: [...keys] });
  }
  return out;
}

/** The kit key the ledger and the store use: `kit:<id>|<style>|v<n>`. The version moves when the sound does. */
export const KIT_VERSION = 2;
export const kitKey = (kit: string | undefined, style: string) => `kit:${kit ?? "synth"}|${style}|v${KIT_VERSION}`;
