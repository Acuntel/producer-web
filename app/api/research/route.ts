// The research lane. No model unless the store is empty: an artist, a record or a genre
// is dropped down the Galton board and comes back as a recipe in a few milliseconds.
// When the store has nothing, one Haiku call with one web search fills the gap, and
// the answer is cached for everyone.
import { brainClient } from "@/lib/brain/client";
import { supabaseAdmin } from "@/lib/account/supabase";
import { lookupArtist, lookupSongs, artistSongs, artistLine, songLine, binsFor, binLine, norm, canonLines, heardLines, lookupGenre, genreLine } from "@/lib/brain/galton";
import { findRecord, artistRows, soundLines } from "@/lib/brain/prints";
import { laneNamed, laneInfo } from "@/lib/brain/laneNames";

export const maxDuration = 30;
const MODEL = process.env.PRODUCER_VOICE_MODEL || "claude-haiku-4-5";

const FAMILY_WORDS: Record<string, string> = { house: "house", techno: "techno", trance: "trance", garage: "garage", edm: "electronic", dance: "electronic", club: "electronic", electro: "electronic", dnb: "dnb", "drum and bass": "dnb", jungle: "dnb", dubstep: "dubstep", hardstyle: "hardstyle", "hard dance": "hardstyle", rave: "hardstyle", disco: "disco", rap: "hiphop", "hip hop": "hiphop", hiphop: "hiphop", trap: "hiphop", drill: "hiphop", pop: "pop", rock: "rock", metal: "metal", country: "country", "r&b": "rnb", rnb: "rnb", soul: "rnb", funk: "rnb", jazz: "jazz", reggae: "world", afrobeats: "world", amapiano: "world", latin: "latin", reggaeton: "latin", folk: "folk", indie: "rock" };

function familiesIn(q: string): string[] {
  // Whole words only: "amapiano" is not "piano", "trapeze" is not "trap".
  const t = q.toLowerCase(); const out = new Set<string>();
  for (const [w, f] of Object.entries(FAMILY_WORDS)) if (new RegExp(`(^|[^a-z])${w.replace(/[-\s]/g, "[-\\s]?")}([^a-z]|$)`).test(t)) out.add(f);
  return [...out];
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const body = (await req.json().catch(() => null)) as { query?: string; song?: { bpm?: number; lane?: string } } | null;
  const asked = (body?.query ?? "").toString().trim().slice(0, 160);
  // "sounds like X", "similar to X", "in the style of X": look X up and answer with what sits beside it by sound.
  const like = asked.match(/^(?:what |something |anything |a track |a record |music )?(?:that |which )?(?:sounds? like|similar to|in the (?:vein|style) of|close to)\s+(.+)$/i);
  const query = like ? like[1].trim() : asked;
  if (!query) return Response.json({ found: false, lines: [], ms: 0 });
  const words = asked.toLowerCase();
  const energyPin = /\b(peak ?time|peak|high energy|banger|hard|intense|driving|full on)\b/.test(words) ? (/\bpeak/.test(words) ? "peak" : "high") : /\b(chill|low energy|calm|mellow|soft|laid[- ]back|downtempo|gentle)\b/.test(words) ? "low" : null;
  const feelPin = /\b(euphoric|uplifting|anthem|lift|hands in the air)\b/.test(words) ? "lift" : /\b(sun|sunny|bright|happy|warm|summer|feel ?good)\b/.test(words) ? "sun" : /\b(rush|dark|tense|aggressive|menacing|angry)\b/.test(words) ? "rush" : /\b(gut|sad|melancholy|melancholic|heartbreak|lonely|blue)\b/.test(words) ? "gut" : null;
  const voicePin = /\b(instrumental|no vocals?|without vocals?)\b/.test(words) ? "instrumental" : /\b(vocal|vocals|singer|topline|sung)\b/.test(words) ? "vocal" : null;
  const extraPins = { ...(energyPin ? { energy_band: energyPin } : {}), ...(feelPin ? { feel: feelPin } : {}), ...(voicePin ? { voice: voicePin } : {}) };
  const lines: string[] = [];
  let kind: "artist" | "song" | "genre" | "none" = "none";

  // 1. The store, in parallel: a record "artist - title", an artist by name, a record by title.
  const dash = query.match(/^(.+?)\s+[-:]\s+(.+)$/);
  const [bySplit, artist, byTitle, canon, heard] = await Promise.all([
    dash ? lookupSongs(dash[2], dash[1], 4) : Promise.resolve([]),
    lookupArtist(query),
    dash ? Promise.resolve([]) : lookupSongs(query, undefined, 4),
    dash ? canonLines(dash[1]) : canonLines(query),
    heardLines(dash ? dash[2] : query),
  ]);
  if (bySplit.length) { kind = "song"; lines.push(...bySplit.map(songLine)); }
  else if (artist) { kind = "artist"; lines.push(artistLine(artist, await artistSongs(artist.artist_norm, 8))); }
  else if (byTitle.length) { kind = "song"; lines.push(...byTitle.map(songLine)); }
  // The fingerprint: the record's own address and what sits beside it by sound (in-process, no database).
  const printRows = dash ? [findRecord(norm(dash[1]), norm(dash[2]))].filter((r): r is number => r !== null) : artistRows(artist?.artist_norm ?? norm(query), like ? 2 : 1);
  for (const row of printRows.slice(0, like ? 2 : 1)) { if (kind === "none") kind = dash ? "song" : "artist"; lines.push(...soundLines(row, like ? 8 : 5)); }
  if (canon.length) { if (kind === "none") kind = "artist"; lines.push(...canon); }
  if (heard.length) { if (kind === "none") kind = "song"; lines.push(...heard); }
  // A decade in the words ("80s", "1990s", "nineties") becomes a pin.
  const decadeWord = query.toLowerCase().match(/\b(19|20)?(\d0)s\b/) ?? null;
  const DECADE_NAMES: Record<string, string> = { fifties: "1950", sixties: "1960", seventies: "1970", eighties: "1980", nineties: "1990", noughties: "2000", "two thousands": "2000" };
  const decade = decadeWord ? `${decadeWord[1] ?? (Number(decadeWord[2]) >= 30 ? "19" : "20")}${decadeWord[2]}` : Object.entries(DECADE_NAMES).find(([w]) => query.toLowerCase().includes(w))?.[1] ?? null;
  let fams = familiesIn(query);
  const lane = laneNamed(query);
  // A fine genre the family map has never heard of (amapiano, footwork, forest psytrance): the genre table answers,
  // and its family points the bins.
  const genre = fams.length === 0 ? await lookupGenre(query) : null;
  // A genre line rides when nothing else matched, or when the ask is exactly the genre's name (a record titled
  // "Amapiano Mix" must not hide the genre itself).
  if (genre && (kind === "none" || genre.genre === norm(query)) && !(kind === "artist" && genre.genre.length < 6)) {
    if (kind === "none") kind = "genre";
    lines.push(genreLine(genre));
    if (!fams.length && genre.family) fams = [genre.family];
  }
  if (fams.length || lane) {
    const info = lane ? laneInfo(lane) : null;
    const tempoBand = info ? bandFor(info.home) : body?.song?.bpm ? bandFor(body.song.bpm) : null;
    const seen = new Set<string>();
    for (const f of fams.length ? fams : [lane && /house/.test(lane) ? "house" : lane && /techno/.test(lane) ? "techno" : "electronic"]) {
      // One bin per mode, so a minor-leaning lane is not answered with the major bin alone.
      const picks = ["minor", "major"].flatMap((mode) => {
        const base = { family: f, mode, ...(decade ? { decade } : {}) };
        if (Object.keys(extraPins).length) {
          const pinned = binsFor({ ...base, ...extraPins, ...(tempoBand ? { tempo_band: tempoBand } : {}) }, 1);
          return pinned.length ? pinned : binsFor({ family: f, mode, ...extraPins }, 1);
        }
        const withTempo = tempoBand && !decade ? binsFor({ ...base, tempo_band: tempoBand }, 1) : [];
        return withTempo.length ? withTempo : binsFor(base, 1).length ? binsFor(base, 1) : binsFor({ family: f, mode }, 1);
      });
      for (const b of picks) {
        const sig = `${b.count}|${b.exemplars.slice(0, 3).join(",")}`;
        if (seen.has(sig)) continue; seen.add(sig);
        if (kind === "none") kind = "genre"; lines.push(binLine(b));
      }
    }
    if (fams.length >= 2) lines.push(`Two families named (${fams.join(" and ")}): build the floor from the first family's bin and borrow the second family's hook contour, vocal placement and one signature timbre; say which choice you made.`);
  }
  if (!lines.length && Object.keys(extraPins).length) {
    for (const b of binsFor({ ...extraPins, ...(decade ? { decade } : {}) }, 2)) { kind = "genre"; lines.push(binLine(b)); }
  }
  if (lines.length) return Response.json({ found: true, kind, source: "store", lines, ms: Date.now() - t0 });

  // 2. The cache, then one search.
  const sb = supabaseAdmin(); const key = norm(query);
  if (sb) { try { const c = await sb.from("research_cache").select("answer").eq("key", key).limit(1); const ans = c.data?.[0]?.answer as { lines?: string[]; kind?: string } | undefined; if (ans?.lines?.length) return Response.json({ found: true, kind: ans.kind ?? "artist", source: "cache", lines: ans.lines, ms: Date.now() - t0 }); } catch { /* no table yet */ } }
  const { client } = await brainClient(req);
  if (!client) return Response.json({ found: false, lines: [], ms: Date.now() - t0 });
  try {
    const resp = await client.messages.create({
      model: MODEL, max_tokens: 700,
      tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 1 }],
      system: "You are a music researcher for a producer. Answer in at most six plain sentences, no lists, no markdown: who or what this is, the era and genre family, typical tempo range and keys, the harmonic habits (common progressions), song form habits, the signature sounds, the biggest records with years, and one thing a producer would copy. Numbers when you have them; never invent chart facts.",
      messages: [{ role: "user", content: `Research for a record we are about to build: "${query}".` }],
    } as never);
    const text = (resp as { content: { type: string; text?: string }[] }).content.filter((b) => b.type === "text").map((b) => b.text ?? "").join(" ").replace(/\s+/g, " ").trim();
    const out = text ? [text.slice(0, 1200)] : [];
    if (sb && out.length) { try { await sb.from("research_cache").upsert({ key, answer: { lines: out, kind: "artist" } }); } catch { /* fine */ } }
    return Response.json({ found: out.length > 0, kind: "artist", source: "web", lines: out, usage: (resp as { usage: unknown }).usage, model: MODEL, ms: Date.now() - t0 });
  } catch (e) { return Response.json({ found: false, lines: [], detail: e instanceof Error ? e.message.slice(0, 160) : "error", ms: Date.now() - t0 }); }
}

function bandFor(bpm: number): string {
  let b = bpm; while (b < 60) b *= 2; while (b > 180) b /= 2;
  return b < 90 ? "<90" : b < 110 ? "90-110" : b < 122 ? "110-122" : b < 132 ? "122-132" : b < 145 ? "132-145" : b < 160 ? "145-160" : ">160";
}
