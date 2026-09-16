// The math of music, as functions the Hands and the room can call by name: Euclidean rhythms (Bjorklund),
// rotations and densities, polymeters, tuplets, the tresillo and its family, melodic contours, the golden
// section of a form. Pure, tested, and explained in one plain sentence when asked.

/** E(k, n): k hits spread as evenly as possible over n steps (Bjorklund), optionally rotated. "X" hits, "." rests. */
export function euclid(hits: number, steps: number, rotate = 0): string {
  const n = Math.max(1, Math.round(steps)), k = Math.max(0, Math.min(n, Math.round(hits)));
  if (k === 0) return ".".repeat(n); if (k === n) return "X".repeat(n);
  // Bjorklund: pair the ones with the zeros, then the remainders with the pairs, until one remainder is left.
  let a: number[][] = Array.from({ length: k }, () => [1]), b: number[][] = Array.from({ length: n - k }, () => [0]);
  while (b.length > 1) {
    const m = Math.min(a.length, b.length);
    const merged: number[][] = []; for (let i = 0; i < m; i++) merged.push([...a[i], ...b[i]]);
    const rest = a.length > b.length ? a.slice(m) : b.slice(m);
    a = merged; b = rest;
  }
  return rotateGrid([...a.flat(), ...b.flat()].map((v) => (v ? "X" : ".")).join(""), rotate);
}
export function rotateGrid(grid: string, by: number): string { const n = grid.length; if (!n) return grid; const r = ((by % n) + n) % n; return grid.slice(n - r) + grid.slice(0, n - r); }
/** Thin or thicken a grid toward a target hit count, keeping the strong steps (downbeats first, then the evenest spread). */
export function density(grid: string, targetHits: number): string {
  const n = grid.length, have = [...grid].filter((c) => c === "X").length, want = Math.max(0, Math.min(n, Math.round(targetHits)));
  if (want === have) return grid;
  const cells = [...grid];
  const priority = (i: number) => (i % 4 === 0 ? 0 : i % 2 === 0 ? 1 : 2) * n + i;   // downbeats, then the off eighths, then the 16ths
  if (want < have) { const hits = cells.map((c, i) => [c, i] as const).filter(([c]) => c === "X").map(([, i]) => i).sort((a, b) => priority(b) - priority(a)); for (const i of hits.slice(0, have - want)) cells[i] = "."; }
  else { const rests = cells.map((c, i) => [c, i] as const).filter(([c]) => c !== "X").map(([, i]) => i).sort((a, b) => priority(a) - priority(b)); for (const i of rests.slice(0, want - have)) cells[i] = "X"; }
  return cells.join("");
}
/** Two grids of different lengths laid over one bar of `steps`: the polymeter you hear when a 3-step figure rides a 4-step bar. */
export function polymeter(a: string, b: string, steps = 16): string { return Array.from({ length: steps }, (_, i) => (a[i % a.length] === "X" || b[i % b.length] === "X" ? "X" : ".")).join(""); }
/** A named family of patterns, in 16ths. */
export const NAMED: Record<string, string> = {
  four_floor: "X...X...X...X...", tresillo: "X..X..X.X..X..X.", cinquillo: "X.XX.XX.X.XX.XX.", son_clave: "X..X..X...X.X...", rumba_clave: "X..X...X..X.X...",
  bossa: "X..X..X...X..X..", offbeat: "..X...X...X...X.", backbeat: "....X.......X...", shuffle: "X..X..X..X..X..X",
};
/** What a grid is, in one plain sentence: E(k, n) with a rotation when it fits, a named clave when it matches, else the count. */
export function describe(grid: string): string {
  const n = grid.length, k = [...grid].filter((c) => c === "X").length;
  for (const [name, g] of Object.entries(NAMED)) if (g.length === n) for (let r = 0; r < n; r++) if (rotateGrid(g, r) === grid) return `${name.replace(/_/g, " ")}${r ? ` rotated by ${r}` : ""} (${k} of ${n})`;
  for (let r = 0; r < n; r++) if (euclid(k, n, r) === grid) return `E(${k},${n})${r ? ` rotated by ${r}` : ""}`;
  const off = [...grid].filter((c, i) => c === "X" && i % 4 !== 0).length;
  return `${k} hits in ${n} steps, ${off} off the beat`;
}
/** Melodic contour to intervals: a shape word becomes a run of scale steps around a root. */
export function contour(shape: "rise" | "fall" | "arch" | "wave" | "flat", length = 8): number[] {
  const L = Math.max(2, length);
  if (shape === "flat") return Array(L).fill(0);
  if (shape === "rise") return Array.from({ length: L }, (_, i) => Math.round((i / (L - 1)) * 7));
  if (shape === "fall") return Array.from({ length: L }, (_, i) => Math.round((1 - i / (L - 1)) * 7));
  if (shape === "arch") return Array.from({ length: L }, (_, i) => Math.round(Math.sin((i / (L - 1)) * Math.PI) * 7));
  return Array.from({ length: L }, (_, i) => Math.round(Math.sin((i / (L - 1)) * Math.PI * 2) * 4));
}
/** The golden section of a form in bars: where the big moment lands when the record follows phi. */
export const goldenBar = (totalBars: number) => Math.round(totalBars * 0.618);
/** Scale degrees to MIDI in a key: degrees are 0-based diatonic steps; negatives go down. */
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
export function degreesToMidi(degrees: number[], rootMidi: number, mode: "major" | "minor"): number[] {
  const sc = mode === "minor" ? MINOR : MAJOR;
  return degrees.map((d) => { const oct = Math.floor(d / 7), step = ((d % 7) + 7) % 7; return rootMidi + oct * 12 + sc[step]; });
}
