// The resolver: a name Brady said, turned into the numbers a draft is compiled from. Best first: a record the
// studio's own ears have heard (dna_heard: its grids, bass, chords, sections, palette); else the artist's records
// in the store (the prints: tempo, key, family, energy) with the artist row and its Galton bin (kick grid, bass
// rhythm, progressions, contour, form); else a lane the words name. Server only; no model, no download.
import { norm } from "./norm";
import { artistRows, findRecord, printOf, type Print } from "./prints";
import { binsFor, type Pin } from "./galton";
import { laneNamed, laneInfo } from "./laneNames";
import { grid16, bass16 } from "./harmony";
import { supabaseAdmin } from "@/lib/account/supabase";
import { parseRecordName, tempoPrior, keyNameOf, TEMPO_PRIOR } from "@/lib/ritual/source";
import { recipeFor } from "@/lib/song/drafting/recipes";
import type { DraftDna } from "@/lib/song/drafting/types";

type Heard = { title: string | null; artist: string | null; tempo: number | null; key_name: string | null; kick_grid: string | null; snare_grid: string | null; hat_grid: string | null; bass_rhythm: string | null; progression: string | null; structure: string | null; energy_contour: number[] | null; family: string | null; descriptors: string | null };
type ArtistDb = { tempo_p50?: number | null; top_keys?: unknown; top_progressions?: unknown; structure_mode?: string | null; kick_grid_mode?: string | null; bass_rhythm_mode?: string | null; melody_contour_mode?: string | null; families?: string[] | null; energy_p50?: number | null; valence_p50?: number | null };

const within = <T>(p: PromiseLike<T>, ms: number, fallback: T): Promise<T> => Promise.race([Promise.resolve(p).catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

// A title said on its own must be the whole title ("love" is not every record with love in it); with an artist, part of it will do.
async function heardRow(artist: string | null, title: string | null): Promise<Heard | null> {
  const sb = supabaseAdmin(); if (!sb || (!artist && !title) || (artist && norm(artist).length < 3)) return null;
  let q = sb.from("dna_heard").select("title,artist,tempo,key_name,kick_grid,snare_grid,hat_grid,bass_rhythm,progression,structure,energy_contour,family,descriptors");
  if (artist) q = q.ilike("artist_norm", `%${norm(artist)}%`);
  if (title) q = artist ? q.ilike("title_norm", `%${norm(title)}%`) : q.eq("title_norm", norm(title));
  const r = await q.order("heard_count", { ascending: false }).limit(1);
  const row = (r.data?.[0] ?? null) as Heard | null;
  return row?.tempo ? row : null;
}
async function artistDb(name: string): Promise<ArtistDb | null> {
  const sb = supabaseAdmin(); if (!sb) return null;
  const r = await sb.from("dna_artists").select("tempo_p50,top_keys,top_progressions,structure_mode,kick_grid_mode,bass_rhythm_mode,melody_contour_mode,families,energy_p50,valence_p50").eq("artist_norm", norm(name)).limit(1);
  return (r.data?.[0] ?? null) as ArtistDb | null;
}

const count = <T extends string>(xs: (T | null | undefined)[]) => { const m = new Map<T, number>(); for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const band = (bpm: number) => (bpm < 90 ? "<90" : bpm < 110 ? "90-110" : bpm < 122 ? "110-122" : bpm < 132 ? "122-132" : bpm < 145 ? "132-145" : bpm < 160 ? "145-160" : ">160");

/** The lane a family plays in at a tempo and an energy (the words' own lane always wins). */
export function laneFor(family: string | null, bpm: number, energy: number | null, valence: number | null): string {
  const e = energy ?? 0.7;
  switch (family) {
    case "house": return bpm >= 136 ? "hard-house" : e < 0.62 ? "deep-house" : bpm <= 124 && (valence ?? 0.5) < 0.35 ? "melodic-house" : "tech-house";
    case "techno": return "techno";
    case "trance": return "trance";
    case "garage": return "uk-garage";
    case "hardstyle": return "hardstyle";
    case "dnb": case "dubstep": return "trap-club";
    case "hiphop": return bpm >= 130 ? "trap-club" : "pop";
    case "rnb": return bpm < 112 ? "pop" : "deep-house";
    case "pop": return "pop";
    case "disco": case "jazz": return e < 0.62 ? "deep-house" : "tech-house";
    case "latin": case "world": return "afro-house";
    case "rock": case "folk": case "metal": case "country": case "classical": return "psychedelic";
    default: return bpm < 110 ? "pop" : bpm <= 126 ? (e < 0.62 ? "melodic-house" : "tech-house") : bpm <= 136 ? "techno" : bpm <= 150 ? "trance" : "hardstyle";
  }
}
/** A tempo folded into the lane's world when it is an octave out (a 64 that a house record plays at 128). */
function foldTo(lane: string, bpm: number): number {
  const [lo, , hi] = recipeFor(lane).bpm;
  if (bpm >= lo - 14 && bpm <= hi + 14) return bpm;
  for (const x of [bpm * 2, bpm / 2]) if (x >= lo - 14 && x <= hi + 14) return x;
  return bpm;
}

// binsFor scans every bin; one request asks it the same few questions, and the bins never change in a process.
const binMemo = new Map<string, ReturnType<typeof binsFor>>();
const bins = (w: Partial<Record<Pin, string>>) => { const k = JSON.stringify(w); let b = binMemo.get(k); if (!b) { b = binsFor(w, 3); if (binMemo.size > 2000) binMemo.clear(); binMemo.set(k, b); } return b; };

function galton(pins: Partial<Record<Pin, string>>, from: string[]) {
  // A bin that pins only the tempo or the family is the whole catalog's habit, not this artist's: its grids are
  // left to the lane, and its progressions count for little.
  const order: Pin[][] = [["tempo_band", "mode", "energy_band", "feel", "decade", "family"], ["tempo_band", "mode", "energy_band", "family"], ["tempo_band", "mode", "family"], ["tempo_band", "family"], ["family"], ["tempo_band"]];
  const depth = (k: string) => Number(k.split(":")[0]) || 0;
  const wants = order.map((ps) => Object.fromEntries(ps.filter((p) => pins[p]).map((p) => [p, pins[p]]))).filter((w) => Object.keys(w).length);
  const first = (k: "kick" | "bass" | "contour") => { for (const w of wants) for (const b of bins(w)) if (b[k] && depth(b.key) >= 3) return b[k]; return null; };
  let progressions: [string, number][] = [];
  for (const w of wants) {
    const b = bins(w).find((x) => x.progressions.length);
    if (b) { const deep = depth(b.key) >= 3; progressions = b.progressions.slice(0, 5).map(([p, n]) => [p, deep ? n : 0.5]); from.push(`Galton bin ${b.key} (${b.count} songs)`); break; }
  }
  const kick = first("kick"), bass = first("bass");
  return { kick: kick && kick.length === 16 ? kick : null, bass: bass ? (bass.length === 8 ? bass16(bass) : bass.length === 16 ? bass : null) : null, contour: first("contour"), progressions };
}

const cache = new Map<string, DraftDna | null>();

/** The DNA for a name, or null when nothing in the store knows it and it names no lane. */
export async function resolveDraftDna(ask: string, o?: { timeoutMs?: number }): Promise<DraftDna | null> {
  const name = ask.replace(/["“”]/g, "").replace(/[.?!]+$/, "").trim().slice(0, 120);
  const key = norm(name); if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  const { artist, title } = parseRecordName(name);
  const who = artist ?? title;
  const words = laneNamed(key);
  const ms = o?.timeoutMs ?? 900;
  const [heard, adb, heardAlt] = await Promise.all([
    within(heardRow(artist ?? who, artist ? title : null), ms, null),
    within(artistDb(who), ms, null),
    artist ? Promise.resolve(null) : within(heardRow(null, title), ms, null),
  ]);
  const rows: Print[] = artistRows(norm(who), 400).map(printOf);
  const rec = artist ? findRecord(norm(artist), norm(title)) : null;
  const h = heard ?? (rows.length || adb ? null : heardAlt);
  const from: string[] = [];
  let dna: DraftDna | null = null;
  if (h) {
    const fam = h.family ?? null;
    const lane = words ?? laneFor(fam, h.tempo!, null, null);
    const t = tempoPrior(foldTo(lane, h.tempo!), fam);
    from.push(`heard by the studio: ${h.artist ?? "?"}, ${h.title ?? "?"}`);
    dna = { v: 1, name: `${h.title ?? title}${h.artist ? ` by ${h.artist}` : ""}`, key, tier: "heard", lane, family: fam, bpm: t.bpm, tempoConfidence: 0.85,
      keys: h.key_name ? [[h.key_name, 5]] : [], energy: null, valence: null,
      grids: { kick: grid16(h.kick_grid) ?? h.kick_grid, snare: h.snare_grid, hat: h.hat_grid }, bass: h.bass_rhythm,
      progressions: h.progression ? [[h.progression, 4]] : [], contour: null, structure: h.structure, energyContour: h.energy_contour,
      palette: (h.descriptors ?? "").split(/,\s*/).filter(Boolean), voice: null, from };
  } else if (rows.length || adb) {
    const one = rec !== null ? printOf(rec) : null;
    const fams = count(rows.map((p) => p.family));
    const family = one?.family ?? fams[0]?.[0] ?? adb?.families?.[0] ?? null;
    const energy = rows.length ? rows.reduce((a, p) => a + p.energy, 0) / rows.length : adb?.energy_p50 ?? null;
    const valence = rows.length ? rows.reduce((a, p) => a + p.valence, 0) / rows.length : adb?.valence_p50 ?? null;
    const arousal = rows.length ? rows.reduce((a, p) => a + p.arousal, 0) / rows.length : 0.5;
    const raw = one?.tempo ?? median(rows.map((p) => p.tempo).filter((x): x is number => !!x)) ?? adb?.tempo_p50 ?? 124;
    const lane = words ?? laneFor(family, raw, energy, valence);
    const t = tempoPrior(foldTo(lane, raw), family);
    const keyCounts = count(rows.map((p) => keyNameOf(p.keyPc, p.mode ?? "minor") ?? null)).slice(0, 5) as [string, number][];
    if (!keyCounts.length && Array.isArray(adb?.top_keys)) for (const [pc, n] of adb!.top_keys as [string, number][]) { const k = keyNameOf(Math.round(Number(pc)), "minor"); if (k) keyCounts.push([k, n]); }
    const oneKey = one ? keyNameOf(one.keyPc, one.mode ?? "minor") : undefined;
    const modes = count(rows.map((p) => p.mode));
    const decades = count(rows.map((p) => (p.year ? String(Math.floor(p.year / 10) * 10) : null)));
    const eb = (energy ?? 0.6) < 0.4 ? "low" : (energy ?? 0.6) < 0.6 ? "mid" : (energy ?? 0.6) < 0.8 ? "high" : "peak";
    const feel = (valence ?? 0.5) >= 0.5 ? (arousal >= 0.5 ? "lift" : "sun") : arousal >= 0.5 ? "rush" : "gut";
    const g = galton({ tempo_band: band(t.bpm), mode: modes[0]?.[0] ?? undefined, energy_band: eb, feel, decade: decades[0]?.[0], family: family ?? undefined }, from);
    const dbProgs = Array.isArray(adb?.top_progressions) ? (adb!.top_progressions as [string, number][]).filter((p) => typeof p?.[0] === "string").map(([p, n]) => [p, n + 1] as [string, number]) : [];
    if (rows.length) from.push(`${rows.length} of ${who}'s records in the store`);
    if (adb) from.push(`the artist row for ${who}`);
    const plainest = rows.map((p) => p.artist).filter(Boolean).sort((a, b) => a.length - b.length)[0];
    const display = one ? `${one.title} by ${one.artist}` : plainest ?? (words ? laneInfo(words)?.name ?? who : who);
    dna = { v: 1, name: display, key, tier: "artist", lane, family, bpm: t.bpm, tempoConfidence: t.confidence ?? TEMPO_PRIOR,
      keys: oneKey ? [[oneKey, 6], ...keyCounts.filter(([k]) => k !== oneKey)] : keyCounts, energy, valence,
      grids: { kick: adb?.kick_grid_mode && adb.kick_grid_mode.length === 16 ? adb.kick_grid_mode : g.kick }, bass: adb?.bass_rhythm_mode ? bass16(adb.bass_rhythm_mode) ?? g.bass : g.bass,
      progressions: [...dbProgs, ...g.progressions], contour: adb?.melody_contour_mode ?? g.contour, structure: adb?.structure_mode ?? null, energyContour: null,
      palette: family ? [family] : [], voice: count(rows.map((p) => p.voice))[0]?.[0] as "vocal" | "instrumental" | undefined ?? null, from };
  } else if (words) {
    const r = recipeFor(words);
    from.push(`the ${words} recipe`);
    dna = { v: 1, name: laneInfo(words)?.name ?? words, key, tier: "lane", lane: words, family: null, bpm: r.bpm[1], tempoConfidence: 0.5,
      keys: r.keys.map((k, i) => [k, r.keys.length - i] as [string, number]), energy: null, valence: null, progressions: [], contour: null, structure: null, energyContour: null, palette: [], voice: null, from };
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, dna);
  return dna;
}
