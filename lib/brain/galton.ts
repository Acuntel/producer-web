// The Galton board: where a request lands in the store, and what it finds there.
// Server only. Artist and song lookups hit the dna_* tables when they exist; the bin
// medians come from data/galton.json, which ships in the repo so the grammar is
// available with no database at all.
import { norm } from "./norm";
import galtonJson from "../../data/galton.json";
import { supabaseAdmin } from "@/lib/account/supabase";

// data/galton.json is a compact export: index tables (songs, progressions, grids) and bins keyed
// "depth:pin1|pin2|..." in PIN order, each bin a positional array in bin_fields order.
// Pin order matches tools/dna/bins.py PIN_ORDER: the pins every audio-measured song can answer first.
const PINS = ["tempo_band", "mode", "energy_band", "feel", "decade", "family", "voice", "meter_feel", "structure_archetype", "harmony_class", "hit_tier"] as const;
export type Pin = (typeof PINS)[number];
export type Bin = { key: string; pins: Record<Pin, string>; count: number; tempo: number | null; modeMajor: number | null; progressions: [string, number][]; kick: string | null; bass: string | null; contour: string | null; energy: number[] | null; exemplars: string[] };
type GaltonFile = { builtAt?: string | null; bin_fields?: string[]; songs?: string[]; progressions?: string[]; grids?: string[]; bins?: Record<string, unknown[]> };
const GALTON = galtonJson as unknown as GaltonFile;

function decodeBin(key: string, raw: unknown[]): Bin {
  const f = GALTON.bin_fields ?? ["count", "tempo_p50", "mode_share", "top_progressions", "top_kick_grid", "top_bass_rhythm", "top_contour", "energy_contour", "exemplars"];
  const at = (name: string) => raw[f.indexOf(name)];
  const grids = GALTON.grids ?? [], progs = GALTON.progressions ?? [], songs = GALTON.songs ?? [];
  const idx = (v: unknown, table: string[]) => (typeof v === "number" && table[v] !== undefined ? table[v] : null);
  const values = key.slice(key.indexOf(":") + 1).split("|");
  const pins = Object.fromEntries(PINS.map((p, i) => [p, values[i] ?? "unknown"])) as Record<Pin, string>;
  const prog = at("top_progressions");
  return {
    key, pins,
    count: Number(at("count") ?? 0),
    tempo: typeof at("tempo_p50") === "number" ? (at("tempo_p50") as number) : null,
    modeMajor: typeof at("mode_share") === "number" ? (at("mode_share") as number) : null,
    progressions: Array.isArray(prog) ? (prog as [number, number][]).map(([i, c]) => [progs[i] ?? "?", c] as [string, number]).filter((x) => x[0] !== "?") : [],
    kick: idx(at("top_kick_grid"), grids), bass: idx(at("top_bass_rhythm"), grids), contour: idx(at("top_contour"), grids),
    energy: Array.isArray(at("energy_contour")) ? (at("energy_contour") as number[]) : null,
    exemplars: Array.isArray(at("exemplars")) ? (at("exemplars") as number[]).map((i) => songs[i]).filter((x): x is string => typeof x === "string").map((x) => x.replace(/;/g, " & ")) : [],
  };
}

/** The deepest, fullest bins whose pins match every requested value at its position, largest first. */
export function binsFor(want: Partial<Record<Pin, string>>, limit = 3): Bin[] {
  const req = Object.entries(want).filter(([, v]) => v) as [Pin, string][];
  const out: Bin[] = [];
  for (const [key, raw] of Object.entries(GALTON.bins ?? {})) {
    const values = key.slice(key.indexOf(":") + 1).split("|");
    if (!req.every(([p, v]) => (values[PINS.indexOf(p)] ?? "unknown").toLowerCase() === v.toLowerCase())) continue;
    out.push(decodeBin(key, raw));
  }
  // Prefer bins that say more (fewer unknowns) when counts are close, else the larger bin.
  const known = (b: Bin) => Object.values(b.pins).filter((v) => v !== "unknown").length;
  return out.sort((a, b) => (b.count - a.count) || (known(b) - known(a))).slice(0, limit);
}
export const galtonBuiltAt = () => GALTON.builtAt ?? null;
export const galtonSize = () => Object.keys(GALTON.bins ?? {}).length;

export type ArtistRow = {
  artist_norm: string; display_name: string; song_count: number; chart_songs?: number; number_ones?: number; first_year?: number; last_year?: number;
  decades?: number[]; families?: string[]; tempo_p10?: number; tempo_p50?: number; tempo_p90?: number; mode_major_share?: number; top_keys?: string[];
  top_progressions?: unknown; top_keys_pc?: unknown; top_harmony_class?: string; energy_p50?: number; valence_p50?: number; danceability_p50?: number; structure_mode?: string;
  kick_grid_mode?: string; bass_rhythm_mode?: string; melody_contour_mode?: string; exemplars?: string[];
};
export type SongRow = { title: string; artist: string; year?: number; tempo?: number; key_pc?: number; mode?: string; chart_peak?: number; chart_weeks?: number; hit_tier?: string; progression?: string; structure?: string; energy?: number; valence?: number; danceability?: number; family?: string; source: string };

export { norm };
const KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const pct = (x: number | undefined) => (typeof x === "number" ? `${Math.round(x * 100)}%` : "?");

// Billboard writes "Elvis Presley With The Jordanaires" and "Bill Haley And His Comets" as separate performers.
// The store keeps them split; the lookup folds the variants into the head so the counts are the person's.
const variantPatterns = (n: string) => [`${n} with %`, `${n} and the %`, `${n} and his %`, `${n} and her %`, `${n} & the %`, `${n} & his %`];

export async function lookupArtist(name: string): Promise<ArtistRow | null> {
  const sb = supabaseAdmin(); if (!sb) return null;
  const n = norm(name); if (!n) return null;
  try {
    let head: ArtistRow | null = null;
    const exact = await sb.from("dna_artists").select("*").eq("artist_norm", n).limit(1);
    if (exact.data?.length) head = exact.data[0] as ArtistRow;
    else {
      const like = await sb.from("dna_artists").select("*").ilike("artist_norm", `%${n}%`).order("song_count", { ascending: false }).limit(1);
      if (like.data?.length) head = like.data[0] as ArtistRow;
    }
    if (!head) return null;
    const variants = await Promise.all(variantPatterns(head.artist_norm).map((pat) => sb.from("dna_artists").select("artist_norm,song_count,chart_songs,number_ones,exemplars").like("artist_norm", pat).limit(5)));
    const rows = variants.flatMap((v) => (v.data ?? []) as Pick<ArtistRow, "artist_norm" | "song_count" | "chart_songs" | "number_ones" | "exemplars">[]);
    if (!rows.length) return head;
    const merged: ArtistRow = { ...head };
    for (const r of rows) {
      merged.song_count += r.song_count ?? 0;
      merged.chart_songs = (merged.chart_songs ?? 0) + (r.chart_songs ?? 0);
      merged.number_ones = (merged.number_ones ?? 0) + (r.number_ones ?? 0);
      merged.exemplars = [...(r.exemplars ?? []).slice(0, 4), ...(merged.exemplars ?? [])].slice(0, 12);
    }
    return merged;
  } catch { /* the tables may not exist yet */ }
  return null;
}

export async function lookupSongs(title: string, artist?: string, limit = 6): Promise<SongRow[]> {
  const sb = supabaseAdmin(); if (!sb) return [];
  const t = norm(title); if (!t) return [];
  try {
    let q = sb.from("dna_songs").select("title,artist,year,tempo,key_pc,mode,chart_peak,chart_weeks,hit_tier,progression,structure,energy,valence,danceability,family,source").ilike("title_norm", `%${t}%`);
    if (artist) q = q.ilike("artist_norm", `%${norm(artist)}%`);
    const r = await q.order("chart_peak", { ascending: true, nullsFirst: false }).limit(limit);
    return (r.data ?? []) as SongRow[];
  } catch { return []; }
}

export async function artistSongs(artistNorm: string, limit = 8): Promise<SongRow[]> {
  const sb = supabaseAdmin(); if (!sb) return [];
  const cols = "title,artist,year,tempo,key_pc,mode,chart_peak,chart_weeks,hit_tier,progression,structure,energy,valence,danceability,family,source";
  try {
    const [own, ...withs] = await Promise.all([
      sb.from("dna_songs").select(cols).eq("artist_norm", artistNorm).order("chart_peak", { ascending: true, nullsFirst: false }).limit(limit),
      ...variantPatterns(artistNorm).slice(0, 2).map((pat) => sb.from("dna_songs").select(cols).like("artist_norm", pat).not("chart_peak", "is", null).order("chart_peak", { ascending: true }).limit(limit)),
    ]);
    const all = [...(own.data ?? []), ...withs.flatMap((w) => w.data ?? [])] as SongRow[];
    return all.sort((a, b) => (a.chart_peak ?? 999) - (b.chart_peak ?? 999)).slice(0, limit);
  } catch { return []; }
}

const shortProg = (p: string) => p.split(/\s+/).slice(0, 8).join(" ");
const keyNames = (v: unknown): string => {
  if (!Array.isArray(v)) return "";
  return (v as unknown[]).slice(0, 3).map((k) => { const pc = Array.isArray(k) ? Number(k[0]) : Number(k); return Number.isFinite(pc) && pc >= 0 && pc < 12 ? KEYS[pc] : typeof k === "string" ? k : ""; }).filter(Boolean).join(", ");
};
export function artistLine(a: ArtistRow, songs: SongRow[] = []): string {
  const keys = keyNames(a.top_keys);
  const progs = Array.isArray(a.top_progressions) ? (a.top_progressions as unknown[]).slice(0, 3).map((p) => shortProg(Array.isArray(p) ? String(p[0]) : String(p))).join("; ") : "";
  const hits = songs.filter((s) => s.chart_peak).slice(0, 5).map((s) => `${s.title}${s.year ? ` (${s.year})` : ""}${s.chart_peak ? ` #${s.chart_peak}` : ""}`).join(", ");
  const years = a.first_year && a.last_year ? `${a.first_year} to ${a.last_year}` : "";
  const fam = a.families?.length ? ` (${a.families.slice(0, 2).join(", ")})` : "";
  return [
    `${a.display_name}${fam}: ${a.song_count} songs in the store${years ? `, ${years}` : ""}${a.chart_songs ? `, ${a.chart_songs} charted on the Hot 100, ${a.number_ones ?? 0} number ones` : ""}.`,
    a.tempo_p50 ? `Tempo p50 ${Math.round(a.tempo_p50)} (p10 ${Math.round(a.tempo_p10 ?? 0)}, p90 ${Math.round(a.tempo_p90 ?? 0)}); major ${pct(a.mode_major_share)}${keys ? `; home keys ${keys}` : ""}.` : "",
    progs ? `Progressions: ${progs}${a.top_harmony_class && a.top_harmony_class !== "other" ? ` (${a.top_harmony_class})` : ""}.` : "",
    [a.structure_mode && a.structure_mode !== "X" ? `form ${a.structure_mode}` : "", a.melody_contour_mode ? `hook contour ${a.melody_contour_mode}` : "", a.kick_grid_mode && !/^X\.{15}$/.test(a.kick_grid_mode) ? `kick ${a.kick_grid_mode}` : "", a.bass_rhythm_mode ? `bass ${a.bass_rhythm_mode}` : ""].filter(Boolean).join("; ") + (a.melody_contour_mode || a.bass_rhythm_mode ? "." : ""),
    typeof a.energy_p50 === "number" ? `Energy ${a.energy_p50.toFixed(2)}, valence ${(a.valence_p50 ?? 0).toFixed(2)}, danceability ${(a.danceability_p50 ?? 0).toFixed(2)}.` : "",
    hits ? `Biggest: ${hits}.` : (a.exemplars?.length ? `Known for: ${a.exemplars.slice(0, 5).join(", ")}.` : ""),
  ].filter((x) => x && x !== ".").join(" ");
}

export function songLine(s: SongRow): string {
  const key = typeof s.key_pc === "number" && s.key_pc >= 0 ? `${KEYS[s.key_pc]} ${s.mode ?? ""}`.trim() : "";
  return `${s.artist}: ${s.title}${s.year ? ` (${s.year})` : ""}${s.tempo ? `, ${Math.round(s.tempo)} BPM` : ""}${key ? `, ${key}` : ""}${s.chart_peak ? `, peaked #${s.chart_peak}${s.chart_weeks ? ` for ${s.chart_weeks} weeks` : ""}` : ""}${s.progression ? `, ${s.progression}` : ""}${s.structure ? `, form ${s.structure}` : ""}${typeof s.energy === "number" ? `, energy ${s.energy.toFixed(2)} valence ${(s.valence ?? 0).toFixed(2)}` : ""}.`;
}

export function binLine(b: Bin): string {
  const where = (Object.entries(b.pins) as [Pin, string][]).filter(([, v]) => v !== "unknown").map(([p, v]) => `${p.replace(/_/g, " ")} ${v}`).join(", ");
  const progs = b.progressions.slice(0, 3).map((p) => `${p[0]} (${p[1]})`).join("; ");
  return `Bin [${where}] (${b.count} songs): tempo p50 ${b.tempo ?? "?"}, major ${pct(b.modeMajor ?? undefined)}${progs ? `; progressions ${progs}` : ""}${b.kick ? `; kick ${b.kick}` : ""}${b.bass ? `; bass ${b.bass}` : ""}${b.contour ? `; hook ${b.contour}` : ""}${b.exemplars.length ? `; like ${b.exemplars.slice(0, 4).join(", ")}` : ""}.`;
}

// The canon: what DJs actually play, read from their mixes (dna_canon). Two questions:
// who plays this artist, and what does this DJ play.
export async function canonLines(name: string): Promise<string[]> {
  const sb = supabaseAdmin(); if (!sb) return [];
  const n = norm(name); if (!n) return [];
  const out: string[] = [];
  try {
    const [played, mixes] = await Promise.all([
      sb.from("dna_canon").select("dj,mix_name,position_sec,title").ilike("artist_norm", `%${n}%`).limit(8),
      sb.from("dna_canon_mixes").select("name,dj,entries").ilike("dj", `%${name.trim()}%`).limit(3),
    ]);
    const rows = (played.data ?? []) as { dj: string; mix_name: string; position_sec: number | null; title: string }[];
    if (rows.length) {
      const by = new Map<string, string[]>();
      for (const r of rows) { const k = r.dj || r.mix_name; by.set(k, [...(by.get(k) ?? []), `${r.title}${typeof r.position_sec === "number" ? ` at ${mmss(r.position_sec)}` : ""}`]); }
      out.push(`Played by DJs: ${[...by.entries()].map(([dj, ts]) => `${dj} (${ts.slice(0, 3).join(", ")})`).join("; ")}.`);
    }
    const mx = (mixes.data ?? []) as { name: string; dj: string; entries: number }[];
    if (mx.length) {
      const r = await sb.from("dna_canon").select("artist,title,year,label").in("mix_name", mx.map((m) => m.name)).limit(60);
      const recs = (r.data ?? []) as { artist: string; title: string; year: number | null; label: string | null }[];
      const seen = new Set<string>(); const picks: string[] = [];
      for (const x of recs) { const k = `${x.artist}|${x.title}`; if (seen.has(k) || !x.artist) continue; seen.add(k); picks.push(`${x.artist}: ${x.title}${x.year ? ` (${x.year})` : ""}`); if (picks.length >= 10) break; }
      if (picks.length) out.push(`${mx[0].dj} plays (from ${mx.map((m) => m.name).join(", ")}): ${picks.join(", ")}.`);
    }
  } catch { /* tables may be empty */ }
  return out;
}
const mmss = (sec: number) => { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** Records the studio has heard itself (any user), matched by artist or title. */
const dnaTail = (x: { progression?: string | null; harmony_class?: string | null; structure?: string | null; kick_grid?: string | null; snare_grid?: string | null; hat_grid?: string | null; bass_rhythm?: string | null; bass_root?: string | null; family?: string | null; descriptors?: string | null }) => {
  const parts: string[] = [];
  if (x.progression) parts.push(`progression ${x.progression}${x.harmony_class ? ` (${x.harmony_class.replace(/_/g, " ")})` : ""}`);
  if (x.kick_grid) parts.push(`kick ${x.kick_grid}${x.snare_grid ? `, snare ${x.snare_grid}` : ""}${x.hat_grid ? `, hats ${x.hat_grid}` : ""}`);
  if (x.bass_rhythm || x.bass_root) parts.push(`bass${x.bass_root ? ` root ${x.bass_root}` : ""}${x.bass_rhythm ? ` rhythm ${x.bass_rhythm}` : ""}`);
  if (x.structure) parts.push(`structure ${x.structure}`);
  if (x.family) parts.push(`family ${x.family}`);
  if (x.descriptors) parts.push(`sounds ${x.descriptors}`);
  return parts.length ? ` How it is built: ${parts.join("; ")}.` : "";
};
export async function heardLines(name: string): Promise<string[]> {
  const sb = supabaseAdmin(); if (!sb) return [];
  const n = norm(name); if (!n) return [];
  try {
    const r = await sb.from("dna_heard").select("title,artist,year,tempo,key_name,bars,energy_contour,heard_count,progression,harmony_class,structure,kick_grid,snare_grid,hat_grid,bass_rhythm,bass_root,family,descriptors").or(`artist_norm.ilike.*${n}*,title_norm.ilike.*${n}*`).order("heard_count", { ascending: false }).limit(4);
    const rows = (r.data ?? []) as { title: string | null; artist: string | null; year: number | null; tempo: number | null; key_name: string | null; bars: number | null; energy_contour: number[] | null; heard_count: number; progression?: string | null; harmony_class?: string | null; structure?: string | null; kick_grid?: string | null; snare_grid?: string | null; hat_grid?: string | null; bass_rhythm?: string | null; bass_root?: string | null; family?: string | null; descriptors?: string | null }[];
    return rows.filter((x) => x.title).map((x) => {
      const e = x.energy_contour ?? [];
      const peak = e.length ? e.indexOf(Math.max(...e)) * 8 : null;
      return `Heard by the studio: ${x.artist ?? "?"}: ${x.title}${x.year ? ` (${x.year})` : ""}${x.tempo ? `, ${Math.round(x.tempo)} BPM` : ""}${x.key_name ? `, ${x.key_name}` : ""}${x.bars ? `, ${x.bars} bars` : ""}${peak !== null ? `, peak energy around bar ${peak}` : ""}${x.heard_count > 1 ? `, heard ${x.heard_count} times` : ""}.` + dnaTail(x);
    });
  } catch { return []; }
}

// The fine genres (dna_genres, from MusicBrainz's tags): a word the family map has never seen still lands.
export type GenreRow = { genre: string; artists: number; songs: number | null; chart_songs: number | null; tempo_p50: number | null; energy_p50: number | null; family: string | null; exemplars: string[] | null };
export async function lookupGenre(text: string): Promise<GenreRow | null> {
  const sb = supabaseAdmin(); if (!sb) return null;
  const t = norm(text); if (!t) return null;
  try {
    const exact = await sb.from("dna_genres").select("*").eq("genre", t).limit(1);
    if (exact.data?.[0]) return exact.data[0] as GenreRow;
    // The longest genre name contained in the ask wins ("forest psytrance" over "psytrance" over "trance").
    const words = t.split(" ");
    const cands = new Set<string>();
    for (let i = 0; i < words.length; i++) for (let j = i + 1; j <= Math.min(words.length, i + 4); j++) cands.add(words.slice(i, j).join(" "));
    const r = await sb.from("dna_genres").select("*").in("genre", [...cands]).order("artists", { ascending: false });
    const rows = (r.data ?? []) as GenreRow[];
    if (!rows.length) return null;
    return rows.sort((a, b) => b.genre.length - a.genre.length)[0];
  } catch { return null; }
}
export const genreLine = (g: GenreRow) =>
  `${g.genre[0].toUpperCase()}${g.genre.slice(1)} in the store: ${g.artists} artists, ${g.songs ?? 0} songs${g.chart_songs ? `, ${g.chart_songs} charted` : ""}${g.tempo_p50 ? `, tempo p50 ${Math.round(g.tempo_p50)}` : ""}${g.energy_p50 ? `, energy ${g.energy_p50.toFixed(2)}` : ""}${g.family ? `, family ${g.family}` : ""}${g.exemplars?.length ? `; artists: ${g.exemplars.slice(0, 5).join(", ")}` : ""}.`;

// The charts (dna_charts: year-end ranks and number ones across the genre charts) and fame (dna_fame).
export type ChartRow = { chart: string; year: number | null; position: number | null; yearend: boolean; artist: string | null; title: string | null; artist_norm: string | null; title_norm: string | null; store_family: string | null };
const CHART_FOR_FAMILY: Record<string, string[]> = {
  house: ["Dance Club Songs number ones", "UK Dance number ones"], electronic: ["Dance Club Songs number ones", "UK Dance number ones", "Hot Dance/Electronic number ones"], techno: ["UK Dance number ones", "Dance Club Songs number ones"],
  hiphop: ["Hot Rap Songs number ones", "R&B/Hip-Hop number ones"], rnb: ["R&B/Hip-Hop number ones"], country: ["Hot Country Songs number ones"], rock: ["Alternative Airplay number ones", "Mainstream Rock number ones"],
  latin: ["Hot Latin Songs number ones"], pop: ["Billboard year-end Hot 100", "Hot 100 number ones", "UK number ones"],
};
/** The biggest records of a year for a family (or the Hot 100 when none): year-end ranks first, then the number ones. */
export async function chartLines(family: string | null, year: number | null, limit = 8): Promise<string[]> {
  const sb = supabaseAdmin(); if (!sb || !year) return [];
  try {
    const charts = family && CHART_FOR_FAMILY[family] ? CHART_FOR_FAMILY[family] : ["Billboard year-end Hot 100"];
    let q = sb.from("dna_charts").select("chart,year,position,yearend,artist,title,artist_norm,title_norm,store_family").eq("year", year).in("chart", charts).order("yearend", { ascending: false }).order("position", { ascending: true }).limit(limit * 3);
    const r = await q; let rows = (r.data ?? []) as ChartRow[];
    if (!rows.length && family) { const r2 = await sb.from("dna_charts").select("chart,year,position,yearend,artist,title,artist_norm,title_norm,store_family").eq("year", year).eq("chart", "Billboard year-end Hot 100").order("position", { ascending: true }).limit(limit); rows = (r2.data ?? []) as ChartRow[]; }
    if (!rows.length) return [];
    const seen = new Set<string>(); const picked: ChartRow[] = [];
    for (const x of rows) { const k = `${x.artist_norm}|${x.title_norm}`; if (seen.has(k)) continue; seen.add(k); picked.push(x); if (picked.length >= limit) break; }
    // The store's own numbers for those records, where it has them.
    const keys = picked.map((x) => x.title_norm ?? "").filter(Boolean);
    const songs = keys.length ? await sb.from("dna_songs").select("artist_norm,title_norm,tempo,key_pc,mode,energy,valence,family").in("title_norm", keys).limit(200) : { data: [] };
    const byKey = new Map<string, { tempo?: number | null; key_pc?: number | null; mode?: string | null; energy?: number | null; family?: string | null }>();
    for (const srow of (songs.data ?? []) as { artist_norm: string; title_norm: string; tempo?: number | null; key_pc?: number | null; mode?: string | null; energy?: number | null; family?: string | null }[]) byKey.set(`${srow.artist_norm}|${srow.title_norm}`, srow);
    const chartName = picked[0].chart;
    const items = picked.map((x) => { const sr = byKey.get(`${x.artist_norm}|${x.title_norm}`); const bits = [sr?.tempo ? `${Math.round(sr.tempo)} BPM` : null, sr && typeof sr.key_pc === "number" ? `${KEYS[sr.key_pc]}${sr.mode === "minor" ? "m" : ""}` : null, typeof sr?.energy === "number" ? `energy ${sr.energy.toFixed(2)}` : null].filter(Boolean); return `${x.yearend && x.position ? `${x.position}. ` : ""}${x.artist}: ${x.title}${bits.length ? ` (${bits.join(", ")})` : ""}`; });
    const tempos = picked.map((x) => byKey.get(`${x.artist_norm}|${x.title_norm}`)?.tempo).filter((t): t is number => typeof t === "number").sort((a, b) => a - b);
    const minor = picked.map((x) => byKey.get(`${x.artist_norm}|${x.title_norm}`)?.mode).filter(Boolean); const minorShare = minor.length ? minor.filter((m) => m === "minor").length / minor.length : null;
    const summary = tempos.length >= 3 ? ` Across them the store measures tempo p50 ${Math.round(tempos[Math.floor(tempos.length / 2)])}${minorShare !== null ? `, ${Math.round(minorShare * 100)}% minor` : ""}.` : "";
    return [`${chartName}, ${year}: ${items.join("; ")}.${summary}`];
  } catch { return []; }
}
