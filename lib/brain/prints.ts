// The fingerprints: every audio-measured recording as 32 int8 numbers where distance means "sounds like".
// Built by tools/dna/prints.py into data/prints (flat binaries, traced into the research function).
// Server only. Loaded once per process; a nearest-neighbour query is a brute-force scan of ~36 MB.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

type Manifest = { n: number; dims: number; scale: number; families: string[]; builtAt?: string };
type Store = { m: Manifest; keys: BigUint64Array; vec: Int8Array; akeys: BigUint64Array; arows: Uint32Array; names: Buffer; offs: Uint32Array; meta: Uint8Array };
export type Print = { row: number; artist: string; title: string; year: number | null; tempo: number | null; keyPc: number | null; mode: string | null; energy: number; valence: number; arousal: number; voice: string | null; family: string | null };

let store: Store | null | undefined;
const aligned = (buf: Buffer) => { const ab = new ArrayBuffer(buf.byteLength); new Uint8Array(ab).set(buf); return ab; };

export function prints(): Store | null {
  if (store !== undefined) return store;
  try {
    const dir = join(process.cwd(), "data", "prints");
    const rd = (f: string) => readFileSync(join(dir, f));
    const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Manifest;
    store = { m, keys: new BigUint64Array(aligned(rd("keys.u64"))), vec: new Int8Array(aligned(rd("vec.i8"))), akeys: new BigUint64Array(aligned(rd("akeys.u64"))),
      arows: new Uint32Array(aligned(rd("arows.u32"))), names: gunzipSync(rd("names.txt.gz")), offs: new Uint32Array(aligned(rd("offs.u32"))), meta: new Uint8Array(aligned(rd("meta.bin"))) };
  } catch { store = null; }
  return store;
}
export const printsCount = () => prints()?.m.n ?? 0;

/** Same key as tools/dna/prints.py: the first eight bytes of sha1, little endian. */
export const key64 = (s: string): bigint => createHash("sha1").update(s, "utf8").digest().readBigUInt64LE(0);
function lowerBound(a: BigUint64Array, k: bigint): number { let lo = 0, hi = a.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (a[mid] < k) lo = mid + 1; else hi = mid; } return lo; }

export function findRow(artistNorm: string, titleNorm: string): number | null {
  const s = prints(); if (!s) return null;
  const k = key64(`${artistNorm}|${titleNorm}`); const i = lowerBound(s.keys, k);
  return i < s.keys.length && s.keys[i] === k ? i : null;
}
export function artistRows(artistNorm: string, limit = 24): number[] {
  const s = prints(); if (!s) return [];
  const k = key64(artistNorm); const out: number[] = [];
  for (let i = lowerBound(s.akeys, k); i < s.akeys.length && s.akeys[i] === k && out.length < limit; i++) out.push(s.arows[i]);
  return out;
}

export function printOf(row: number): Print {
  const s = prints()!; const [artist, title] = s.names.subarray(s.offs[row], s.offs[row + 1]).toString("utf8").split("\t");
  const o = row * 12, m = s.meta; const u16 = (i: number) => m[i] | (m[i + 1] << 8);
  const tempo = u16(o) / 10, key = m[o + 2], mode = m[o + 3], year = u16(o + 4), voice = m[o + 9], fam = s.m.families[m[o + 10]] ?? "";
  return { row, artist: artist ?? "", title: title ?? "", year: year || null, tempo: tempo || null, keyPc: key === 255 ? null : key, mode: mode === 1 ? "major" : mode === 2 ? "minor" : null,
    energy: m[o + 6] / 255, valence: m[o + 7] / 255, arousal: m[o + 8] / 255, voice: voice === 1 ? "vocal" : voice === 2 ? "instrumental" : null, family: fam || null };
}

/** The k nearest by sound, other artists only (the same artist's other records are a different question). */
export function nearest(row: number, k = 6): { p: Print; d: number }[] {
  const s = prints(); if (!s) return [];
  const D = s.m.dims, n = s.m.n, vec = s.vec, q = vec.subarray(row * D, row * D + D);
  const K = Math.max(k * 6, 36); const top: { i: number; d: number }[] = []; let worst = Infinity;
  for (let i = 0; i < n; i++) {
    if (i === row) continue;
    const o = i * D; let d = 0;
    for (let j = 0; j < D; j++) { const x = vec[o + j] - q[j]; d += x * x; if (d >= worst) break; }
    if (d >= worst) continue;
    let pos = top.length; while (pos > 0 && top[pos - 1].d > d) pos--;
    top.splice(pos, 0, { i, d }); if (top.length > K) top.pop();
    if (top.length === K) worst = top[K - 1].d;
  }
  const me = printOf(row); const seen = new Set<string>([`${me.artist}|${me.title}`.toLowerCase()]); const out: { p: Print; d: number }[] = [];
  for (const t of top) {
    const p = printOf(t.i); const sig = `${p.artist}|${p.title}`.toLowerCase();
    if (p.artist.toLowerCase() === me.artist.toLowerCase() || seen.has(sig)) continue;
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
