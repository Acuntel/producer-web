// Audio clips live in the browser (IndexedDB): uploads, recordings, the
// producer's own bounces. Nothing is ever lost, nothing leaves the machine.
// Library samples (public/samples) share the same map under "sample:<id>" keys.
import type { Song, AudioClip } from "../song/types";
import { sampleKey, sampleIdOf } from "../samples/manifest";
import { assetRequested, assetDecoded, assetReady, assetFailed, countIdbOpen } from "./ledger";
const DB = "producer.clips";
const STORE = "clips";

export type StoredClip = { id: string; name: string; type: string; bytes: ArrayBuffer; createdAt: number; durationSec?: number; bpm?: number; key?: string };

// One connection for the whole session. Opening the database on every read was thousands of opens a
// minute from a render loop; a connection the browser closes (another tab upgrading, storage cleared)
// is dropped here and the next read opens a fresh one. A failed open is never kept.
let conn: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (conn) return conn;
  countIdbOpen();
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => {
      const db = req.result;
      const drop = () => { if (conn === p) conn = null; };
      db.onversionchange = () => { drop(); db.close(); };
      db.onclose = drop;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  conn = p;
  p.catch(() => { if (conn === p) conn = null; });
  return p;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

// Anything stored here is also offered to the account's vault, so a record made on this machine
// can be opened on another one with its audio intact. The sink is set by the app when signed in.
type ClipSink = (c: StoredClip) => void;
let sink: ClipSink | null = null;
export function setClipSink(fn: ClipSink | null) { sink = fn; }

// Ids known to be stored on this device: a yes is remembered, so asking again costs no read.
const stored = new Set<string>();
export const putClip = (c: StoredClip, opts?: { mirror?: boolean }) =>
  tx("readwrite", (s) => s.put(c)).then(() => { stored.add(c.id); if (opts?.mirror !== false) try { sink?.(c); } catch { /* the vault is never a gate on playing */ } return c.id; });
export const getClip = (id: string) => tx<StoredClip | undefined>("readonly", (s) => s.get(id)).then((c) => { if (c) stored.add(id); return c; });
/** Whether this device holds the clip, without reading its bytes. */
export async function hasClip(id: string): Promise<boolean> {
  if (stored.has(id)) return true;
  const n = await tx<number>("readonly", (s) => s.count(id));
  if (n > 0) stored.add(id);
  return n > 0;
}
export const listClips = () => tx<StoredClip[]>("readonly", (s) => s.getAll()).then((all) => all.map((c) => { stored.add(c.id); return { ...c, bytes: new ArrayBuffer(0) }; }));
export const deleteClip = (id: string) => tx("readwrite", (s) => s.delete(id)).then(() => { stored.delete(id); });

export function newClipId() {
  return `clip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// Decoded audio is the heaviest thing the browser holds: one four minute stem is about
// 170 MB of float samples, so the cache is a fixed room. Least recently asked for leaves
// first; a buffer a voice is still playing lives on through that voice's own reference.
const decoded = new Map<string, AudioBuffer>();
const CACHE_MAX_BYTES = 256 * 1024 * 1024;
let cachedBytes = 0;
const bytesOf = (b: AudioBuffer) => b.length * b.numberOfChannels * 4;

function remember(id: string, buf: AudioBuffer) {
  const had = decoded.get(id);
  if (had) { cachedBytes -= bytesOf(had); decoded.delete(id); }
  decoded.set(id, buf); cachedBytes += bytesOf(buf);
  for (const [k, v] of decoded) {
    if (cachedBytes <= CACHE_MAX_BYTES) break;
    if (k === id) continue;
    decoded.delete(k); cachedBytes -= bytesOf(v);
  }
}

// Asking for a buffer makes it the most recent (Map keeps insertion order, so re-setting moves it to the end).
function recall(id: string): AudioBuffer | undefined {
  const v = decoded.get(id);
  if (v) { decoded.delete(id); decoded.set(id, v); }
  return v;
}

/** What the decoded cache is holding, for the board's corner and the probes. */
export const clipCacheBytes = () => cachedBytes;

export async function decodeBytes(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, 1, 44100);
  return ctx.decodeAudioData(bytes.slice(0));
}

async function decodeStored(id: string): Promise<AudioBuffer | null> {
  const c = await getClip(id);
  if (!c) return null;
  const buf = await decodeBytes(c.bytes);
  assetDecoded(id, c.bytes.byteLength); assetReady(id, "idb");
  return buf;
}

// Uploads come from IndexedDB; "sample:<id>" keys come from the library manifest. `why` names the
// caller in the ledger (the press, a warm-up, a listen), so a load nobody needed is visible.
export async function loadClipsFor(ids: string[], why = "load"): Promise<Map<string, AudioBuffer>> {
  const out = new Map<string, AudioBuffer>();
  for (const id of ids) {
    assetRequested(id, why);
    const have = recall(id);
    if (have) { assetReady(id, "memory"); out.set(id, have); continue; }
    try {
      const sid = sampleIdOf(id);
      const buf = sid ? await (await import("./samples")).decodeSample(sid) : await decodeStored(id);
      if (!buf) { assetFailed(id, "not stored on this device"); continue; }
      remember(id, buf); out.set(id, buf);
    } catch (e) { assetFailed(id, e instanceof Error ? e.message : "decode failed"); }
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

/** A buffer its caller just decoded (a restore, an upload, a slice): one decode in the ledger, and ready. */
export function cacheDecoded(id: string, buf: AudioBuffer) { assetRequested(id, "handed in"); assetDecoded(id); assetReady(id, "memory"); remember(id, buf); }
