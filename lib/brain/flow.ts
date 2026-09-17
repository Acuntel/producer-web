// The FLOW CHECK: the current record's form against the measured patterns (data/dna/flow.json), in plain
// sentences the Hands read on every exchange. Sections and their lengths from the song; energy per section
// from the section's own energy target (and the ears' per-bar read when they have one).
import flowJson from "../../data/dna/flow.json";
import type { Song } from "../song/types";

type Q = { p25: number; p50: number; p75: number } | null;
type Flow = { grammar: Record<string, { songs: number; first_chorus_bar: Q; sections_p50: number | null; two_peaks_share: number | null }>; energy: { break_depth: Q; second_peak_over_first: Q; boundary_jump: Q; first_peak_bar: Q; build_slope_per_8_bars: Q } };
const FLOW = flowJson as unknown as Flow;

const kindOf = (name: string) => { const n = name.toLowerCase(); return /drop|chorus|hook/.test(n) ? "peak" : /break|breakdown/.test(n) ? "break" : /build|rise|pre/.test(n) ? "build" : /intro/.test(n) ? "intro" : /outro/.test(n) ? "outro" : "body"; };

/** Sentences about the record's form against the store's ranges; empty when the record has no sections yet. */
export function flowNotes(song: Song, opts?: { family?: string | null }): string[] {
  const secs = song.arrangement.map((id) => song.sections.find((s) => s.id === id)).filter((s): s is Song["sections"][number] => !!s);
  if (secs.length < 2) return [];
  const e = FLOW.energy; const g = FLOW.grammar[opts?.family ?? ""] ?? FLOW.grammar.all;
  const notes: string[] = [];
  // Section lengths: phrases of 4, 8, 16, 32; anything else stumbles.
  const odd = secs.filter((s) => !([8, 16, 32, 64].includes(s.bars) || (s.bars === 4 && ["intro", "outro"].includes(kindOf(s.name)))));
  if (odd.length) notes.push(`${odd.map((s) => `${s.name} is ${s.bars} bars`).join(", ")}: the store's sections run in phrases of 8, 16 or 32.`);
  // Where the first peak lands.
  let bar = 0; let firstPeak: number | null = null;
  for (const s of secs) { if (firstPeak === null && kindOf(s.name) === "peak") firstPeak = bar; bar += s.bars; }
  if (firstPeak !== null && e.first_peak_bar) {
    if (firstPeak > e.first_peak_bar.p75 * 1.5) notes.push(`The first ${secs.find((s) => kindOf(s.name) === "peak")?.name ?? "drop"} lands at bar ${firstPeak}; the store's first peak lands at bar ${e.first_peak_bar.p50} (middle half ${e.first_peak_bar.p25} to ${e.first_peak_bar.p75}).`);
    else if (firstPeak === 0) notes.push(`The record opens on its peak; ${Math.round((g.first_chorus_bar?.p50 ?? 16))} bars of intro or build is the store's habit.`);
  }
  // Energy: peaks near each other, breaks deep enough, boundary jumps sized to the store.
  const peaks = secs.filter((s) => kindOf(s.name) === "peak" && typeof s.energy === "number");
  if (peaks.length >= 2 && e.second_peak_over_first) {
    const ratio = (peaks[1].energy as number) / Math.max(0.01, peaks[0].energy as number);
    if (ratio > 1.08) notes.push(`${peaks[1].name} is set louder than ${peaks[0].name} (${(peaks[1].energy as number).toFixed(2)} against ${(peaks[0].energy as number).toFixed(2)}); the store's second peak returns to ${e.second_peak_over_first.p50.toFixed(2)} of the first, not above it.`);
  }
  // A break is measured against the peak right before it.
  if (e.break_depth) {
    for (let i = 1; i < secs.length; i++) {
      if (kindOf(secs[i].name) !== "break" || typeof secs[i].energy !== "number") continue;
      const prev = [...secs.slice(0, i)].reverse().find((s) => kindOf(s.name) === "peak" && typeof s.energy === "number");
      if (!prev) continue;
      const depth = (prev.energy as number) - (secs[i].energy as number);
      if (depth < e.break_depth.p25) notes.push(`${secs[i].name} only falls ${depth.toFixed(2)} below ${prev.name}; the store's breaks fall ${e.break_depth.p50.toFixed(2)} (middle half ${e.break_depth.p25.toFixed(2)} to ${e.break_depth.p75.toFixed(2)}).`);
    }
  }
  if (e.boundary_jump) {
    for (let i = 1; i < secs.length; i++) {
      const a = secs[i - 1].energy, b = secs[i].energy; if (typeof a !== "number" || typeof b !== "number") continue;
      const jump = Math.abs(b - a); const next = kindOf(secs[i].name);
      // A rise into a peak is the drop; a fall into a break or the outro is the release. Anything else that jumps this far is a cut.
      const expected = (b > a && (next === "peak" || next === "build")) || (b < a && (next === "break" || next === "outro"));
      if (jump > e.boundary_jump.p75 * 2 && !expected) notes.push(`${secs[i - 1].name} into ${secs[i].name} jumps ${jump.toFixed(2)}; the store's boundaries move ${e.boundary_jump.p50.toFixed(2)} (upper quarter ${e.boundary_jump.p75.toFixed(2)}) unless the next section is the drop. A transition op smooths it.`);
    }
  }
  if (g.two_peaks_share !== null && peaks.length === 1 && bar >= 96) notes.push(`One peak in ${bar} bars; ${Math.round(g.two_peaks_share * 100)}% of the store's records carry two.`);
  return notes.slice(0, 5);
}
