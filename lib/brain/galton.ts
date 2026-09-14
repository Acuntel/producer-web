// The Galton board: where a request lands in the store, and what it finds there.
// Server only. Artist and song lookups hit the dna_* tables when they exist; the bin
// medians come from data/galton.json, which ships in the repo so the grammar is
// available with no database at all.
import galtonJson from "../../data/galton.json";
import { supabaseAdmin } from "@/lib/account/supabase";

// data/galton.json is a compact export: index tables (songs, progressions, grids) and bins keyed
// "depth:pin1|pin2|..." in PIN order, each bin a positional array in bin_fields order.
const PINS = ["tempo_band", "meter_feel", "mode", "decade", "family", "structure_archetype", "harmony_class", "hit_tier"] as const;
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

export const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\b(feat|featuring|ft)\b.*$/, "").replace(/&/g, "and").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const pct = (x: number | undefined) => (typeof x === "number" ? `${Math.round(x * 100)}%` : "?");

export async function lookupArtist(name: string): Promise<ArtistRow | null> {
  const sb = supabaseAdmin(); if (!sb) return null;
  const n = norm(name); if (!n) return null;
  try {
    const exact = await sb.from("dna_artists").select("*").eq("artist_norm", n).limit(1);
    if (exact.data?.length) return exact.data[0] as ArtistRow;
    const like = await sb.from("dna_artists").select("*").ilike("artist_norm", `%${n}%`).order("song_count", { ascending: false }).limit(1);
    if (like.data?.length) return like.data[0] as ArtistRow;
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
  try {
    const r = await sb.from("dna_songs").select("title,artist,year,tempo,key_pc,mode,chart_peak,chart_weeks,hit_tier,progression,structure,energy,valence,danceability,family,source").eq("artist_norm", artistNorm).order("chart_peak", { ascending: true, nullsFirst: false }).limit(limit);
    return (r.data ?? []) as SongRow[];
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
