// The bytes layer of the asset store: audio kept in this browser (IndexedDB "producer.clips"). One
// connection for the whole session, a meta store so listing and eviction never read a byte of audio,
// and a request for persistent storage so the browser does not clear it under pressure. Tone-free.
//
// Version 2 adds the meta store; an existing database is upgraded in place and every clip keeps its id
// (clip ids are a contract with saved records and the vault).
import { countIdbOpen } from "./ledger";

const DB = "producer.clips";
const VERSION = 2;
const CLIPS = "clips";
const META = "meta";

export type ClipOrigin = "local" | "remote";
export type StoredClip = { id: string; name: string; type: string; bytes: ArrayBuffer; createdAt: number; durationSec?: number; bpm?: number; key?: string };
export type ClipMeta = { id: string; name: string; type: string; size: number; createdAt: number; lastUsed: number; durationSec?: number; bpm?: number; key?: string; origin: ClipOrigin };

// A stem, a one-shot or a match came from storage and can be fetched again; anything made in this
// browser (an upload, a take, a cut) is the only copy until the vault has it, so it is never evicted.
export const originOf = (id: string): ClipOrigin => (/^(stem_|shot_|match_)/.test(id) ? "remote" : "local");
const metaOf = (c: StoredClip, origin?: ClipOrigin): ClipMeta => ({ id: c.id, name: c.name, type: c.type, size: c.bytes.byteLength, createdAt: c.createdAt, lastUsed: Date.now(), durationSec: c.durationSec, bpm: c.bpm, key: c.key, origin: origin ?? originOf(c.id) });

let conn: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (conn) return conn;
  countIdbOpen();
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result; const tx = req.transaction;
      if (!db.objectStoreNames.contains(CLIPS)) db.createObjectStore(CLIPS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(META)) {
        const meta = db.createObjectStore(META, { keyPath: "id" });
        // Every clip already stored gets its meta row, from its own bytes.
        const cur = tx?.objectStore(CLIPS).openCursor();
        if (cur) cur.onsuccess = () => { const c = cur.result; if (!c) return; meta.put(metaOf(c.value as StoredClip)); c.continue(); };
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const drop = () => { if (conn === p) conn = null; };
      db.onversionchange = () => { drop(); db.close(); };
      db.onclose = drop;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("the clip store is open in an older tab"));
  });
  conn = p;
  p.catch(() => { if (conn === p) conn = null; });
  return p;
}

function run<T>(stores: string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => IDBRequest<T> | null): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let out: T;
    const r = fn(tx);
    if (r) r.onsuccess = () => { out = r.result; };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("aborted"));
  }));
}

// Ids known to be stored on this device: a yes is remembered, so asking again costs no read.
const stored = new Set<string>();

export function idbPut(c: StoredClip, origin?: ClipOrigin): Promise<string> {
  return run([CLIPS, META], "readwrite", (tx) => { tx.objectStore(META).put(metaOf(c, origin)); return tx.objectStore(CLIPS).put(c); }).then(() => { stored.add(c.id); return c.id; });
}

/** The bytes, and the clip is marked used now (eviction takes the least recently used first). */
export function idbGet(id: string): Promise<StoredClip | undefined> {
  return run<StoredClip | undefined>([CLIPS, META], "readwrite", (tx) => {
    const m = tx.objectStore(META); const g = m.get(id);
    g.onsuccess = () => { const row = g.result as ClipMeta | undefined; if (row) m.put({ ...row, lastUsed: Date.now() }); };
    return tx.objectStore(CLIPS).get(id);
  }).then((c) => { if (c) stored.add(id); return c; });
}

/** Whether this device holds the clip, without reading its bytes. */
export async function idbHas(id: string): Promise<boolean> {
  if (stored.has(id)) return true;
  const n = await run<number>([CLIPS], "readonly", (tx) => tx.objectStore(CLIPS).count(id));
  if (n > 0) stored.add(id);
  return n > 0;
}

/** Every stored clip's meta, with no audio read. */
export function idbList(): Promise<ClipMeta[]> {
  return run<ClipMeta[]>([META], "readonly", (tx) => tx.objectStore(META).getAll()).then((all) => { for (const c of all) stored.add(c.id); return all; });
}

export function idbDelete(id: string): Promise<void> {
  return run([CLIPS, META], "readwrite", (tx) => { tx.objectStore(META).delete(id); return tx.objectStore(CLIPS).delete(id); }).then(() => { stored.delete(id); });
}

/** Keep the store under `budget` bytes: the least recently used clips that can be fetched again go
 *  first, never one in `keep` (what the record plays) and never one made only in this browser. */
export async function idbEvict(budget: number, keep: ReadonlySet<string>): Promise<string[]> {
  const all = await idbList();
  let total = all.reduce((a, c) => a + (c.size || 0), 0);
  if (total <= budget) return [];
  const gone: string[] = [];
  for (const c of all.filter((x) => x.origin === "remote" && !keep.has(x.id)).sort((a, b) => a.lastUsed - b.lastUsed)) {
    if (total <= budget) break;
    try { await idbDelete(c.id); total -= c.size || 0; gone.push(c.id); } catch { /* the next pass tries again */ }
  }
  return gone;
}

let persisted: Promise<boolean> | null = null;
/** Ask the browser once to keep this origin's storage through pressure. */
export function idbPersist(): Promise<boolean> {
  if (!persisted) persisted = (typeof navigator !== "undefined" && navigator.storage?.persist ? navigator.storage.persist() : Promise.resolve(false)).catch(() => false);
  return persisted;
}
