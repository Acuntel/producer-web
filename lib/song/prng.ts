// Deterministic randomness: same seed, same feel, forever. Every "random" thing
// in the studio (velocity life, note chance, groove jitter, "any" playlists)
// draws from a stream keyed by the song seed and the thing it belongs to, so a
// render is identical between plays and section excerpts match the live mix.

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a: a stable 32-bit hash of a string (track id, section id).
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// One stream per (song seed, key). Keys are strings like "hat" or "drop:hat".
export const streamFor = (seed: number, key: string) => mulberry32((seed ^ hashStr(key)) >>> 0);
