// One sound has one key at every layer: the song names it, the store loads it, the ledger writes it,
// the vault keeps it. Tone-free on purpose: the page and the account code read these keys without
// pulling the engine (and Tone, which opens an audio context when imported) into the first bundle.
import type { Song, AudioClip } from "../song/types";
import { sampleKey } from "../samples/manifest";

/** Every clip-store key a song needs: library samples by sampleId, uploads by clipId. */
export function clipKeysFor(song: Song): string[] {
  const keys = new Set<string>();
  for (const t of song.tracks) {
    if (!t.clip) continue;
    if (t.clip.sampleId) keys.add(sampleKey(t.clip.sampleId));
    else if (t.clip.clipId) keys.add(t.clip.clipId);
  }
  return [...keys];
}

/** The key a clip plays from: the named library sample first, else the stored upload. */
export function keyOfClip(clip: AudioClip | undefined): string | null {
  if (!clip) return null;
  return clip.sampleId ? sampleKey(clip.sampleId) : clip.clipId ?? null;
}

/** Which buffer a clip plays: the named library sample first, else the stored upload. */
export function clipBuffer(clips: Map<string, AudioBuffer>, clip: AudioClip | undefined): AudioBuffer | undefined {
  if (!clip) return undefined;
  const fromSample = clip.sampleId ? clips.get(sampleKey(clip.sampleId)) : undefined;
  return fromSample ?? (clip.clipId ? clips.get(clip.clipId) : undefined);
}

/** The keys the section starting at `beat` plays, and the rest, in the order they will be heard. */
export function keysBySection(song: Song): { id: string; keys: string[] }[] {
  const byId = new Map(song.sections.map((s) => [s.id, s]));
  const out: { id: string; keys: string[] }[] = [];
  for (const id of song.arrangement) {
    const sec = byId.get(id); if (!sec) continue;
    const keys = new Set<string>();
    for (const t of song.tracks) { if (!sec.active.includes(t.id)) continue; const k = keyOfClip(t.clip); if (k) keys.add(k); }
    out.push({ id, keys: [...keys] });
  }
  return out;
}

/** The kit key the ledger and the store use: `kit:<id>|<style>|v<n>`. The version moves when the sound does. */
export const KIT_VERSION = 2;
export const kitKey = (kit: string | undefined, style: string) => `kit:${kit ?? "synth"}|${style}|v${KIT_VERSION}`;
