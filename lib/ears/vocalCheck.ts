// The ears on a vocal placement (masterprompt 5.6): render only the placement window (the bars the voice enters from
// and the bar it lands on) twice, the voice alone and everything else, and measure what a producer listens for: the
// stressed syllable against its downbeat, the voice buried or clear in 1 to 5 kHz, the notes it sings against the key
// and the chords under it, the lead in its register while it sings, a phrase that runs across a boundary, and a cut
// that starts or ends inside a word. A placement lands only after this passes, or it is offered as the best of the
// ones tried with the reason it did not.
import type { Song } from "../song/types";
import type { Slot } from "../song/place";
import { layout, placementWindow } from "../song/place";
import { chromaUnder, leadsUnder } from "../song/placing/geometry";
import { parseKey } from "../song/harmony";
import { renderWindow } from "../engine/window";
import { rmsEnvelope, stretchEnvelope, alignLag, maskedShare, pitchClasses, edgeDb, hopOf, firstOver } from "./vocalMeasure";
import { put } from "../engine/assets";

export type VocalCheck = {
  slot: string; fromBeat: number; toBeat: number; renderMs: number;
  anchorErrMs: number; anchorErrBeats: number; anchorOk: boolean; corr: number; gridMs: number;
  masked: number; maskGapDb: number; maskOk: boolean;
  inScale: number; chordFit: number; keyOk: boolean;
  leadCollisions: number; collisionOk: boolean;
  crossesBoundary: boolean; inGapBeats: number;
  edgeDb: number; edgeOk: boolean;
  pass: boolean;
};

/** The pass lines: a sixteenth of a beat for the anchor (8.6), at most half the sung frames buried, most of what is
 *  sung inside the key, no lead note in its register under it, no phrase run across a boundary, clean cut edges. */
export const LIMITS = { anchorBeats: 1 / 16, masked: 0.5, inScale: 0.5, edgeDb: -12 };

const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
const mono = (b: AudioBuffer) => { if (b.numberOfChannels === 1) return b.getChannelData(0); const a = b.getChannelData(0), c = b.getChannelData(1); const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = 0.5 * (a[i] + c[i]); return o; };
const cos = (a: number[], b: number[]) => { let d = 0, x = 0, y = 0; for (let i = 0; i < 12; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return x && y ? d / Math.sqrt(x * y) : 0; };
const r = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

/** Check a placement already applied to `song`: `tracks` are the placed tracks (the first is the one in the window)
 *  and `cut` is the first instance's cut as it was stored, before any stretch. */
export async function vocalCheck(song: Song, slot: Slot, tracks: string[], cut: AudioBuffer): Promise<VocalCheck> {
  const t0 = performance.now();
  const bpm = song.bpm, beatSec = 60 / bpm;
  const w = placementWindow(slot, song);
  const secs = layout(song);
  const x = slot.instances[0];
  const mine = new Set(tracks);
  // The voice is timed dry: its own echoes, the section's sweeps, the riser and the silent gap before a drop would
  // move where it seems to start, which is a measurement of the effects and not of where the voice was put. A click
  // one bar before the phrase is the render's own grid: every part in a render sounds a few milliseconds after its
  // written time (the same for all of them), so the anchor is read against that click, never against the clock. The
  // desk is out of the timing too: no compression and no makeup (they lift a consonant against its vowel and move
  // where a syllable seems to start), no reverb send, no master sweep.
  const startBeat = secs[x.hostIndex].startBeat + x.noteBeat;
  const tFrom = Math.max(0, Math.floor(startBeat / 4) * 4 - 4), tTo = Math.ceil(Math.max(x.anchorBeat + 1, startBeat + x.lengthBeats));
  const grid = startBeat - tFrom >= 1 ? gridClick(song, tFrom) : null;
  const dry: Song = { ...song, master: { ...(song.master ?? {}), compThreshold: 0, makeup: 0, filter: undefined }, sections: song.sections.map((q) => ({ ...q, automation: [], fill: "none", active: grid && q.id === grid.section ? [...q.active, GRID] : q.active })), tracks: [...song.tracks.map((t) => (t.id === tracks[0] ? { ...t, fx: { reverb: 0 } } : t)), ...(grid ? [grid.track] : [])] };
  const timed = await renderWindow(dry, tFrom, tTo, { audible: (t) => t.id === tracks[0] || t.id === GRID });
  // The voice as the room plays it and everything else, over the placement window: masking and key are heard there.
  const voice = await renderWindow(song, w.fromBeat, w.toBeat, { audible: (t) => t.id === tracks[0] });
  const rest = await renderWindow(song, w.fromBeat, w.toBeat, { audible: (t) => !mine.has(t.id) });
  const renderMs = Math.round(performance.now() - t0);
  const sr = timed.sampleRate;
  const tv = mono(timed);
  const gridSec = grid ? firstOver(tv, sr, 0.05, 0, Math.round(0.25 * beatSec * sr)) ?? 0 : 0;
  const v = mono(voice), o = mono(rest);

  // The envelope of the whole cut, stretched by the fit, says the render holds the right line (its correlation).
  const hop = hopOf(sr);
  const ref = stretchEnvelope(rmsEnvelope(cut.getChannelData(0), cut.sampleRate, hop), (hopOf(cut.sampleRate, hop) / hop) / slot.fit.rate);
  const expect = ((startBeat - tFrom) * beatSec + gridSec) / hop;
  const { corr } = alignLag(ref, rmsEnvelope(tv, sr, hop), Math.floor(expect - 0.15 / hop), Math.ceil(expect + 0.15 / hop));
  const target = (x.anchorBeat - tFrom) * beatSec;
  // The stressed syllable's neighbourhood (200 ms either side on the source, stretched by the fit) is found in the
  // render by its own shape, within 60 ms of where it belongs: a legato word has no single onset to threshold, but
  // the shape around it moves as one.
  const W = 0.2, cm = cut.getChannelData(0), ch = hopOf(cut.sampleRate, hop);
  const srcEnv = rmsEnvelope(cm, cut.sampleRate, ch, 0.01);
  const i0 = Math.max(0, Math.round((x.anchorInCut - W) / ch)), i1 = Math.min(srcEnv.length, Math.round((x.anchorInCut + W) / ch));
  const local = stretchEnvelope(srcEnv.subarray(i0, i1), (ch / hop) / slot.fit.rate);
  const renEnv = rmsEnvelope(tv, sr, hop, 0.01);
  const at = (target + gridSec - (x.anchorInCut - i0 * ch) / slot.fit.rate) / hop;
  const near = alignLag(local, renEnv, Math.floor(at - 0.06 / hop), Math.ceil(at + 0.06 / hop), false);
  const heard = near.corr > 0 ? near.lag * hop + (x.anchorInCut - i0 * ch) / slot.fit.rate : null;
  const want = target;
  const errSec = heard === null ? Infinity : heard - gridSec - want;

  // The span the voice sings in, inside the window.
  const endBeat = startBeat + x.lengthBeats;
  const s0 = Math.max(0, Math.floor((startBeat - w.fromBeat) * beatSec * sr)), s1 = Math.min(v.length, Math.ceil((endBeat - w.fromBeat) * beatSec * sr));
  const vs = v.subarray(s0, s1), os = o.subarray(s0, s1);
  const mask = maskedShare(vs, os, sr);
  const pcs = pitchClasses(vs, sr);
  const k = parseKey(song.key);
  const scale = k ? (k.mode === "minor" ? MINOR : MAJOR).map((d) => (d + k.pc) % 12) : [];
  const inScale = k ? scale.reduce((s, pc) => s + pcs[pc], 0) : 1;
  const chordFit = cos(pcs, chromaUnder(song, secs, startBeat, endBeat));

  // The lead in the voice's register while it sings (after the placement took it out of the way).
  const midis = slot.phrase.midis.map((m) => m + slot.fit.semitones);
  const lo = midis.length ? Math.min(...midis) - 5 : -Infinity, hi = midis.length ? Math.max(...midis) + 5 : Infinity;
  let leadCollisions = 0;
  for (const l of leadsUnder(song, secs, startBeat, endBeat)) {
    const t = song.tracks.find((q) => q.id === l.track);
    const shift = 12 * (t?.synth?.octave ?? 0);
    leadCollisions += l.notes.filter(([m]) => m + shift >= lo && m + shift <= hi).length;
  }
  // A phrase that runs more than a bar past the section its anchor is in has crossed a boundary it should not.
  const home = secs.find((s) => x.anchorBeat >= s.startBeat - 1e-6 && x.anchorBeat < s.startBeat + s.beats - 1e-6);
  const crossesBoundary = !!home && endBeat > home.startBeat + home.beats + 4;
  let inGap = 0;
  for (const s of secs) if (s.fill === "cut") { const g0 = s.startBeat + s.beats - 0.5, g1 = s.startBeat + s.beats; if (endBeat > g0 && startBeat < g1) inGap += Math.min(endBeat, g1) - Math.max(startBeat, g0); }
  const edge = edgeDb(cut.getChannelData(0), cut.sampleRate);

  const anchorErrBeats = Number.isFinite(errSec) ? errSec / beatSec : 99;
  const out: VocalCheck = {
    slot: `${slot.kind}:${slot.phrase.id}`, fromBeat: w.fromBeat, toBeat: w.toBeat, renderMs,
    anchorErrMs: Number.isFinite(errSec) ? r(errSec * 1000, 1) : 9999, anchorErrBeats: r(anchorErrBeats, 4), gridMs: r(gridSec * 1000, 2), anchorOk: Math.abs(anchorErrBeats) <= LIMITS.anchorBeats && corr > 0.3, corr: r(corr),
    masked: mask.masked, maskGapDb: mask.medianGapDb, maskOk: mask.masked <= LIMITS.masked,
    inScale: r(inScale), chordFit: r(chordFit), keyOk: inScale >= LIMITS.inScale,
    leadCollisions, collisionOk: leadCollisions === 0,
    crossesBoundary, inGapBeats: r(inGap, 2),
    edgeDb: edge, edgeOk: edge <= LIMITS.edgeDb,
    pass: false,
  };
  out.pass = out.anchorOk && out.maskOk && out.keyOk && out.collisionOk && !out.crossesBoundary && out.edgeOk;
  return out;
}

// The grid click: one sample at full scale, played by the same one-shot path a voice plays through, on the first beat
// of the render. Where it is heard is where the render's grid is.
const GRID = "__grid";
let clickMade = false;
function gridClick(song: Song, beat: number): { track: Song["tracks"][number]; section: string } | null {
  const secs = layout(song);
  const sec = secs.find((q) => beat >= q.startBeat - 1e-6 && beat < q.startBeat + q.beats - 1e-6);
  if (!sec) return null;
  if (!clickMade) { const b = new AudioBuffer({ length: 64, numberOfChannels: 1, sampleRate: 44100 }); b.getChannelData(0)[0] = 0.9; put("grid:click", b); clickMade = true; }
  return { section: sec.id, track: { id: GRID, name: "grid", role: "audio", volume: 0, duck: false, loopBeats: sec.beats, notes: [[60, beat - sec.startBeat, 0.25, 127]], groove: null, clip: { clipId: "grid:click", name: "grid", oneShot: true, gainDb: 0 } } };
}
