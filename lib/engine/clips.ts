// Audio clips live in the browser (IndexedDB): uploads, recordings, the
// producer's own bounces. Nothing is ever lost, nothing leaves the machine.
// Library samples (public/samples) share the same map under "sample:<id>" keys.
import type { Song, AudioClip } from "../song/types";
import { sampleKey, sampleIdOf } from "../samples/manifest";
const DB = "producer.clips";
const STORE = "clips";

export type StoredClip = { id: string; name: string; type: string; bytes: ArrayBuffer; createdAt: number; durationSec?: number; bpm?: number; key?: string };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

export const putClip = (c: StoredClip) => tx("readwrite", (s) => s.put(c)).then(() => c.id);
export const getClip = (id: string) => tx<StoredClip | undefined>("readonly", (s) => s.get(id));
export const listClips = () => tx<StoredClip[]>("readonly", (s) => s.getAll()).then((all) => all.map((c) => ({ ...c, bytes: new ArrayBuffer(0) })));
export const deleteClip = (id: string) => tx("readwrite", (s) => s.delete(id)).then(() => undefined);

export function newClipId() {
  return `clip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const decoded = new Map<string, AudioBuffer>();

export async function decodeBytes(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, 1, 44100);
  return ctx.decodeAudioData(bytes.slice(0));
}

async function decodeStored(id: string): Promise<AudioBuffer | null> {
  const c = await getClip(id);
  return c ? decodeBytes(c.bytes) : null;
}

// Uploads come from IndexedDB; "sample:<id>" keys come from the library manifest.
export async function loadClipsFor(ids: string[]): Promise<Map<string, AudioBuffer>> {
  const out = new Map<string, AudioBuffer>();
  for (const id of ids) {
    if (decoded.has(id)) { out.set(id, decoded.get(id)!); continue; }
    try {
      const sid = sampleIdOf(id);
      const buf = sid ? await (await import("./samples")).decodeSample(sid) : await decodeStored(id);
      if (!buf) continue;
      decoded.set(id, buf); out.set(id, buf);
    } catch { /* skip broken clip */ }
  }
  return out;
}

// Every clip-store key a song needs: library samples by sampleId, uploads by clipId.
export function clipKeysFor(song: Song): string[] {
  const keys = new Set<string>();
  for (const t of song.tracks) {
    if (!t.clip) continue;
    if (t.clip.sampleId) keys.add(sampleKey(t.clip.sampleId));
    else if (t.clip.clipId) keys.add(t.clip.clipId);
  }
  return [...keys];
}

// Which buffer a clip plays: the named library sample first, else the stored upload.
export function clipBuffer(clips: Map<string, AudioBuffer>, clip: AudioClip | undefined): AudioBuffer | undefined {
  if (!clip) return undefined;
  const fromSample = clip.sampleId ? clips.get(sampleKey(clip.sampleId)) : undefined;
  return fromSample ?? (clip.clipId ? clips.get(clip.clipId) : undefined);
}

export function cacheDecoded(id: string, buf: AudioBuffer) { decoded.set(id, buf); }
