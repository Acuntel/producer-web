// A TypeScript port of tools/dna/harmony.py for records the studio hears: chord names to roman numerals in the
// record's key, run collapse, the harmony class, structure codes from the energy blocks, and the grids the hearing
// returns folded to the store's 16-step form. Pure functions; the heard route uses them.
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DEGREES = ["I", "bII", "II", "bIII", "III", "IV", "bV", "V", "bVI", "VI", "bVII", "VII"];
const MINOR_QUALITIES = new Set(["min", "min7", "dim"]);

export function parseChord(token: string): { rootPc: number; quality: string } | null {
  const m = /^([A-G])([#b]?)(.*)$/.exec((token ?? "").trim());
  if (!m) return null;
  let pc = LETTER_PC[m[1]]; if (m[2] === "#") pc = (pc + 1) % 12; if (m[2] === "b") pc = (pc + 11) % 12;
  const r = m[3].toLowerCase();
  const quality = r.startsWith("maj7") ? "maj7" : r === "" || r === "maj" ? "maj" : r.startsWith("dim") || r === "o" ? "dim" : r.startsWith("min7") || r.startsWith("m7") ? "min7" : r.startsWith("min") || r.startsWith("m") ? "min" : r.startsWith("aug") || r.startsWith("+") ? "aug" : r.startsWith("sus") ? "sus" : r.startsWith("7") ? "7" : "maj";
  return { rootPc: pc, quality };
}
export function keyPcOf(keyName: string | null | undefined): { pc: number; mode: "major" | "minor" } | null {
  const m = /^([A-G][#b]?)\s*(major|minor|maj|min|m)?/i.exec((keyName ?? "").trim()); if (!m) return null;
  const c = parseChord(m[1]); if (!c) return null;
  const mode = /min|^m$/i.test(m[2] ?? "") ? "minor" : "major";
  return { pc: c.rootPc, mode };
}
export const toRoman = (rootPc: number, quality: string, keyPc: number) => { const sym = DEGREES[(rootPc - keyPc + 12) % 12]; return MINOR_QUALITIES.has(quality) ? sym.toLowerCase() : sym; };
export function collapseRuns(symbols: string[], max = 24): string { const out: string[] = []; for (const s of symbols) if (!out.length || out[out.length - 1] !== s) out.push(s); return out.slice(0, max).join(" "); }
/** Absolute chord names from the hearing ("Am", "F", "-") to a condensed roman progression in the record's key. */
export function progressionOf(chords: string[], keyName: string | null | undefined): string | null {
  const k = keyPcOf(keyName); if (!k) return null;
  const syms = chords.map(parseChord).filter((c): c is { rootPc: number; quality: string } => !!c).map((c) => toRoman(c.rootPc, c.quality, k.pc));
  return syms.length ? collapseRuns(syms) : null;
}
const CYCLES: Record<string, string[]> = { axis: ["I", "V", "vi", "IV"], minor_axis: ["i", "bVI", "bIII", "bVII"], doo_wop: ["I", "vi", "IV", "V"], andalusian: ["i", "bVII", "bVI", "V"] };
function cyclicContains(seq: string[], cycle: string[]): boolean {
  const n = cycle.length; if (seq.length < n) return false;
  const doubled = [...seq, ...seq.slice(0, n - 1)];
  for (let r = 0; r < n; r++) { const rot = [...cycle.slice(r), ...cycle.slice(0, r)]; for (let i = 0; i + n <= doubled.length; i++) { let ok = true; for (let j = 0; j < n; j++) if (doubled[i + j] !== rot[j]) { ok = false; break; } if (ok) return true; } }
  return false;
}
export function harmonyClass(progression: string): string {
  const seq = progression.split(/\s+/).filter(Boolean); const distinct = [...new Set(seq)];
  if (distinct.length === 1) return "one_chord"; if (distinct.length === 2) return "two_chord";
  if (distinct.length === 3 && ["I", "IV", "V"].every((x) => distinct.includes(x))) return "blues";
  for (const [name, cyc] of Object.entries(CYCLES)) if (cyclicContains(seq, cyc)) return name;
  if (distinct.some((s) => s.startsWith("b")) && distinct.length >= 3) return "modal_mixture";
  return "other";
}
/** Section codes from 8-bar energy blocks: I intro, B build, D drop, K break, O outro, V verse-like plateau. */
export function structureOf(blocks: { energy?: number; level?: number }[]): string | null {
  const e = blocks.map((b) => Number(b.energy ?? b.level ?? 0)); if (e.length < 2) return null;
  const codes: string[] = [];
  for (let i = 0; i < e.length; i++) {
    const prev = i ? e[i - 1] : 0, next = i + 1 < e.length ? e[i + 1] : e[i];
    if (i === 0 && e[i] < 0.6) codes.push("I");
    else if (i === e.length - 1 && e[i] < 0.6) codes.push("O");
    else if (e[i] >= 0.85 && prev < e[i] - 0.15) codes.push("D");
    else if (e[i] >= 0.85) codes.push("D");
    else if (e[i] < 0.5 && prev >= 0.7) codes.push("K");
    else if (next > e[i] + 0.15 && e[i] < 0.85) codes.push("B");
    else codes.push("V");
  }
  return collapseRuns(codes, 32);
}
/** The hearing's grids use X (strong), x, g (ghost), .; the store keeps X and . (an x counts as a hit). */
export const grid16 = (g: string | null | undefined): string | null => (g && g.length === 16 ? g.replace(/[xX]/g, "X").replace(/[^X]/g, ".") : null);
/** The bass line's eighth rhythm ("X.X.X.X.") to the store's 16 steps. */
export const bass16 = (eighths: string | null | undefined): string | null => (eighths && eighths.length === 8 ? [...eighths].map((c) => (c === "X" ? "X." : "..")).join("") : null);
export const syncopationOf = (grid: string | null) => { if (!grid) return null; const hits = [...grid].map((c, i) => [c === "X", i] as const).filter(([h]) => h); if (!hits.length) return null; return Math.round((hits.filter(([, i]) => i % 4 !== 0).length / hits.length) * 1000) / 1000; };
const FAMILY_KEYS: [string, string[]][] = [["house", ["house"]], ["techno", ["techno"]], ["trance", ["trance"]], ["garage", ["garage", "2-step"]], ["dnb", ["drum and bass", "dnb", "jungle"]], ["dubstep", ["dubstep"]], ["hardstyle", ["hardstyle", "hardcore"]], ["disco", ["disco"]], ["electronic", ["edm", "electro", "dance", "electronic", "ambient", "breakbeat"]], ["hiphop", ["hip hop", "hip-hop", "rap", "trap"]], ["rnb", ["r&b", "rnb", "soul", "funk"]], ["country", ["country"]], ["latin", ["latin", "reggaeton"]], ["jazz", ["jazz", "blues"]], ["classical", ["classical"]], ["folk", ["folk"]], ["metal", ["metal"]], ["rock", ["rock", "punk", "indie"]], ["pop", ["pop"]], ["world", ["afro", "reggae", "world"]]];
/** The CLAP genre votes ([label, score] pairs) folded to a family, the top vote first. */
export function familyFromGenres(genres: unknown): string | null {
  const labels = Array.isArray(genres) ? genres.map((g) => (Array.isArray(g) ? String(g[0]) : typeof g === "string" ? g : "")).filter(Boolean) : [];
  for (const l of labels) { const t = l.toLowerCase(); for (const [fam, words] of FAMILY_KEYS) if (words.some((w) => t.includes(w))) return fam; }
  return null;
}
