// The fingerprints: every audio-measured recording as 32 int8 numbers where distance means "sounds like".
// Built by tools/dna/prints.py into data/prints (layout v2: one order by artist key then title key, brotli
// on disk, traced into the research function). Server only. Loaded once per process; a nearest-neighbour
// query is a brute-force scan of ~36 MB.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

type Manifest = { v: number; n: number; dims: number; scale: number; codec?: string; families: string[]; builtAt?: string };
type Store = { m: Manifest; akeys: BigUint64Array; tkeys: Uint32Array; vec: Int8Array; names: Buffer; offs: Uint32Array; meta: Uint8Array };
export type Print = { row: number; artist: string; title: string; year: number | null; tempo: number | null; keyPc: number | null; mode: string | null; energy: number; valence: number; arousal: number; voice: string | null; family: string | null };
const META = 9;

let store: Store | null | undefined;
const aligned = (buf: Buffer | Uint8Array) => { const ab = new ArrayBuffer(buf.byteLength); new Uint8Array(ab).set(buf); return ab; };

export function prints(): Store | null {
  if (store !== undefined) return store;
  try {
    const dir = join(process.cwd(), "data", "prints");
    const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Manifest;
    if (m.v !== 2) throw new Error(`prints layout v${m.v} is not v2`);
    const raw = (f: string) => readFileSync(join(dir, f));
    const packed = (f: string) => (m.codec === "gz" ? gunzipSync(raw(f)) : brotliDecompressSync(raw(f)));
    const lens = new Uint16Array(aligned(packed("lens.u16.br")));
    const offs = new Uint32Array(lens.length + 1); for (let i = 0; i < lens.length; i++) offs[i + 1] = offs[i] + lens[i];
    store = { m, akeys: new BigUint64Array(aligned(raw("akeys.u64"))), tkeys: new Uint32Array(aligned(raw("tkeys.u32"))), vec: new Int8Array(aligned(packed("vec.i8.br"))),
      names: packed("names.txt.br"), offs, meta: new Uint8Array(aligned(packed("meta.bin.br"))) };
  } catch { store = null; }
  return store;
}
export const printsCount = () => prints()?.m.n ?? 0;

/** Same key as tools/dna/prints.py: the first eight bytes of sha1, little endian. Title keys keep the low 32 bits. */
export const key64 = (s: string): bigint => createHash("sha1").update(s, "utf8").digest().readBigUInt64LE(0);
const key32 = (s: string): number => Number(key64(s) & 0xffffffffn);
function bound(a: BigUint64Array, k: bigint, upper: boolean): number { let lo = 0, hi = a.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (upper ? a[mid] <= k : a[mid] < k) lo = mid + 1; else hi = mid; } return lo; }
function range(s: Store, artistNorm: string): [number, number] { const k = key64(artistNorm); return [bound(s.akeys, k, false), bound(s.akeys, k, true)]; }

export function findRow(artistNorm: string, titleNorm: string): number | null {
  const s = prints(); if (!s) return null;
  const [lo, hi] = range(s, artistNorm); const t = key32(titleNorm);
  for (let i = lo; i < hi; i++) if (s.tkeys[i] === t) return i;
  return null;
}
export function artistRows(artistNorm: string, limit = 24): number[] {
  const s = prints(); if (!s) return [];
  const [lo, hi] = range(s, artistNorm); const out: number[] = [];
  for (let i = lo; i < hi && out.length < limit; i++) out.push(i);
  return out;
}
const fold = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\(.*?\)|\[.*?\]|\b(feat|featuring|ft)\b.*$/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
/** A titled record among an artist's prints: the exact key first, then the closest title by folded name. */
export function findRecord(artistNorm: string, titleNorm: string): number | null {
  const exact = findRow(artistNorm, titleNorm); if (exact !== null) return exact;
  const want = fold(titleNorm); if (!want) return null;
  let best: { row: number; score: number } | null = null;
  for (const row of artistRows(artistNorm, 400)) {
    const have = fold(printOf(row).title); if (!have) continue;
    const score = have === want ? 3 : have.startsWith(want) || want.startsWith(have) ? 2 : have.includes(want) || want.includes(have) ? 1 : 0;
    if (score && (!best || score > best.score)) best = { row, score };
    if (best?.score === 3) break;
  }
  return best?.row ?? null;
}

export function printOf(row: number): Print {
  const s = prints()!; const [artist, title] = s.names.subarray(s.offs[row], s.offs[row + 1]).toString("utf8").split("\t");
  const o = row * META, m = s.meta; const u16 = (i: number) => m[i] | (m[i + 1] << 8);
  const tempo = u16(o) / 10, year = u16(o + 2), packed = m[o + 7], key = packed & 15, mode = (packed >> 4) & 3, voice = (packed >> 6) & 3, fam = s.m.families[m[o + 8]] ?? "";
  return { row, artist: artist ?? "", title: title ?? "", year: year || null, tempo: tempo || null, keyPc: key === 15 ? null : key, mode: mode === 1 ? "major" : mode === 2 ? "minor" : null,
    energy: m[o + 4] / 255, valence: m[o + 5] / 255, arousal: m[o + 6] / 255, voice: voice === 1 ? "vocal" : voice === 2 ? "instrumental" : null, family: fam || null };
}

/** The k nearest by sound, other artists only (the same artist's other records are a different question). */
export function nearest(row: number, k = 6): { p: Print; d: number }[] {
  const s = prints(); if (!s) return [];
  const D = s.m.dims, n = s.m.n, vec = s.vec, akeys = s.akeys, me = akeys[row], q = vec.subarray(row * D, row * D + D);
  const K = Math.max(k * 4, 24); const top: { i: number; d: number }[] = []; let worst = Infinity;
  for (let i = 0; i < n; i++) {
    if (akeys[i] === me) continue;
    const o = i * D; let d = 0;
    for (let j = 0; j < D; j++) { const x = vec[o + j] - q[j]; d += x * x; if (d >= worst) break; }
    if (d >= worst) continue;
    let pos = top.length; while (pos > 0 && top[pos - 1].d > d) pos--;
    top.splice(pos, 0, { i, d }); if (top.length > K) top.pop();
    if (top.length === K) worst = top[K - 1].d;
  }
  const seen = new Set<string>(); const out: { p: Print; d: number }[] = [];
  for (const t of top) {
    const p = printOf(t.i); const sig = `${p.artist}|${p.title}`.toLowerCase();
    if (seen.has(sig)) continue;
    seen.add(sig); out.push({ p, d: Math.sqrt(t.d) / s.m.scale }); if (out.length >= k) break;
  }
  return out;
}

const band = (bpm: number) => { let b = bpm; while (b < 60) b *= 2; while (b > 180) b /= 2; return b < 90 ? "<90" : b < 110 ? "90-110" : b < 122 ? "110-122" : b < 132 ? "122-132" : b < 145 ? "132-145" : b < 160 ? "145-160" : ">160"; };
/** The song's address on the board: the universal pins, in pin order, unknowns left out. */
export function address(p: Print): string {
  const energy = p.energy < 0.4 ? "low" : p.energy < 0.6 ? "mid" : p.energy < 0.8 ? "high" : "peak";
  const feel = p.valence >= 0.5 ? (p.arousal >= 0.5 ? "lift" : "sun") : p.arousal >= 0.5 ? "rush" : "gut";
  const parts = [p.tempo ? `tempo ${band(p.tempo)}` : null, p.mode, `energy ${energy}`, `feel ${feel}`, p.year ? `${Math.floor(p.year / 10) * 10}s` : null, p.family, p.voice];
  return parts.filter((x): x is string => !!x).join(", ");
}

const KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const tag = (p: Print) => `${p.artist}: ${p.title}${p.year ? ` (${p.year})` : ""}${p.tempo ? ` at ${Math.round(p.tempo)}` : ""}${p.keyPc !== null ? ` in ${KEYS[p.keyPc]}${p.mode === "minor" ? "m" : ""}` : ""}`;

/** Lines for the research lane: where the record sits and what sits beside it by sound. */
export function soundLines(row: number, k = 6): string[] {
  const me = printOf(row); const nn = nearest(row, k);
  const lines = [`Address of ${me.artist}: ${me.title}: ${address(me)}.`];
  if (nn.length) lines.push(`By sound, ${me.artist}: ${me.title} sits closest to ${nn.map(({ p }) => tag(p)).join("; ")}.`);
  return lines;
}
