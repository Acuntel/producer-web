// The vocal placement prior from records (data/dna/vocal_drops.json, rolled up by tools/dna/vocal_drops.py from every
// record the worker heard): the lead-in gap before a drop for the source's family and tempo band. A group speaks only
// once it rests on enough records (minRecords, 8); until then the planner keeps its rule priors. Tone-free.
import drops from "../../data/dna/vocal_drops.json";

type Q = { p25: number; p50: number; p75: number; n: number } | null;
type Group = { records: number; leadInBeats: Q; hookSections?: Record<string, number> };
const DATA = drops as unknown as { minRecords: number; groups: Record<string, Group> };

function band(bpm: number): string | null {
  const keys = Object.keys(DATA.groups).map((k) => k.split("|")[1]).filter((b) => /^\d+-\d+$/.test(b));
  return keys.find((b) => { const [lo, hi] = b.split("-").map(Number); return bpm >= lo && bpm < hi; }) ?? null;
}

/** The prior for a voice from `family` at `bpm`: its lead-in gap in beats, from the nearest group with enough records. */
export function vocalPrior(family: string | null, bpm: number): { leadInBeats: number; records: number; group: string } | null {
  const b = band(bpm);
  const tries = [family && b ? `${family}|${b}|*` : null, family ? `${family}|*|*` : null, "*|*|*"].filter((x): x is string => !!x);
  for (const k of tries) {
    const g = DATA.groups[k];
    if (g && g.records >= DATA.minRecords && g.leadInBeats && g.leadInBeats.n > 0) return { leadInBeats: Math.max(0, Math.min(8, g.leadInBeats.p50)), records: g.records, group: k };
  }
  return null;
}
