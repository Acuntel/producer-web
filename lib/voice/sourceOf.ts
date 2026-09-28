// A pulled record's voice, ready to place: from the worker's vocal map when the job carries one (words on the voice's
// onsets, the hook, notes, the stressed syllable), else from the phrases the browser finds in the separated vocal. A
// quoted lyric narrows it to the line that sings it. The source's family comes from what the record is, never from
// the song it is going into. Tone-free apart from the pitch read of the fallback.
import { parseVocalMap, phraseSaying, repeatsOf } from "../song/vocalMap";
import { findPhrases, pickPhrase, type Phrase } from "../song/vocal";
import { yieldThread } from "./tune";
import { voiceFromMap, voiceFromPhrases, type VoiceSource } from "../song/place";

type JobResult = { name?: string; facts?: { bpm: number; key: string }; vocalMap?: unknown; hearing?: { lyrics?: { lines: { at: number; text: string }[] } }; identity?: { genre?: string | null } | null };

const familyOf = (r: JobResult) => r.identity?.genre ? r.identity.genre.toLowerCase().replace(/\s+/g, "-") : null;

export async function voiceOfRecord(res: JobResult, clipKey: string, src: AudioBuffer, said?: string | null): Promise<VoiceSource> {
  const name = res.name ?? "the record";
  const map = parseVocalMap(res.vocalMap);
  if (map) {
    const v = voiceFromMap(map, { name, clipKey, bpm: res.facts?.bpm, key: res.facts?.key ?? null, family: familyOf(res) });
    const quoted = said ? phraseSaying(map, said) : null;
    if (!quoted) return v;
    const keep = new Set(repeatsOf(map, quoted).map((p) => p.id));
    return { ...v, phrases: v.phrases.filter((p) => keep.has(p.id)), hook: quoted.id };
  }
  const found = findPhrases(src.getChannelData(0), src.sampleRate);
  await yieldThread();
  const picked = said ? pickPhrase(found, { said, words: res.hearing?.lyrics?.lines }) : null;
  // The strongest eight lines only, each pitched on its own turn of the thread.
  const pool = picked ? [picked] : [...found].sort((a, b) => b.score - a.score).slice(0, 8).sort((a, b) => a.startSec - b.startSec);
  const { detectRootPitch } = await import("../engine/pitch");
  const pitched = new Map<Phrase, number[]>();
  for (const p of pool) {
    const a = Math.floor(p.startSec * src.sampleRate), b = Math.min(src.length, Math.floor(p.endSec * src.sampleRate));
    const m = detectRootPitch(src.getChannelData(0).subarray(a, b), src.sampleRate).midi;
    pitched.set(p, m === null ? [] : [Math.round(m)]);
    await yieldThread();
  }
  return voiceFromPhrases(pool, { name, clipKey, bpm: res.facts?.bpm ?? 120, key: res.facts?.key ?? null, family: familyOf(res), midis: (p) => pitched.get(p) ?? [] });
}
