// A folder on this computer as one more source: the user points the app at it once
// (Chrome's directory picker), the audio files are indexed by name in the browser, and a
// match is uploaded and analyzed like any file. Nothing is read until they ask.
export type LocalHit = { name: string; path: string; size: number; kind: string; file: () => Promise<File> };
type Entry = { name: string; path: string; size: number; handle: FileSystemFileHandle };

const AUDIO = /\.(mp3|wav|flac|m4a|aac|aiff?|ogg|opus|wma)$/i;
let root: FileSystemDirectoryHandle | null = null;
let index: Entry[] = [];
let indexedAt = 0;

type DirHandle = FileSystemDirectoryHandle & { values: () => AsyncIterable<FileSystemHandle> };
type PickerWindow = Window & { showDirectoryPicker?: (o?: { mode?: "read" | "readwrite"; id?: string }) => Promise<FileSystemDirectoryHandle> };

export const canPickFolder = () => typeof window !== "undefined" && typeof (window as PickerWindow).showDirectoryPicker === "function";

const DB = "producer.sources", STORE = "handles";
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function remember(h: FileSystemDirectoryHandle) { try { const db = await idb(); db.transaction(STORE, "readwrite").objectStore(STORE).put(h, "root"); } catch {} }
async function recall(): Promise<FileSystemDirectoryHandle | null> {
  try { const db = await idb(); return await new Promise((res) => { const r = db.transaction(STORE, "readonly").objectStore(STORE).get("root"); r.onsuccess = () => res((r.result as FileSystemDirectoryHandle) ?? null); r.onerror = () => res(null); }); } catch { return null; }
}

async function walk(dir: FileSystemDirectoryHandle, prefix: string, out: Entry[], depth: number) {
  if (depth > 6 || out.length > 20000) return;
  for await (const h of (dir as DirHandle).values()) {
    if (h.kind === "file") {
      if (!AUDIO.test(h.name)) continue;
      const fh = h as FileSystemFileHandle;
      let size = 0; try { size = (await fh.getFile()).size; } catch {}
      out.push({ name: h.name.replace(/\.[^.]+$/, ""), path: `${prefix}${h.name}`, size, handle: fh });
    } else if (h.kind === "directory" && !h.name.startsWith(".")) {
      await walk(h as FileSystemDirectoryHandle, `${prefix}${h.name}/`, out, depth + 1);
    }
  }
}

/** Ask for a folder (or reuse the remembered one) and index its audio. Returns the count. */
export async function connectFolder(pickNew = false): Promise<{ count: number; name: string } | null> {
  const w = window as PickerWindow;
  if (!w.showDirectoryPicker) return null;
  let h = pickNew ? null : root ?? (await recall());
  if (h) {
    const perm = await (h as FileSystemDirectoryHandle & { queryPermission?: (o: { mode: string }) => Promise<string>; requestPermission?: (o: { mode: string }) => Promise<string> });
    const state = (await perm.queryPermission?.({ mode: "read" })) ?? "granted";
    if (state !== "granted") { const got = await perm.requestPermission?.({ mode: "read" }); if (got !== "granted") h = null; }
  }
  if (!h) { try { h = await w.showDirectoryPicker({ mode: "read", id: "producer-music" }); } catch { return null; } await remember(h); }
  root = h;
  const out: Entry[] = [];
  await walk(h, "", out, 0);
  index = out; indexedAt = Date.now();
  return { count: out.length, name: h.name };
}

export const hasFolder = () => index.length > 0;
export const folderInfo = () => ({ count: index.length, name: root?.name ?? "", indexedAt });

const tokens = (s: string) => new Set(s.toLowerCase().replace(/[_\-.]+/g, " ").match(/[a-z0-9]+/g) ?? []);

/** Search the indexed folder by words in the file name or path. */
export function searchLocal(query: string, limit = 8): LocalHit[] {
  const q = tokens(query); if (!q.size || !index.length) return [];
  const scored = index.map((e) => { const t = tokens(`${e.path}`); const overlap = [...q].filter((w) => t.has(w)).length / q.size; return { e, s: overlap }; }).filter((x) => x.s > 0);
  scored.sort((a, b) => b.s - a.s || a.e.path.length - b.e.path.length);
  return scored.slice(0, limit).map(({ e }) => ({ name: e.name, path: e.path, size: e.size, kind: "local", file: () => e.handle.getFile() }));
}
