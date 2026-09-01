// Audio clips live in the browser (IndexedDB): uploads, recordings, the
// producer's own bounces. Nothing is ever lost, nothing leaves the machine.
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

export async function loadClipsFor(ids: string[]): Promise<Map<string, AudioBuffer>> {
  const out = new Map<string, AudioBuffer>();
  for (const id of ids) {
    if (decoded.has(id)) { out.set(id, decoded.get(id)!); continue; }
    try {
      const c = await getClip(id);
      if (!c) continue;
      const buf = await decodeBytes(c.bytes);
      decoded.set(id, buf); out.set(id, buf);
    } catch { /* skip broken clip */ }
  }
  return out;
}

export function cacheDecoded(id: string, buf: AudioBuffer) { decoded.set(id, buf); }
