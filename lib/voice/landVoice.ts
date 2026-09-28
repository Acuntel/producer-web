// The listen-then-ask loop for a voice (masterprompt 5.6): the planner ranks the slots, each is cut, fitted and
// checked offline on its own window (cheap), and the first that passes lands on its bar. If none of the three tried
// passes, the closest lands with the reason. Every try is a placement row in the ledger. The beat moves to the voice
// first when the voice cannot reach it inside 12% and 3 semitones (law 8). Tone-free: the engine and the ears load
// on demand.
import type { Song } from "../song/types";
import type { Landing } from "../engine/landing";
import type { VocalCheck } from "../ears/vocalCheck";
import { planPlacements, placementOps, slotLabel, fitVoice, type Slot, type VoiceSource, type PlaceOptions } from "../song/place";
import { applyOps } from "../song/ops";
import { cutId } from "../engine/cuts";
import { recordPlacement } from "../engine/ledger";
import { compileDraft } from "../song/draft";
import { beatFor, keyShift } from "../song/fit";

export type VoiceDeps = {
  getSong: () => Song;
  land: (s: Song, o: { label: string; boundary: "bar" | "phrase" }) => Promise<Landing | null>;
  registerClip: (c: { id: string; name: string; durationSec?: number }) => void;
};
export type Tried = { slot: string; score: number; check: VocalCheck | null };
export type Offered = { slot: Slot; index: number; tracks: string[]; revert: unknown[]; check: VocalCheck | null; tried: Tried[]; landing: Landing | null; song: Song };

const FAILS = (c: VocalCheck | null) => (c ? [c.anchorOk, c.maskOk, c.keyOk, c.collisionOk, !c.crossesBoundary, c.edgeOk].filter((x) => !x).length : 9);

/** The beat this voice needs when it cannot reach the song: the draft compiled again in its key at its tempo (double
 *  or half), or, for a record built by hand, the tempo and key moved and the pitched parts transposed. Null when the
 *  voice already fits. */
export function beatForVoice(song: Song, v: VoiceSource): Song | null {
  if (fitVoice(v, song).fits) return null;
  const want = beatFor(v, song.bpm);
  if (song.draft) return compileDraft(song.draft.dna, { songId: song.id ?? "rec", take: song.draft.take, steer: song.draft.steer, base: song, lock: want });
  const shift = want.key ? keyShift(song.key, want.key) ?? 0 : 0;
  const ops: unknown[] = [{ op: "tempo", bpm: want.bpm }];
  if (shift) ops.push({ op: "transpose", semitones: shift }, { op: "key", key: want.key });
  return applyOps(song, ops).song;
}

/** Cut each sounding's piece of the voice (content-addressed: the same cut is the same clip) and register it. */
async function cutsFor(slot: Slot, v: VoiceSource, src: AudioBuffer, deps: VoiceDeps): Promise<{ id: string; buffer: AudioBuffer }[]> {
  const { cutPhraseClip } = await import("../engine/slice");
  const out: { id: string; buffer: AudioBuffer }[] = [];
  const made = new Map<string, AudioBuffer>();
  for (const x of slot.instances) {
    const len = x.cut[1] - x.cut[0];
    const id = cutId(v.clipKey, x.cut[0], len, "vox");
    let buf = made.get(id);
    if (!buf) {
      const label = `${v.name} vocal at ${Math.floor(x.cut[0] / 60)}:${String(Math.floor(x.cut[0] % 60)).padStart(2, "0")}`;
      buf = (await cutPhraseClip(src, x.cut[0], len, id, label, { exact: true })).buffer;
      made.set(id, buf); deps.registerClip({ id, name: label, durationSec: buf.duration });
    }
    out.push({ id, buffer: buf });
  }
  return out;
}

/** What puts the song back the way it was before a placement: its tracks gone, its sections and the lead's patterns
 *  as they were. */
function revertOps(before: Song, tracks: string[]): unknown[] {
  const ops: unknown[] = tracks.map((t) => ({ op: "removeTrack", track: t }));
  ops.push({ op: "set", track: "song", path: "sections", value: JSON.parse(JSON.stringify(before.sections)) });
  for (const t of before.tracks) if (t.patterns) ops.push({ op: "set", track: t.id, path: "patterns", value: JSON.parse(JSON.stringify(t.patterns)) });
  return ops;
}

/** Try the slots from `from` on (at most `tries` of them), check each offline, land the first that passes (else the
 *  closest), and write every try to the ledger. `base` is the song to place into (a previous placement already
 *  taken back out). */
export async function offerVoice(v: VoiceSource, src: AudioBuffer, slots: Slot[], from: number, base: Song, deps: VoiceDeps, o: { tries?: number; idBase: string; lane: string }): Promise<Offered | null> {
  const { vocalCheck } = await import("../ears/vocalCheck");
  const tried: Tried[] = [];
  let best: (Offered & { fails: number }) | null = null;
  for (let i = from; i < slots.length && tried.length < (o.tries ?? 3); i++) {
    const slot = slots[i];
    const cuts = await cutsFor(slot, v, src, deps);
    const { ops, tracks } = placementOps(slot, v, base, cuts.map((c) => c.id), `${o.idBase}_${i}`);
    const r = applyOps(base, ops);
    if (r.skipped.length) continue;
    let check: VocalCheck | null = null;
    try { check = await vocalCheck(r.song, slot, tracks, cuts[0].buffer); } catch { check = null; }
    tried.push({ slot: slotLabel(slot), score: slot.score, check });
    const fails = FAILS(check);
    if (!best || fails < best.fails || (fails === best.fails && slot.score > best.slot.score)) best = { slot, index: i, tracks, revert: revertOps(base, tracks), check, tried, landing: null, song: r.song, fails };
    recordPlacement({ phrase: `${v.name}#${slot.phrase.id}`, slot: slotLabel(slot), scores: { ...slot.terms, score: slot.score }, checks: check ? { ...check } as unknown as Record<string, number | boolean> : { rendered: false }, verdict: null, lane: o.lane });
    if (fails === 0) break;
  }
  if (!best) return null;
  const landing = await deps.land(best.song, { label: `the voice from ${v.name}, ${best.slot.kind}`, boundary: "bar" });
  const { fails: _f, ...out } = best; void _f;
  return { ...out, tried, landing };
}

/** The row the ledger keeps for the placement that landed, under the move Brady's verdict will be written to. */
export function recordLanded(v: VoiceSource, off: Offered, moveId: string, lane: string, first: boolean) {
  recordPlacement({ phrase: `${v.name}#${off.slot.phrase.id}`, slot: slotLabel(off.slot), scores: { ...off.slot.terms, score: off.slot.score }, checks: off.check ? { ...off.check } as unknown as Record<string, number | boolean> : { rendered: false }, verdict: null, moveId, lane, landed: true, first });
}

/** The slots for a voice on this song, with the learner's priors (lib/learn/placement.ts). */
export function slotsFor(v: VoiceSource, song: Song, o: PlaceOptions): Slot[] { return planPlacements(v, song, o); }

/** The one line the producer says when a placement lands, and the question after it. */
export function landedLine(v: VoiceSource, s: Slot, c: VocalCheck | null): string {
  const n = v.kind === "take" ? "Your take" : v.name;
  const where: Record<Slot["kind"], string> = {
    "drop-hook": `${n} comes in on the one of the drop${s.instances.length > 1 ? ", and again in the second drop, doubled" : ""}.`,
    "lead-in": `${n} leads into the drop, and its last word lands on the one.`,
    "break-verse": `A line from ${n} sits over the breakdown.`,
    "drop-chop": `A chop of ${n} answers the kick on the offbeats of the drop.`,
    "call-response": `${n} answers the lead in its gap in the drop.`,
    "build-tag": `A tag from ${n} closes the first phrase of the build.`,
  };
  const why = !c ? " I could not listen back to it, so trust your ears on this one." : c.pass ? "" : ` It is the closest of the ones I tried, because ${!c.anchorOk ? "it lands a little off the beat" : !c.maskOk ? "the beat covers it in places" : !c.keyOk ? "it rubs against the key" : !c.collisionOk ? "the lead still plays over it" : !c.edgeOk ? "the cut is not clean" : "it runs past the section"}.`;
  return `${where[s.kind]}${why} Do you like where the voice sits?`;
}
