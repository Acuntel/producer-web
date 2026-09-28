// Audio clips live in the browser (IndexedDB, idb.ts): uploads, recordings, the producer's own bounces.
// Nothing is ever lost, nothing leaves the machine. Library samples (public/samples) share the same keys
// under "sample:<id>". Every load goes through the asset store (assets.ts), the only fetch-and-decode path.
import { idbPut, idbGet, idbHas, idbList, idbDelete, type StoredClip, type ClipOrigin } from "./idb";
import { getMany, put, decodedCacheBytes, decodeAudio, trimStore } from "./assets";
import type { Tier } from "./ledger";

export type { StoredClip };
export { clipKeysFor, clipBuffer, keyOfClip } from "./keys";
export { cutId } from "./cuts";

// Anything stored here is also offered to the account's vault, so a record made on this machine
// can be opened on another one with its audio intact. The sink is set by the app when signed in.
type ClipSink = (c: StoredClip) => void;
let sink: ClipSink | null = null;
export function setClipSink(fn: ClipSink | null) { sink = fn; }

// A write can push the store past its budget: it is trimmed at idle (assets.ts), never now.
export const putClip = (c: StoredClip, opts?: { mirror?: boolean; origin?: ClipOrigin }) =>
  idbPut(c, opts?.origin).then((id) => { trimStore(); if (opts?.mirror !== false) try { sink?.(c); } catch { /* the vault is never a gate on playing */ } return id; });
export const getClip = (id: string) => idbGet(id);
/** Whether this device holds the clip, without reading its bytes. */
export const hasClip = (id: string) => idbHas(id);
/** Every stored clip's name and numbers, with no audio read (bytes is empty). */
export const listClips = () => idbList().then((all) => all.map((m): StoredClip => ({ id: m.id, name: m.name, type: m.type, bytes: new ArrayBuffer(0), createdAt: m.createdAt, durationSec: m.durationSec, bpm: m.bpm, key: m.key })));
export const deleteClip = (id: string) => idbDelete(id);

export function newClipId() {
  return `clip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** What the decoded cache is holding, for the board's corner and the probes. */
export const clipCacheBytes = () => decodedCacheBytes();

/** Decode bytes the caller keeps (they are copied first), at the studio's rate. */
export function decodeBytes(bytes: ArrayBuffer): Promise<AudioBuffer> {
  return decodeAudio(bytes.slice(0));
}

// Uploads come from IndexedDB; "sample:<id>" keys come from the library pack. All in parallel through
// the store, each key once however many callers ask. `why` names the caller in the ledger.
export function loadClipsFor(ids: string[], why = "load", tier: Exclude<Tier, "-"> = "T1"): Promise<Map<string, AudioBuffer>> {
  return getMany(ids, { why, tier });
}

/** A buffer its caller just decoded (a restore, an upload, a slice): one decode in the ledger, and ready. */
export function cacheDecoded(id: string, buf: AudioBuffer) { put(id, buf); }
