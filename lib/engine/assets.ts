// The asset store: the only code that fetches or decodes audio. One sound has one key at every layer
// (keys.ts), a request in flight is never repeated, a failure is never cached, and what the current
// record plays is pinned in memory. Tone-free, so the page can ask for sounds before the engine loads.
//
// Layers, nearest first: the decoded LRU (pinned keys never leave it), the in-flight map, IndexedDB
// bytes (idb.ts), and HTTP for the library (served immutable with the pack's content hash in the URL).
// Tiers order the work: T0 the first bar before the press, T1 the section the playhead is in, T2 the
// next section, T3 the rest at idle, T4 the likely next thing (cancellable). Every load writes the
// ledger; every arrival is announced so the engine can lay the tracks it names on the next bar.
import { assetRequested, assetDecoded, assetReady, assetFailed, type Tier } from "./ledger";
import { idbGet, idbEvict, idbPersist } from "./idb";
import { studioContextIfAny, studioRate, STUDIO_RATE } from "../audio/studio";
import { sampleIdOf } from "../samples/manifest";

export type AssetEvent = { type: "clip-arrived" | "clip-replaced"; key: string };
type Want = Exclude<Tier, "-">;
type Job = { key: string; tier: Want; why: string; run: () => Promise<AudioBuffer>; resolve: (b: AudioBuffer) => void; reject: (e: unknown) => void; signal?: AbortSignal };

const RANK: Record<Want, number> = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 };
const MAX_RUNNING = 4;
const DECODED_MAX_BYTES = 256 * 1024 * 1024;
const IDB_BUDGET_BYTES = 1024 * 1024 * 1024;

const decoded = new Map<string, AudioBuffer>();
let decodedBytes = 0;
const pinned = new Set<string>();
const inFlight = new Map<string, { promise: Promise<AudioBuffer>; job: Job | null }>();
const queue: Job[] = [];
let running = 0;
const listeners = new Set<(e: AssetEvent) => void>();
const bytesOf = (b: AudioBuffer) => b.length * b.numberOfChannels * 4;

// One decoder for the session, at the studio's rate, so a decoded buffer plays without resampling.
let decoder: OfflineAudioContext | null = null;
export function decodeRate(): number { return studioContextIfAny()?.sampleRate ?? studioRate() ?? STUDIO_RATE; }
export function decodeAudio(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const rate = decodeRate();
  if (!decoder || decoder.sampleRate !== rate) decoder = new OfflineAudioContext(1, 1, rate);
  return decoder.decodeAudioData(bytes);
}

function emit(e: AssetEvent) { for (const l of listeners) { try { l(e); } catch { /* a listener never breaks a load */ } } }
/** clip-arrived: a key is playable for the first time. clip-replaced: its sound changed under the same key. */
export function onAsset(fn: (e: AssetEvent) => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

function remember(key: string, buf: AudioBuffer) {
  const had = decoded.get(key);
  if (had) { decodedBytes -= bytesOf(had); decoded.delete(key); }
  decoded.set(key, buf); decodedBytes += bytesOf(buf);
  if (decodedBytes <= DECODED_MAX_BYTES) return;
  for (const [k, v] of decoded) {
    if (decodedBytes <= DECODED_MAX_BYTES) break;
    if (k === key || pinned.has(k)) continue;
    decoded.delete(k); decodedBytes -= bytesOf(v);
  }
}

/** A decoded buffer, if the store holds one, without loading anything (and it becomes the most recent). */
export function peek(key: string): AudioBuffer | undefined {
  const v = decoded.get(key);
  if (v) { decoded.delete(key); decoded.set(key, v); }
  return v;
}
export const isLoading = (key: string) => inFlight.has(key);
export const decodedCacheBytes = () => decodedBytes;

/** What the current record plays: kept in memory whatever the budget says. */
export function pin(keys: Iterable<string>) { pinned.clear(); for (const k of keys) pinned.add(k); }
export const pinnedKeys = (): ReadonlySet<string> => pinned;

// Where a key's audio comes from: the library pack over HTTP, else this browser's IndexedDB.
async function fetchAndDecode(key: string, signal?: AbortSignal): Promise<AudioBuffer> {
  const sid = sampleIdOf(key);
  if (sid) {
    const { sampleUrl } = await import("./samples");
    const url = await sampleUrl(sid);
    if (!url) throw new Error("not in the manifest");
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    const bytes = await r.arrayBuffer(); const size = bytes.byteLength;
    const buf = await decodeAudio(bytes);
    assetDecoded(key, size); assetReady(key, "http");
    return buf;
  }
  const c = await idbGet(key);
  if (!c) throw new Error("not stored on this device");
  const size = c.bytes.byteLength;
  const buf = await decodeAudio(c.bytes);
  assetDecoded(key, size); assetReady(key, "idb");
  return buf;
}

function pump() {
  queue.sort((a, b) => RANK[a.tier] - RANK[b.tier]);
  while (running < MAX_RUNNING && queue.length) {
    const i = queue.findIndex((j) => j.tier !== "T3" || idleNow);
    if (i < 0) { waitIdle(); return; }
    const job = queue.splice(i, 1)[0];
    if (job.signal?.aborted) { job.reject(new DOMException("cancelled", "AbortError")); continue; }
    running++;
    job.run().then(job.resolve, job.reject).finally(() => { running--; pump(); });
  }
}

// The rest of the record loads when the page has nothing better to do.
let idleNow = false; let idleWaiting = false;
function waitIdle() {
  if (idleWaiting) return; idleWaiting = true;
  const go = () => { idleWaiting = false; idleNow = true; pump(); idleNow = false; };
  const w = typeof window !== "undefined" ? (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }) : null;
  if (w?.requestIdleCallback) w.requestIdleCallback(go, { timeout: 2000 }); else setTimeout(go, 50);
}

/** The one way to get a sound. Resolves with the decoded buffer; rejects (and caches nothing) on a failure. */
export function get(key: string, opts?: { tier?: Want; why?: string; signal?: AbortSignal }): Promise<AudioBuffer> {
  const tier = opts?.tier ?? "T1"; const why = opts?.why ?? "load";
  assetRequested(key, why, tier);
  const have = peek(key);
  if (have) { assetReady(key, "memory"); return Promise.resolve(have); }
  const fly = inFlight.get(key);
  if (fly) {
    // A nearer need moves a queued load up; a load someone still wants is no longer cancellable.
    if (fly.job && RANK[tier] < RANK[fly.job.tier]) { fly.job.tier = tier; if (tier !== "T4") fly.job.signal = undefined; pump(); }
    return fly.promise;
  }
  let resolve!: (b: AudioBuffer) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<AudioBuffer>((res, rej) => { resolve = res; reject = rej; });
  const job: Job = { key, tier, why, signal: tier === "T4" ? opts?.signal : undefined, resolve, reject, run: () => fetchAndDecode(key, job.signal) };
  const entry: { promise: Promise<AudioBuffer>; job: Job | null } = { promise, job };
  inFlight.set(key, entry);
  promise.then((buf) => {
    if (inFlight.get(key) === entry) inFlight.delete(key);
    const replaced = decoded.has(key);
    remember(key, buf);
    emit({ type: replaced ? "clip-replaced" : "clip-arrived", key });
  }, (e) => {
    if (inFlight.get(key) === entry) inFlight.delete(key);
    assetFailed(key, e instanceof Error ? e.message : "decode failed");
  });
  promise.finally(() => { entry.job = null; }).catch(() => {});
  queue.push(job); pump();
  return promise;
}

/** Several at once, in parallel: whatever loads is in the map, whatever fails is left out. */
export async function getMany(keys: string[], opts?: { tier?: Want; why?: string }): Promise<Map<string, AudioBuffer>> {
  const out = new Map<string, AudioBuffer>();
  await Promise.all(keys.map((k) => get(k, opts).then((b) => { out.set(k, b); }, () => { /* in the ledger */ })));
  return out;
}

/** A buffer its caller already decoded (a restore, an upload, a cut): one decode in the ledger, and
 *  announced, so a record that names it plays it from the next bar. */
export function put(key: string, buf: AudioBuffer) {
  assetRequested(key, "handed in"); assetDecoded(key); assetReady(key, "memory");
  const had = decoded.get(key);
  remember(key, buf);
  if (had !== buf) emit({ type: had ? "clip-replaced" : "clip-arrived", key });
  scheduleTrim();
}

// IndexedDB stays under its budget, at idle, and asks once for persistent storage.
let trimTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleTrim() {
  if (trimTimer || typeof window === "undefined") return;
  trimTimer = setTimeout(() => { trimTimer = null; void idbPersist(); void idbEvict(IDB_BUDGET_BYTES, pinned).catch(() => {}); }, 5000);
}
export { scheduleTrim as trimStore };
