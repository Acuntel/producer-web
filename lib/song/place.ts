// Place the voice (masterprompt 5.5). dropVocal, the chops and Brady's own takes all call this: it lists the
// candidate slots for every phrase worth singing, scores each on H, K, R, C, M, S, B, E and G, ranks them (the
// learned P(in) once there are enough verdicts), explores the top three by a seeded Thompson draw, and turns the
// chosen slot into ops: the cut on its bar, fitted to the song's tempo and key with formants kept, the lead out of the
// voice's way while it sings. Tone-free and browser-free: the planner is arithmetic, so it is tested.
import type { Song, Track, Note } from "./types";
import { fitOnto, fitCost, type Fit } from "./fit";
import { hashStr } from "./prng";
import { layout, isLead, isMid } from "./placing/geometry";
import { slotsFor } from "./placing/slots";
import { termsFor, ruleScore, harmonic, ruleCounts, type RoleCounts } from "./placing/score";
import { chromaUnder } from "./placing/geometry";
import type { Instance, Placed, Slot, Terms, VoiceSource } from "./placing/types";

export type { Slot, VoiceSource, PlacePhrase, Instance, Terms, SlotKind } from "./placing/types";
export { voiceFromMap, voiceFromPhrases } from "./placing/phrases";
export { layout } from "./placing/geometry";

export type PlaceOptions = {
  roleCounts?: RoleCounts;
  /** A fitted P(in) over the terms for this lane (lib/learn/placement.ts), or null while there are too few verdicts. */
  pIn?: ((t: Terms) => number) | null;
  /** Beats between the lead-in's last word and the drop, from records of the source's family (8 or more), else null. */
  leadInGapBeats?: number | null;
  /** The seed of the exploration: the record, the voice and the take, so a reload offers the same slot. */
  seed?: string;
};

/** How this voice goes onto this song: stretched to its tempo (or double or half) and moved into its key. */
export function fitVoice(v: VoiceSource, song: Song): Fit & { playsAt: number; fits: boolean } {
  if (v.kind === "take") return { rate: 1, semitones: 0, playsAt: song.bpm, fits: true };
  return fitOnto({ bpm: v.bpm, key: v.key }, song);
}

// A seeded draw from Beta(a, b) (Marsaglia and Tsang for the two gammas), for Thompson sampling.
function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 1_000_000) / 1_000_000 + 5e-7; }; }
function gamma(k: number, r: () => number): number {
  if (k < 1) return gamma(k + 1, r) * Math.pow(r(), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const z = Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());
    const v = Math.pow(1 + c * z, 3); if (v <= 0) continue;
    if (Math.log(r()) < 0.5 * z * z + d - d * v + d * Math.log(v)) return d * v;
  }
}
const betaDraw = (a: number, b: number, r: () => number) => { const x = gamma(a, r), y = gamma(b, r); return x / (x + y); };

/** Every slot for every phrase worth singing, scored, best first; the top three in the order a seeded Thompson draw
 *  on their section-role fit puts them (the producer offers the first and "next one" walks the rest). */
export function planPlacements(v: VoiceSource, song: Song, o: PlaceOptions = {}): Slot[] {
  const secs = layout(song);
  if (!secs.length || !v.phrases.length) return [];
  const base = fitVoice(v, song);
  const counts = o.roleCounts ?? ruleCounts;
  const drafts = slotsFor(v, song, secs, base, { leadInGapBeats: o.leadInGapBeats ?? null });
  const scored: Slot[] = [];
  for (const d of drafts) {
    const first = d.instances[0];
    const from = secs[first.hostIndex].startBeat + first.noteBeat;
    // The shift the harmony asks for, within three semitones, preferring the key's own.
    // A line the singer took in another key than the record (keyRelToSource) is moved by that too.
    const prefer = (((base.semitones + (d.phrase.keyRel ?? 0)) % 12) + 18) % 12 - 6;
    const shift = v.kind === "take" ? 0 : harmonic(d.phrase.chroma, chromaUnder(song, secs, from, from + first.lengthBeats), Math.max(-3, Math.min(3, prefer))).shift;
    const fit = { rate: base.rate, semitones: shift, playsAt: base.playsAt };
    if (fitCost(fit) > 1) continue;
    const terms = termsFor(d.kind, d.phrase, d.target, d.instances, { song, secs, fit, roleCounts: counts, phrases: v.phrases });
    const rule = ruleScore(terms);
    const score = o.pIn ? Math.round(o.pIn(terms) * 1000) / 1000 : rule;
    scored.push({ kind: d.kind, phrase: d.phrase, target: d.target, targetRole: secs[d.target].role, fit, instances: d.instances, terms, score, why: d.why });
  }
  scored.sort((a, b) => b.score - a.score || a.phrase.order - b.phrase.order);
  // One slot per kind and phrase (the best), then explore the top three.
  const seen = new Set<string>();
  const uniq = scored.filter((s) => { const k = `${s.kind}|${s.phrase.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const r = rng(hashStr(o.seed ?? `${song.id ?? song.title}|${v.name}`));
  const top = uniq.slice(0, 3).map((s) => { const [a, b] = counts(s.phrase.role, s.targetRole); const drawn = betaDraw(a, b, r); return { s, key: s.score + 0.15 * (drawn - s.terms.S) }; });
  top.sort((a, b) => b.key - a.key);
  return [...top.map((x) => x.s), ...uniq.slice(3)];
}

/** The bars a placement lives in: the last 4 bars of the section the voice enters from, and bar 1 after the anchor. */
export function placementWindow(slot: Slot, song: Song): { fromBeat: number; toBeat: number; anchorBeat: number } {
  const secs = layout(song);
  const x = slot.instances[0];
  const start = secs[x.hostIndex].startBeat + x.noteBeat;
  const anchorBar = Math.floor(x.anchorBeat / 4) * 4;
  const fromBeat = Math.max(0, Math.min(anchorBar - 16, Math.floor(start / 4) * 4));
  const end = Math.max(start + x.lengthBeats, x.anchorBeat + 4);
  return { fromBeat, toBeat: Math.ceil(end / 4) * 4, anchorBeat: x.anchorBeat };
}

/** The ops that land a slot: one audio track per sounding (the cut on its bar, fitted, a voice), the second drop's a
 *  double panned and a hair behind, and the lead's notes out of the voice's register while it sings. `cuts` names
 *  the stored clip of each instance's cut. */
export function placementOps(slot: Slot, v: VoiceSource, song: Song, cuts: string[], idBase: string): { ops: unknown[]; tracks: string[] } {
  const secs = layout(song);
  const ops: unknown[] = []; const tracks: string[] = []; const spans: [number, number][] = [];
  const clipBpm = song.bpm / slot.fit.rate;
  slot.instances.forEach((x, i) => {
    const host = secs[x.hostIndex];
    const id = `${idBase}_${i}`;
    const lenBeats = Math.max(0.25, x.lengthBeats);
    const hits = x.hits ?? [0];
    const notes: Note[] = hits.map((h) => [60, Math.round((x.noteBeat + h + (x.double ? 0.03 : 0)) * 10000) / 10000, Math.round(Math.min(lenBeats, x.hits ? 1 : lenBeats) * 10000) / 10000, 112]);
    const label = `${v.name} ${slot.kind === "drop-chop" ? "chop" : "vocal"}${x.double ? " double" : ""}`;
    const track: Track = {
      // A voice sits where it was placed: no groove moves it (the song's swing and a drummer's template would push
      // every word off its anchor), and no chance roll drops it.
      id, name: label.slice(0, 24), role: "audio", volume: x.double ? -9 : -3, duck: false, loopBeats: host.beats, notes, groove: null, chance: 1,
      clip: { clipId: cuts[i] ?? cuts[0], name: label, oneShot: true, voice: true, bpm: Math.round(clipBpm * 10000) / 10000, warp: true, semitones: slot.fit.semitones, gainDb: levelOf(slot.phrase), durationSec: x.cut[1] - x.cut[0] },
      fx: { filter: { type: "highpass", cutoff: 140 }, delay: { time: "8n", feedback: 0.22, wet: 0.16 }, reverb: 0.2, ...(x.double ? { pan: i % 2 ? -0.35 : 0.35 } : {}) },
    };
    ops.push({ op: "addTrack", track }, { op: "active", section: host.id, add: [id] });
    tracks.push(id);
    spans.push([host.startBeat + x.noteBeat, host.startBeat + x.noteBeat + (x.hits ? x.hits[x.hits.length - 1] : 0) + lenBeats]);
  });
  // The lead's notes come out once per section, for every span the voice sings in it (the sung notes moved by the fit).
  ops.push(...leadOutOfTheWay(song, secs, spans, slot.phrase.midis.map((m) => m + slot.fit.semitones)));
  ops.push(...midsUnder(song, secs, spans));
  return { ops, tracks };
}

/** The lead never plays in the voice's register while it sings: in each section the voice sounds in, the lead's
 *  notes under it (within five semitones of the sung range, or all of them when the phrase has no notes) drop out
 *  for that section only, which leaves the lead answering in the gaps. */
function leadOutOfTheWay(song: Song, secs: Placed[], spans: [number, number][], midis: number[]): unknown[] {
  const lo = midis.length ? Math.min(...midis) - 5 : -Infinity, hi = midis.length ? Math.max(...midis) + 5 : Infinity;
  const ops: unknown[] = [];
  const done = new Set<string>();
  for (const sec of secs) {
    const mine = spans.filter(([f, t]) => sec.startBeat < t && sec.startBeat + sec.beats > f);
    if (!mine.length) continue;
    for (const t of song.tracks) {
      if (!isLead(t) || !sec.active.includes(t.id) || done.has(`${sec.id}|${t.id}`)) continue;
      const plan = song.sections.find((s) => s.id === sec.id)?.variants?.[t.id];
      if (plan !== undefined && typeof plan !== "string") continue;
      const now = typeof plan === "string" ? t.patterns?.[plan] ?? t.notes : t.notes;
      const L = Math.max(0.25, t.loopBeats);
      const inReg = (m: number) => { const p = m + (t.transpose ?? 0) + 12 * (t.synth?.octave ?? 0); return p >= lo && p <= hi; };
      // A note is out when any pass of the loop puts it under a sung span.
      const hit = (n: Note) => { for (let rep = 0; rep * L < sec.beats; rep++) { const a = sec.startBeat + rep * L + n[1], b = a + n[2]; if (n[1] < L && a < sec.startBeat + sec.beats && mine.some(([f, e]) => b > f && a < e)) return true; } return false; };
      const keep = now.filter((n) => !(inReg(n[0]) && hit(n)));
      done.add(`${sec.id}|${t.id}`);
      if (keep.length !== now.length) ops.push({ op: "sectionNotes", section: sec.id, track: t.id, notes: keep });
    }
  }
  return ops;
}

/** The mids (1 to 5 kHz, where a voice is understood) duck under it: the pads, chords and stabs in each section the
 *  voice sings in dip 6 dB where it starts and come back up by the time it ends, a ramp and never a step. A section
 *  that already moves a part's level (a build's fade into the gap) keeps its own move. */
function midsUnder(song: Song, secs: Placed[], spans: [number, number][]): unknown[] {
  const ops: unknown[] = [];
  for (const sec of secs) {
    if (sec.role === "build") continue;
    const mine = spans.filter(([f, t]) => sec.startBeat < t && sec.startBeat + sec.beats > f);
    if (!mine.length) continue;
    const a = Math.max(0, Math.min(...mine.map(([f]) => f)) - sec.startBeat), b = Math.min(sec.beats, Math.max(...mine.map(([, t]) => t)) - sec.startBeat);
    const own = song.sections.find((q) => q.id === sec.id)?.automation ?? [];
    for (const t of song.tracks) {
      if (!sec.active.includes(t.id) || !isMid(t) || isLead(t) || own.some((x) => x.track === t.id && x.param === "volume")) continue;
      ops.push({ op: "automate", section: sec.id, automation: { track: t.id, param: "volume", from: t.volume - 6, to: t.volume, curve: "linear", startBeat: Math.round(a * 1000) / 1000, endBeat: Math.round(Math.max(a + 0.5, b) * 1000) / 1000 } });
    }
  }
  return ops;
}

/** A cut is normalized to its peak, so a breathy line plays quieter than a belted one: this brings its average level
 *  to about -14 dBFS (6 dB down or 4 dB up at most, so its peak stays under the ceiling), so a voice sits on top of the beat whatever the singer did. */
export function levelOf(p: { rmsDb: number; peakDb: number }): number {
  if (!Number.isFinite(p.rmsDb) || !Number.isFinite(p.peakDb)) return 0;
  return Math.round(Math.max(-6, Math.min(4, -14 - (p.rmsDb - p.peakDb - 1))) * 10) / 10;
}

export type { Placed };
export const slotLabel = (s: Slot) => `${s.kind}:${s.phrase.id}@${s.instances.map((x) => x.anchorBeat).join("+")}`;
export const firstInstance = (s: Slot): Instance => s.instances[0];
