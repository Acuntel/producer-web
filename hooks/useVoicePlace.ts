"use client";
// A voice in the song, the way a producer does it (masterprompt 5.5 and 5.6): the beat moves to the voice if it must,
// the planner ranks the slots, each is checked offline on its own window, the best lands on its bar, the producer
// says one line and asks "Do you like where the voice sits?", and the thirty-second verdict window opens. "Next one"
// takes it back out and tries the next slot. Every verdict teaches the learner (lib/learn/placement.ts).
import { useCallback, useEffect, useRef } from "react";
import type { useStudio } from "./useStudio";
import type { Song } from "@/lib/song/types";
import type { VoiceSource, Slot } from "@/lib/song/place";
import { beatForVoice, offerVoice, landedLine, recordLanded, type Offered, type VoiceDeps } from "@/lib/voice/landVoice";
import { markVoiceOffer, closeVoiceOffer } from "@/lib/voice/offer";
import { studioJobs } from "@/lib/jobs/queue";
import { askClock } from "@/lib/ritual/questions";
import { logMove, onJudged } from "@/lib/taste";
import { setPlacementVerdict } from "@/lib/engine/ledger";
import { applyOps } from "@/lib/song/ops";

type Studio = ReturnType<typeof useStudio>;
type Deps = { studio: Studio; speak: (t: string) => Promise<void> | void };
type Current = { v: VoiceSource; src: AudioBuffer; slots: Slot[]; offered: Offered; moveId: string; lane: string };
const harness = () => typeof window !== "undefined" && /[?&]e2e=1/.test(window.location.search);

export function useVoicePlace(d: Deps) {
  const dRef = useRef(d); dRef.current = d;
  const cur = useRef<Current | null>(null);
  const log = useRef<{ at: number; kind: string; slot: string; line: string; check: unknown; landsAtBar: number | null; beatMoved: boolean; ms: number }[]>([]);

  const deps = (): VoiceDeps => {
    const s = dRef.current.studio;
    return { getSong: s.getSong, registerClip: (c) => s.registerClip(c), land: (song, o) => s.land(song, { label: o.label, boundary: o.boundary }) };
  };
  const say = (line: string) => { const s = dRef.current.studio; s.append("assistant", line); void dRef.current.speak(line); };

  // Land, say the line, open the window, remember the rows the verdict will label.
  const settle = useCallback(async (v: VoiceSource, src: AudioBuffer, slots: Slot[], offered: Offered, first: boolean, t0: number, beatMoved: boolean) => {
    const s = dRef.current.studio; const song = s.getSong();
    const { learner } = await learn();
    const { dnaLaneFor } = await import("@/lib/brain/laneNames");
    const lane = song.lane;
    const entry = logMove({ title: song.title, said: `a voice from ${v.name}`, move: `placed ${v.name} as ${offered.slot.kind} (phrase ${offered.slot.phrase.id})` });
    recordLanded(v, offered, entry.id, lane, first);
    learner.recordOffer({ moveId: entry.id, lane, beatFamily: dnaLaneFor(song.lane), voiceFamily: v.family, kind: offered.slot.kind, role: offered.slot.phrase.role, section: offered.slot.targetRole, terms: offered.slot.terms, first });
    const { setVocalFacts } = await import("@/lib/ears/vocalFacts");
    const c = offered.check;
    const at = offered.landing?.landsAtBar ?? null;
    setVocalFacts(c ? { source: v.name, slot: `${offered.slot.kind}:${offered.slot.phrase.id}`, lands: at ? `bar ${at}` : "the next bar", tracks: offered.tracks, anchorErrMs: c.anchorErrMs, anchorErrBeats: c.anchorErrBeats, masked: c.masked, maskGapDb: c.maskGapDb, inScale: c.inScale, chordFit: c.chordFit, leadCollisions: c.leadCollisions, crossesBoundary: c.crossesBoundary, pass: c.pass } : null);
    cur.current = { v, src, slots, offered, moveId: entry.id, lane };
    const line = landedLine(v, offered.slot, c);
    askClock.last = Date.now();
    markVoiceOffer(entry.id);
    s.openVerdict(entry.id);
    say(line);
    log.current.push({ at: Date.now(), kind: offered.slot.kind, slot: `${offered.slot.kind}:${offered.slot.phrase.id}`, line, check: c, landsAtBar: at, beatMoved, ms: Math.round(performance.now() - t0) });
  }, []);

  /** Put this voice in the song: `src` is the whole separated vocal (or the take) its phrases are cut from. */
  const place = useCallback(async (v: VoiceSource, src: AudioBuffer): Promise<string | null> => {
    const s = dRef.current.studio; const t0 = performance.now();
    const { done } = studioJobs.enqueue({ text: `placing the voice from ${v.name}`, origin: v.kind === "take" ? "take" : "voice", songId: s.getSong().id }, async () => {
      let base: Song = s.getSong();
      // Law 8: when the voice cannot reach the beat inside 12% and 3 semitones, the beat moves to the voice first.
      const moved = beatForVoice(base, v);
      if (moved) { const l = await s.land(moved, { label: `the beat moved to ${v.name}`, boundary: "phrase" }); if (l) await Promise.race([l.landed, new Promise((r) => setTimeout(r, 20000))]); base = s.getSong(); }
      const { learner } = await learn();
      const { slotsFor } = await import("@/lib/voice/landVoice");
      const { vocalPrior } = await import("@/lib/voice/prior");
      const slots = slotsFor(v, base, { roleCounts: learner.roleCounts, pIn: learner.pInFor(base.lane), leadInGapBeats: vocalPrior(v.family, v.bpm)?.leadInBeats ?? null, seed: `${base.id ?? base.title}|${v.name}` });
      if (!slots.length) { say(`I could not find a place for the voice from ${v.name} in this record.`); return { failed: true }; }
      const offered = await offerVoice(v, src, slots, 0, base, deps(), { idBase: `vox_${Math.abs(hash(v.clipKey)).toString(36).slice(0, 6)}`, lane: base.lane });
      if (!offered) { say(`The voice from ${v.name} would not go in. Say it again and I will try another line.`); return { failed: true }; }
      await settle(v, src, slots, offered, true, t0, !!moved);
      return { landing: offered.landing, detail: `the voice from ${v.name}` };
    });
    await done;
    return null;
  }, [settle]);

  /** "Next one": the placement comes back out and the next slot goes in. */
  const next = useCallback(async (): Promise<boolean> => {
    const c = cur.current; if (!c) return false;
    const s = dRef.current.studio; const t0 = performance.now();
    const { learner } = await learn();
    learner.recordVerdict(c.moveId, "next"); setPlacementVerdict(c.moveId, "next"); closeVoiceOffer(c.moveId);
    studioJobs.enqueue({ text: `the next place for ${c.v.name}`, origin: "voice", songId: s.getSong().id }, async () => {
      const base = applyOps(s.getSong(), c.offered.revert).song;
      const offered = await offerVoice(c.v, c.src, c.slots, c.offered.index + 1, base, deps(), { idBase: `vox_${Math.abs(hash(c.v.clipKey + c.offered.index)).toString(36).slice(0, 6)}`, lane: base.lane });
      if (!offered) { say(`That was every place I had for ${c.v.name}. Say keep and I will leave the last one, or pull another voice.`); return { failed: true }; }
      await settle(c.v, c.src, c.slots, offered, false, t0, false);
      return { landing: offered.landing, detail: `the voice from ${c.v.name}` };
    });
    return true;
  }, [settle]);

  // A verdict in the window teaches the learner: "in" 1, a no 0, three quiet passes 0.5.
  useEffect(() => onJudged((id, v) => {
    const c = cur.current; if (!c || c.moveId !== id) return;
    const verdict = v === "liked" ? "in" : v === "rejected" ? "next" : v === "dead" ? "quiet" : null;
    if (!verdict) return;
    void learn().then(({ learner }) => learner.recordVerdict(id, verdict));
    setPlacementVerdict(id, verdict); closeVoiceOffer(id);
  }), []);

  useEffect(() => {
    if (!harness()) return;
    const w = window as unknown as Record<string, unknown>;
    w.__voiceKit = () => import("@/lib/voice/probeKit");
    w.__landSong = (song: Song) => dRef.current.studio.land(song, { label: "probe", boundary: "bar" }).then((l) => (l ? { landsAtBar: l.landsAtBar } : null));
    w.__placeVoice = (v: VoiceSource, src: AudioBuffer) => place(v, src);
    w.__nextVoice = () => next();
    (window as unknown as { __voicePlace?: () => unknown }).__voicePlace = () => ({ log: log.current, current: cur.current ? { moveId: cur.current.moveId, slot: `${cur.current.offered.slot.kind}:${cur.current.offered.slot.phrase.id}`, index: cur.current.offered.index, slots: cur.current.slots.length, tried: cur.current.offered.tried } : null });
  }, [place, next]);
  return { place, next };
}

const learn = async () => ({ learner: await import("@/lib/learn/placement") });
function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h; }
