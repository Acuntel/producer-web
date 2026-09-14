"use client";
// Uploads: a reference track (heard, never copied) and samples/vocals (stored, heard, dropped in as audio tracks).
import { useCallback, type MutableRefObject, type Dispatch, type SetStateAction } from "react";
import { applyOps, type Song } from "@/lib/song";
import type { MusicFacts } from "@/lib/ears";
import type { Reference } from "@/lib/types/ui";
import type { ClipMeta } from "@/lib/types/ui";

const REF_KEY = "producer.reference.v1";
type Deps = {
  flash: (t: string) => void;
  send: (t: string, o?: { hidden?: boolean }) => Promise<void>;
  setSong: (s: Song, o?: { silent?: boolean; label?: string; noHistory?: boolean }) => Promise<void>;
  setClips: Dispatch<SetStateAction<ClipMeta[]>>;
  factsRef: MutableRefObject<MusicFacts | null>;
  referenceRef: MutableRefObject<Reference | null>;
  setReference: (r: Reference | null) => void;
  setDeltaText: (t: string | null) => void;
  getSong: () => Song;
};

export function useUploads(d: Deps) {
  const addReference = useCallback(async (file: File) => {
    d.flash("Listening to the reference…");
    console.log("reference: decoding", file.name, file.size);
    const { decodeFile, hearBuffer } = await import("@/lib/ears/browser");
    const f = await hearBuffer(await decodeFile(file), { maxSeconds: 240, label: file.name });
    const ref = { name: file.name.replace(/\.[a-z0-9]+$/i, ""), facts: f };
    console.log("reference: heard", ref.name, f.read.slice(0, 120));
    d.referenceRef.current = ref; d.setReference(ref);
    try { localStorage.setItem(REF_KEY, JSON.stringify(ref)); } catch {}
    if (d.factsRef.current) { const { compare } = await import("@/lib/ears"); d.setDeltaText(compare(d.factsRef.current, f).text); }
    void d.send(`I uploaded a reference track called "${ref.name}". You just heard it: ${f.read} Tell me what you hear in one breath, then decide: small moves now, or say the word and run the emulate rollout.`, { hidden: true });
  }, [d]);

  const addClip = useCallback(async (file: File) => {
    d.flash("Hearing the clip…");
    const { decodeFile, hearBuffer } = await import("@/lib/ears/browser");
    const { putClip, newClipId, cacheDecoded } = await import("@/lib/engine");
    const bytes = await file.arrayBuffer();
    const buf = await decodeFile(new Blob([bytes]));
    const f = await hearBuffer(buf, { maxSeconds: 60, label: file.name });
    const id = newClipId();
    const name = file.name.replace(/\.[a-z0-9]+$/i, "");
    const short = buf.duration < 2.5;
    await putClip({ id, name, type: file.type, bytes, createdAt: Date.now(), durationSec: buf.duration, bpm: short ? undefined : f.tempo.bpm, key: f.key.name });
    cacheDecoded(id, buf);
    d.setClips((c) => [...c, { id, name, bpm: short ? undefined : f.tempo.bpm, key: f.key.name, durationSec: buf.duration }]);
    const cur = d.getSong();
    const trackId = `clip_${cur.tracks.length + 1}`;
    const beats = Math.max(1, Math.round((buf.duration / 60) * cur.bpm / 4) * 4);
    const { song: ns } = applyOps(cur, [{ op: "addTrack", track: { id: trackId, name, role: "audio", volume: -4, duck: true, loopBeats: short ? 4 : beats, notes: short ? [[60, 0, 0.5, 110], [60, 2, 0.5, 100]] : [],
      clip: { clipId: id, name, bpm: short ? undefined : f.tempo.bpm, warp: !short, semitones: 0, lengthBeats: short ? undefined : beats, gainDb: 0, oneShot: short, durationSec: buf.duration } } },
      ...cur.sections.filter((s) => /drop|groove/i.test(s.name)).map((s) => ({ op: "active", section: s.id, add: [trackId] }))]);
    await d.setSong(ns, { label: `clip ${name}` });
    void d.send(`I dropped in an audio clip "${name}" (${buf.duration.toFixed(1)}s, ${short ? "one-shot" : `${Math.round(f.tempo.bpm)} BPM warped to ${cur.bpm}`}, key ${f.key.name}) as track "${trackId}" in the drops and groove. Make it sit: level, placement, pitch, chops. Tell me what you did.`, { hidden: true });
  }, [d]);

  return { addReference, addClip };
}
