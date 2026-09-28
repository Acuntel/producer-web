// The candidate slots for a phrase in a song (masterprompt 5.5): the hook on bar 1 of the drop (in every drop), a
// lead-in whose last word lands on the drop's downbeat, a verse line over the breakdown, an offbeat chop inside the
// drop, call and response in the lead's gaps, and a tag at a phrase end in the build. Every anchor sits on a 4-bar
// boundary, and the source's pickup is kept before the one. Tone-free and browser-free.
import type { Song } from "../types";
import type { Fit } from "../fit";
import type { Instance, PlacePhrase, Placed, SlotKind, VoiceSource } from "./types";
import { leadsUnder } from "./geometry";

export type Draft = { kind: SlotKind; phrase: PlacePhrase; target: number; instances: Instance[]; why: string };

const beatsOf = (sec: number, bpm: number, rate: number) => (sec / rate) * (bpm / 60);

/** One sounding: the clip cut at `cut` starts so that source time `anchorSrc` lands on song beat `anchorBeat`. */
export function instanceAt(secs: Placed[], cut: [number, number], anchorSrc: number, anchorBeat: number, bpm: number, f: Fit, double = false): Instance | null {
  const anchorInCut = anchorSrc - cut[0];
  const start = anchorBeat - beatsOf(anchorInCut, bpm, f.rate);
  if (start < 0) return null;
  const host = secs.find((s) => start >= s.startBeat - 1e-6 && start < s.startBeat + s.beats - 1e-6);
  if (!host) return null;
  return { host: host.id, hostIndex: host.index, noteBeat: Math.max(0, start - host.startBeat), anchorBeat, lengthBeats: beatsOf(cut[1] - cut[0], bpm, f.rate), cut, anchorInCut, ...(double ? { double } : {}) };
}

/** The chop's cut: one or two syllables from the stressed one. */
export function chopCut(p: PlacePhrase): [number, number] {
  const next = p.onsets.filter((t) => t > p.stress + 0.08);
  const end = Math.min(next[1] ?? next[0] ?? p.stress + 0.5, p.stress + 0.6, p.cut[1]);
  return [Math.max(p.cut[0], p.stress - 0.02), Math.max(p.stress + 0.18, end - 0.02)];
}

export function slotsFor(v: VoiceSource, song: Song, secs: Placed[], f: Fit, o: { leadInGapBeats?: number | null } = {}): Draft[] {
  const bpm = song.bpm;
  const out: Draft[] = [];
  const drops = secs.filter((s) => s.role === "drop");
  const breaks = secs.filter((s) => s.role === "break");
  const builds = secs.filter((s) => s.role === "build");
  const ranked = [...v.phrases].sort((a, b) => b.hookScore - a.hookScore || a.order - b.order);
  const hookish = ranked.filter((p) => p.role === "hook").slice(0, 2);
  const pool = [...new Set([...hookish, ...ranked.slice(0, 8)])];
  const lenBeats = (p: PlacePhrase) => beatsOf(p.cut[1] - p.cut[0], bpm, f.rate);

  for (const p of pool) {
    // The hook on bar 1 of the drop, in every drop; the second drop doubles it rather than singing a new line.
    if (drops.length && (p.role === "hook" || p === ranked[0])) {
      const ins = drops.map((d, i) => instanceAt(secs, p.cut, p.stress, d.startBeat, bpm, f, i > 0)).filter((x): x is Instance => !!x);
      if (ins.length) out.push({ kind: "drop-hook", phrase: p, target: drops[0].index, instances: ins, why: `the hook comes in on the one of the drop${drops.length > 1 ? " and again in the second drop, doubled" : ""}` });
    }
    // A lead-in: its last word on the drop's downbeat, or its end the family's learned gap before it.
    if (drops.length && p.lastWord !== null && p.role !== "adlib") {
      const ins = drops.map((d) => {
        if (o.leadInGapBeats && o.leadInGapBeats > 0) return instanceAt(secs, p.cut, p.cut[1], d.startBeat - o.leadInGapBeats, bpm, f);
        return instanceAt(secs, p.cut, p.lastWord!, d.startBeat, bpm, f);
      }).filter((x): x is Instance => !!x && x.hostIndex < secs.length);
      const fits = ins.filter((x) => secs[x.hostIndex].role !== "drop");
      if (fits.length) out.push({ kind: "lead-in", phrase: p, target: drops[0].index, instances: fits, why: o.leadInGapBeats ? `its last word ends ${o.leadInGapBeats.toFixed(1)} beats before the drop, the gap records of this kind leave` : "its last word lands on the one of the drop" });
    }
    // A verse line over the breakdown's pads, on its first 4-bar boundary where the whole line fits.
    if (breaks.length && (p.role === "verse" || p.role === "hook")) {
      const b = breaks[0];
      for (let bar = 0; bar < b.bars; bar += 4) {
        const at = b.startBeat + bar * 4;
        const x = instanceAt(secs, p.cut, p.stress, at, bpm, f);
        const ends = x ? secs[x.hostIndex].startBeat + x.noteBeat + lenBeats(p) : Infinity;
        if (x && ends <= b.startBeat + b.beats + 0.01 && x.hostIndex >= b.index - 1) {
          out.push({ kind: "break-verse", phrase: p, target: b.index, instances: [x], why: "a verse line sits over the breakdown's pads" });
          break;
        }
      }
    }
    // A tag at a phrase end in the build: the stressed word on beat 1 of the last bar of its first 4-bar group.
    if (builds.length && (p.role === "tag" || p.role === "adlib" || lenBeats(p) <= 4)) {
      const b = builds[0];
      const bar = Math.min(3, b.bars - 1);
      const x = instanceAt(secs, p.cut, p.stress, b.startBeat + bar * 4, bpm, f);
      if (x && secs[x.hostIndex].startBeat + x.noteBeat + lenBeats(p) <= b.startBeat + Math.min(b.beats - 0.5, (bar + 1) * 4 + 0.01)) out.push({ kind: "build-tag", phrase: p, target: b.index, instances: [x], why: "a tag answers the end of the build's first phrase" });
    }
    // An offbeat chop of one or two syllables inside the drop: the and of 2 and 4 in every other bar.
    if (drops.length && p.onsets.length && (p.role === "hook" || p === ranked[0] || p.role === "tag")) {
      const cut = chopCut(p);
      const d = drops[0];
      const hits: number[] = [];
      for (let bar = 1; bar < d.bars; bar += 2) hits.push(bar * 4 + 1.5, bar * 4 + 3.5);
      const x = instanceAt(secs, cut, p.stress, d.startBeat + hits[0], bpm, f);
      if (x && hits.length) out.push({ kind: "drop-chop", phrase: { ...p, cut }, target: d.index, instances: [{ ...x, hits: hits.map((h) => h - hits[0]) }], why: "a one-word chop answers the kick on the offbeats of the drop" });
    }
    // Call and response: the line in a gap of the lead inside the drop, starting on a bar.
    if (drops.length && lenBeats(p) <= 8) {
      const d = drops[0];
      for (let bar = 0; bar + 1 < d.bars; bar++) {
        const at = d.startBeat + bar * 4;
        const x = instanceAt(secs, p.cut, p.stress, at, bpm, f);
        if (!x || x.hostIndex !== d.index) continue;
        const from = d.startBeat + x.noteBeat, to = from + lenBeats(p);
        if (to > d.startBeat + d.beats) break;
        const busy = leadsUnder(song, [d], from - 0.25, to + 0.25).some((l) => l.notes.length);
        if (!busy && leadsUnder(song, [d], d.startBeat, d.startBeat + d.beats).length) {
          out.push({ kind: "call-response", phrase: p, target: d.index, instances: [x], why: `it answers the lead in its gap on bar ${bar + 1} of the drop` });
          break;
        }
      }
    }
  }
  return out;
}
