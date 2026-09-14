// Feel: numbers into the read a person would give. Four axes, 0 to 1, and the words
// Brady uses for them. The same formula runs on the ears' measurement of a render, on a
// reference, and (in tools/dna/feel.py) on every row of the store, so "boppy" means the
// same thing everywhere. Grounded in music emotion research: mode carries valence, tempo
// and loudness carry arousal, dissonance and unresolved harmony carry tension, low-mid
// weight and slow attacks carry warmth.
export type Feel = { valence: number; arousal: number; tension: number; warmth: number; words: string[]; line: string };

export type FeelInput = {
  mode?: "major" | "minor" | null;
  tempo?: number | null;
  energy?: number | null;         // 0..1 prior (spotify-like) or derived from LUFS
  valencePrior?: number | null;   // 0..1 when a source gives one
  acousticness?: number | null;   // 0..1
  syncopation?: number | null;    // 0..1
  borrowed?: number | null;       // chords outside the key
  harmonyClass?: string | null;
  family?: string | null;
  lufs?: number | null;           // integrated loudness of a render or a record
  centroidHz?: number | null;
  harshness?: number | null;      // highMid share 0..1
  mud?: number | null;            // lowMid pileup 0..1
  lowMidShare?: number | null;
  attackSlow?: boolean | null;    // pads or slow envelopes carry the record
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const norm = (x: number, lo: number, hi: number) => clamp01((x - lo) / (hi - lo));

export function feelOf(x: FeelInput): Feel {
  const major = x.mode === "major" ? 1 : 0, minor = x.mode === "minor" ? 1 : 0;
  const tempo = typeof x.tempo === "number" && x.tempo > 0 ? fold(x.tempo) : null;
  const energy = typeof x.energy === "number" ? clamp01(x.energy) : typeof x.lufs === "number" ? norm(x.lufs, -20, -6) : 0.5;
  const borrowed = typeof x.borrowed === "number" ? x.borrowed : 0;
  const tension = clamp01(0.30 + 0.25 * minor + 0.30 * norm(borrowed, 0, 6) + 0.15 * (x.harmonyClass === "modal_mixture" || x.harmonyClass === "other" ? 1 : 0) + 0.25 * (x.harshness ?? 0) * 2);
  const valence = clamp01(0.5 + 0.25 * major - 0.25 * minor + 0.20 * ((x.valencePrior ?? 0.5) - 0.5) + 0.10 * (tempo !== null && tempo >= 100 && tempo <= 130 ? 1 : 0) - 0.10 * (tension - 0.5) + 0.10 * (typeof x.centroidHz === "number" ? norm(x.centroidHz, 1200, 3200) - 0.5 : 0));
  const arousal = clamp01(0.15 + 0.45 * (tempo !== null ? norm(tempo, 60, 180) : 0.5) + 0.30 * energy + 0.10 * (x.syncopation ?? 0.3));
  const warmth = clamp01(0.35 + 0.25 * (x.acousticness ?? 0.3) + 0.20 * major - 0.20 * (tempo !== null ? norm(tempo, 60, 180) : 0.5) + 0.10 * (["rnb", "jazz", "folk"].includes(x.family ?? "") ? 1 : 0) + 0.15 * clamp01((x.lowMidShare ?? 0.12) * 4) + 0.10 * (x.attackSlow ? 1 : 0) - 0.10 * (x.harshness ?? 0) * 2);
  const words = wordsFor(valence, arousal, tension, warmth);
  return { valence: r2(valence), arousal: r2(arousal), tension: r2(tension), warmth: r2(warmth), words, line: `feel: ${words.join(", ")} (valence ${r2(valence)}, arousal ${r2(arousal)}, tension ${r2(tension)}, warmth ${r2(warmth)})` };
}

// His words. Happiness is the sun (warm yellow rush); sadness is the gut. The rest fill the map.
export function wordsFor(valence: number, arousal: number, tension: number, warmth: number): string[] {
  const out: string[] = [];
  if (valence >= 0.62 && arousal >= 0.6) out.push("sun", "rush");
  else if (valence >= 0.62) out.push("warm", "lift");
  else if (valence <= 0.38 && arousal <= 0.45) out.push("gut", "ache");
  else if (valence <= 0.38) out.push("cold", "snap");
  else if (arousal >= 0.7) out.push("rush");
  else if (arousal <= 0.35) out.push("drag");
  else out.push("steady");
  if (tension >= 0.6) out.push("tense"); else if (tension <= 0.3) out.push("open");
  if (warmth >= 0.6 && !out.includes("warm")) out.push("warm"); else if (warmth <= 0.3 && !out.includes("cold")) out.push("cold");
  if (arousal >= 0.75 && valence < 0.62) out.push("weight");
  return out.slice(0, 4);
}

function fold(bpm: number): number { let b = bpm; while (b < 60) b *= 2; while (b > 180) b /= 2; return b; }
const r2 = (x: number) => Math.round(x * 100) / 100;

/** The ears' MusicFacts (or any object shaped like it) into a Feel. Loose typing on purpose: the facts shape has grown over time. */
export function feelFromFacts(f: unknown): Feel | null {
  if (!f || typeof f !== "object") return null;
  const o = f as { key?: { mode?: string }; tempo?: { bpm?: number }; loudness?: { integrated?: number }; spectrum?: { centroidHz?: number; harshness?: number; mud?: number; bands?: { lowMid?: number } }; groove?: { swing?: number; transientsPerBeat?: number }; chords?: { progression?: string[] } };
  const sync = typeof o.groove?.transientsPerBeat === "number" ? clamp01((o.groove.transientsPerBeat - 2) / 8) : null;
  return feelOf({
    mode: o.key?.mode === "major" ? "major" : o.key?.mode === "minor" ? "minor" : null,
    tempo: o.tempo?.bpm ?? null, lufs: o.loudness?.integrated ?? null,
    centroidHz: o.spectrum?.centroidHz ?? null, harshness: o.spectrum?.harshness ?? null, mud: o.spectrum?.mud ?? null, lowMidShare: o.spectrum?.bands?.lowMid ?? null,
    syncopation: sync, borrowed: 0,
  });
}
