// The owned lane: sound the product may keep, serve and play for anyone, because the license says so or because we
// paid for it outright. Freesound CC0, the other CC0 libraries the starter pack was built from, and commissioned
// sounds with a written buyout. Every file is listed with its license and its exact bytes in docs/SOURCES_MANIFEST.json,
// and tests/sources.test.mjs holds the pack, the manifest and lib/samples-attribution.ts to each other.
//
// The ranking bends a sound onto the grid the way a producer's sample browser does: a loop is stretched to the grid
// (at its own tempo, or at double or half time, whichever bends it least) and moved a few semitones into the grid's
// key. Every tempo and key carries the catalog's confidence, and a tempo the pack only inferred is said to be unsure.
import { ATTRIBUTION_FREE, attributionFree, sampleKey, type Manifest, type SampleEntry } from "../samples/manifest";
import { parseKey } from "../song/harmony";
import { TEMPO_PRIOR, KEY_PRIOR } from "../ritual/source";
import type { Candidate, Lane, License, Want } from "./lane";

/** Licenses the owned lane accepts: no credit owed, nothing that ties the sound to one person. */
export const OWNED_LICENSES: readonly string[] = ATTRIBUTION_FREE;
export const ownedLicense = (license: string) => OWNED_LICENSES.includes(license.trim());
/** The seed is a voice (law 2), so "next" draws vocals from the library. */
export const SEED_ROLES = ["vocal"] as const;
/** A tempo the pack inferred from a loop's length rather than tagged: a guess about how many bars it holds. */
export const INFERRED_TEMPO = 0.5;
const MAX_STRETCH = Math.log(1.12);   // past twelve percent a stretched voice smears; that is no fit at all
const MAX_SHIFT = 3;                  // past three semitones a moved voice turns into a cartoon

export function tempoOf(e: SampleEntry): { bpm: number | null; confidence: number } {
  if (!e.bpm) return { bpm: null, confidence: 0 };
  return { bpm: e.bpm, confidence: /inferred/i.test(e.note ?? "") ? INFERRED_TEMPO : TEMPO_PRIOR };
}

/** The tempo a loop is best treated as on this grid (its own, double or half) and how far it must stretch from there. */
export function stretchTo(bpm: number, grid: number): { playsAt: number; stretch: number } {
  let best = { playsAt: bpm, stretch: Infinity };
  for (const k of [1, 2, 0.5]) {
    const stretch = Math.abs(Math.log(grid / (bpm * k)));
    if (stretch < best.stretch - 1e-9) best = { playsAt: bpm * k, stretch };
  }
  return best;
}

/** How many semitones move a key onto the grid's (to the grid's relative when the modes differ), smallest way round. */
export function shiftTo(key: string | null | undefined, grid: string | null | undefined): number | null {
  const a = key ? parseKey(key) : null, g = grid ? parseKey(grid) : null;
  if (!a || !g) return null;
  const target = a.mode === g.mode ? g.pc : a.mode === "minor" ? (g.pc + 9) % 12 : (g.pc + 3) % 12;
  return ((target - a.pc + 18) % 12) - 6;
}

const bars = (sec: number, bpm: number) => (sec * bpm) / 240;
/** Whole bars on the grid: a loop keeps its own length in bars (1, 2, 4 or 8); a phrase with no tempo gets the bars it spans. */
function beatsFor(e: SampleEntry, playsAt: number | null, grid: number): number {
  const sec = e.seconds ?? 0;
  if (!playsAt) return 4 * Math.max(1, Math.ceil(bars(sec, grid) - 0.05));
  const n = Math.max(1, Math.round(bars(sec, playsAt)));
  return 4 * [1, 2, 4, 8].reduce((b, c) => (Math.abs(c - n) < Math.abs(b - n) ? c : b), 1);
}

export function licenseOf(e: SampleEntry): License {
  return { name: e.license, holder: "product", url: e.url, credit: attributionFree(e.license) ? null : e.attribution || null };
}

/** One library sound as a seed on this grid, with how well it fits. */
export function candidateOf(e: SampleEntry, want: Want): Candidate {
  const t = tempoOf(e);
  const s = t.bpm ? stretchTo(t.bpm, want.bpm) : null;
  const tempoFit = s ? Math.max(0, 1 - s.stretch / MAX_STRETCH) : 0.6;   // a phrase with no tempo is not stretched at all
  const shift = shiftTo(e.key, want.key);
  const semitones = shift !== null && Math.abs(shift) <= MAX_SHIFT ? shift : 0;
  const keyFit = shift === null ? 0.5 : Math.abs(shift) <= MAX_SHIFT ? 1 - Math.abs(shift) * 0.1 : 0.2;
  const playsAt = s ? Math.round(s.playsAt * 10) / 10 : null;
  return {
    lane: "owned", id: `owned:${e.id}`, name: e.name, role: e.role,
    clip: { clipId: sampleKey(e.id), sampleId: e.id, name: e.name, ...(playsAt ? { bpm: playsAt } : {}), startSec: 0, gainDb: 0, semitones, durationSec: e.seconds },
    beats: beatsFor(e, playsAt, want.bpm),
    bpm: t.bpm, playsAt, tempoConfidence: t.confidence,
    key: e.key ?? null, keyConfidence: e.key ? KEY_PRIOR : 0,
    semitones, fit: Math.round((0.6 * tempoFit + 0.4 * keyFit) * 100) / 100, license: licenseOf(e),
  };
}

/** The owned lane over the starter library: the sounds that can be the seed, best fit first. */
export function ownedLane(m: Manifest): Lane {
  return {
    id: "owned", on: true,
    async candidates(want) {
      const roles: readonly string[] = want.roles ?? SEED_ROLES;
      return m.samples.filter((e) => roles.includes(e.role) && ownedLicense(e.license))
        .map((e) => candidateOf(e, want))
        .sort((a, b) => b.fit - a.fit || a.id.localeCompare(b.id));
    },
  };
}
