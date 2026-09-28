// Seeded choices. Every choice a draft makes is a draw from the record's own seed, never Math.random, so the
// same record compiles to the same notes on every reload and a new seed is a new record. Among the top three
// candidates the pick is Thompson style: each candidate's weight is a count, a Beta draw is taken for each, and
// the largest draw wins. Strong candidates win most of the time; the others still get their turn.
import { mulberry32, hashStr } from "../prng";

export type Rng = () => number;
export const rngFor = (seed: number, key: string): Rng => mulberry32((seed ^ hashStr(key)) >>> 0);

// Marsaglia and Tsang, with the k < 1 boost.
function gamma(k: number, rng: Rng): number {
  if (k < 1) return gamma(k + 1, rng) * Math.pow(Math.max(1e-12, rng()), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      const u1 = Math.max(1e-12, rng()), u2 = rng();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.max(1e-12, rng());
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}
export const betaDraw = (a: number, b: number, rng: Rng) => { const x = gamma(a, rng), y = gamma(b, rng); return x / (x + y); };

export type Cand<T> = { v: T; w: number };

/** Thompson sampling over the top `top` candidates by weight. Weights are counts; equal weights are a fair draw. */
export function thompson<T>(cands: Cand<T>[], rng: Rng, top = 3): T {
  const list = cands.filter((c) => c.w > 0).sort((a, b) => b.w - a.w).slice(0, Math.max(1, top));
  if (!list.length) return cands[0].v;
  if (list.length === 1) return list[0].v;
  const total = list.reduce((a, c) => a + c.w, 0);
  const scale = Math.min(1, 12 / total);   // counts past a dozen say "strong", not "certain"
  let best = list[0], bestDraw = -1;
  for (const c of list) {
    const d = betaDraw(1 + c.w * scale, 1 + (total - c.w) * scale, rng);
    if (d > bestDraw) { bestDraw = d; best = c; }
  }
  return best.v;
}

export const pick = <T>(xs: readonly T[], rng: Rng): T => xs[Math.floor(rng() * xs.length) % xs.length];
export const chance = (p: number, rng: Rng) => rng() < p;
export const between = (lo: number, hi: number, rng: Rng) => lo + (hi - lo) * rng();
