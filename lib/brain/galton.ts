// The Galton board: where a request lands in the store, and what it finds there.
// Server only. Artist and song lookups hit the dna_* tables when they exist; the bin
// medians come from data/galton.json, which ships in the repo so the grammar is
// available with no database at all.
import galtonJson from "../../data/galton.json";
import { supabaseAdmin } from "@/lib/account/supabase";

export type Bin = { key: string; count: number; tempo?: number; modeMajor?: number; progressions?: [string, number][]; kick?: string; bass?: string; contour?: string; energy?: number[]; exemplars?: string[]; [k: string]: unknown };
type Galton = { builtAt: string | null; bins: Record<string, Bin> };
const GALTON = galtonJson as unknown as Galton;

export type ArtistRow = {
  artist_norm: string; display: string; song_count: number; chart_songs?: number; number_ones?: number; first_year?: number; last_year?: number;
  decades?: number[]; families?: string[]; tempo_p10?: number; tempo_p50?: number; tempo_p90?: number; mode_major_share?: number; top_keys?: string[];
  top_progressions?: unknown; top_harmony_class?: string; energy_p50?: number; valence_p50?: number; danceability_p50?: number; structure_mode?: string;
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

/** The bins whose key contains every named pin, largest first. Keys look like "122-132|four_floor|minor|2020|electronic|build_drop|minor_axis|none". */
export function binsFor(pins: string[], limit = 3): Bin[] {
  const want = pins.map((p) => p.toLowerCase());
  const out: Bin[] = [];
  for (const [key, b] of Object.entries(GALTON.bins ?? {})) {
    const parts = key.toLowerCase().split("|");
    if (want.every((w) => parts.includes(w))) out.push({ ...b, key });
  }
  return out.sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).slice(0, limit);
}
export const galtonBuiltAt = () => GALTON.builtAt;
export const galtonSize = () => Object.keys(GALTON.bins ?? {}).length;

export function artistLine(a: ArtistRow, songs: SongRow[] = []): string {
  const keys = (a.top_keys ?? []).slice(0, 3).join(", ");
  const progs = Array.isArray(a.top_progressions) ? (a.top_progressions as unknown[]).slice(0, 3).map((p) => (Array.isArray(p) ? String(p[0]) : String(p))).join("; ") : "";
  const hits = songs.filter((s) => s.chart_peak).slice(0, 5).map((s) => `${s.title}${s.year ? ` (${s.year})` : ""}${s.chart_peak ? ` #${s.chart_peak}` : ""}`).join(", ");
  const years = a.first_year && a.last_year ? `${a.first_year} to ${a.last_year}` : "";
  return [
    `${a.display}: ${a.song_count} songs in the store${years ? `, ${years}` : ""}${a.chart_songs ? `, ${a.chart_songs} charted, ${a.number_ones ?? 0} number ones` : ""}.`,
    a.tempo_p50 ? `Tempo p50 ${Math.round(a.tempo_p50)} (p10 ${Math.round(a.tempo_p10 ?? 0)}, p90 ${Math.round(a.tempo_p90 ?? 0)}); major ${pct(a.mode_major_share)}${keys ? `; keys ${keys}` : ""}.` : "",
    progs ? `Progressions: ${progs}${a.top_harmony_class ? ` (${a.top_harmony_class})` : ""}.` : "",
    a.structure_mode ? `Structure: ${a.structure_mode}${a.melody_contour_mode ? `; hook contour ${a.melody_contour_mode}` : ""}${a.kick_grid_mode ? `; kick ${a.kick_grid_mode}` : ""}${a.bass_rhythm_mode ? `; bass ${a.bass_rhythm_mode}` : ""}.` : "",
    typeof a.energy_p50 === "number" ? `Energy ${a.energy_p50.toFixed(2)}, valence ${(a.valence_p50 ?? 0).toFixed(2)}, danceability ${(a.danceability_p50 ?? 0).toFixed(2)}.` : "",
    hits ? `Biggest: ${hits}.` : (a.exemplars?.length ? `Known for: ${a.exemplars.slice(0, 5).join(", ")}.` : ""),
  ].filter(Boolean).join(" ");
}

export function songLine(s: SongRow): string {
  const key = typeof s.key_pc === "number" && s.key_pc >= 0 ? `${KEYS[s.key_pc]} ${s.mode ?? ""}`.trim() : "";
  return `${s.artist}: ${s.title}${s.year ? ` (${s.year})` : ""}${s.tempo ? `, ${Math.round(s.tempo)} BPM` : ""}${key ? `, ${key}` : ""}${s.chart_peak ? `, peaked #${s.chart_peak}${s.chart_weeks ? ` for ${s.chart_weeks} weeks` : ""}` : ""}${s.progression ? `, ${s.progression}` : ""}${s.structure ? `, form ${s.structure}` : ""}${typeof s.energy === "number" ? `, energy ${s.energy.toFixed(2)} valence ${(s.valence ?? 0).toFixed(2)}` : ""}.`;
}

export function binLine(b: Bin): string {
  const progs = (b.progressions ?? []).slice(0, 3).map((p) => `${p[0]} (${p[1]})`).join("; ");
  return `Bin ${b.key} (${b.count} songs): tempo p50 ${b.tempo ?? "?"}, major ${pct(b.modeMajor)}${progs ? `; progressions ${progs}` : ""}${b.kick ? `; kick ${b.kick}` : ""}${b.bass ? `; bass ${b.bass}` : ""}${b.contour ? `; hook ${b.contour}` : ""}${b.exemplars?.length ? `; like ${b.exemplars.slice(0, 4).join(", ")}` : ""}.`;
}
