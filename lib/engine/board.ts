// The desk: the master chain, the buses, the riser, and the meters the eye reads.
// It is built once for a session and never torn down by a change, so a move by the
// producer is a ramp on a live desk rather than a new one. Every master number is
// rampable; the analysis taps sit on what actually leaves the master.
import * as Tone from "tone";
import type { Master, AutoParam } from "../song/types";
import { reverbImpulse } from "./context";
import { PRESCALE, softCeiling } from "./ceiling";

// meter = the smoothed level the bars show; wave = the raw samples, so PEAK is a real sample peak, not a held level.
export type Analysis = { fft: Tone.FFT; meter: Tone.Meter; wave: Tone.Analyser | null; tracks: Map<string, Tone.Meter> };
// `music` is where the record's voices, reverb and riser meet; the producer's talk-duck rides it, so an
// audition entering `master` goes through the whole master chain without being ducked with the record.
export type Buses = { master: Tone.ToneAudioNode; music: Tone.ToneAudioNode; duck: Tone.ToneAudioNode; reverb: Tone.ToneAudioNode };
export type Riser = { synth: Tone.NoiseSynth; hp: Tone.Filter };

export type Board = {
  buses: Buses;
  duck: Tone.Gain;
  gap: Tone.Gain;   // the silent gap before a drop (deskParts.ts): the whole music bus, tails included
  ceilingIn: Tone.ToneAudioNode;   // what enters the soft ceiling (pre-scaled): the desk probe's tap for overs
  analysis: Analysis;
  riser: (i: number) => Riser;
  talk: (on: boolean, now?: boolean) => void;
  fadeOut: (seconds: number) => void;
  /** The record's master settings. With `ramp`, each moves from audio time `at`, and a parameter in `skip`
   *  (under a running automation) is left alone. */
  applyMaster: (m: Master, ramp: boolean, at?: number, skip?: ReadonlySet<AutoParam>) => void;
  automate: (param: AutoParam, from: number, to: number, t0: number, t1: number, curve?: "linear" | "exp") => void;
  /** An automated master parameter back to the record's value, arriving at audio time `at`. */
  toBase: (param: AutoParam, at: number, m: Master) => void;
  dispose: () => void;
};

const RAMP = 0.05;
const EDGE = 0.005;
const TALK_DB = -7;   // how far the record steps back while the producer speaks
// Post-compressor gain when a record names none, set so the seed measures -10 to -8 LUFS through the
// real limiter and the soft ceiling with nothing flattened (docs/GYM_LOG.md, 2026-09-27).
export const DEFAULT_MAKEUP = 8.5;
// The record's limiter value is the ceiling it asks for. A DynamicsCompressor adds makeup gain of its own
// (about 0.57 of its threshold, by the Web Audio spec's formula), so it runs 3 dB under that ceiling: its
// output then sits about half a dB under it, and the soft ceiling is left only the fastest transients.
// Driven at the ceiling itself, the soft ceiling was bending +4 dBFS peaks and its true peak read -0.6.
export const LIMIT_UNDER = 3;

/** The desk, wired into `destination`. One per playing context (the live transport, or one offline render).
 *  An offline render has no eye on it, so it carries no analyser: those cost real time per block. */
export function makeBoard(destination?: Tone.ToneAudioNode, live = true): Board {
  const masterVol = new Tone.Volume(0);
  const masterEq = new Tone.EQ3(0, 0, 0);
  const masterFilter = new Tone.Filter(20000, "lowpass");
  const comp = new Tone.Compressor(-20, 3);
  const makeup = new Tone.Volume(DEFAULT_MAKEUP);
  // A real limiter: a hard knee, ratio 20, a 2 ms attack. Tone.Limiter is a compressor with a 30 dB soft
  // knee, which let the overs through to the clamp.
  const limiter = new Tone.Compressor({ threshold: -1 - LIMIT_UNDER, ratio: 20, knee: 0, attack: 0.002, release: 0.08 });
  // Final soft ceiling, pre-scaled and oversampled (ceiling.ts): near unity at low levels, bending smoothly
  // toward -1 dBFS, so nothing leaves above it and nothing is ever flattened.
  const prescale = new Tone.Gain(PRESCALE);
  const clipper = new Tone.WaveShaper(softCeiling, 8192);
  clipper.oversample = "4x";
  // The last gain on the desk: stop fades it down before the rig is torn down, so a tail is faded, not cut.
  const out = new Tone.Gain(1);
  masterVol.connect(masterEq); masterEq.connect(masterFilter); masterFilter.connect(comp); comp.connect(makeup); makeup.connect(limiter); limiter.connect(prescale); prescale.connect(clipper); clipper.connect(out);
  if (destination) out.connect(destination); else out.toDestination();

  // The visible proof: a spectrum fine enough to draw on a log axis, and a stereo meter.
  const fft = new Tone.FFT({ size: live ? 1024 : 32, smoothing: 0.5 });
  const meter = new Tone.Meter({ channelCount: 2, smoothing: 0.8 });
  const wave = live ? new Tone.Analyser({ type: "waveform", size: 1024, channels: 2 }) : null;
  if (live) { clipper.connect(fft); clipper.connect(meter); clipper.connect(wave!); }

  const master: Tone.ToneAudioNode = masterVol;
  const gap = new Tone.Gain(1).connect(master);
  const music = new Tone.Volume(0).connect(gap);
  const duck = new Tone.Gain(1).connect(music);
  // A native convolver on a generated room, not Freeverb: Freeverb is eight AudioWorklets running
  // JavaScript on the audio thread every 3 ms, and that thread is where a crackle is born.
  const reverb = new Tone.Convolver(Tone.ToneAudioBuffer.fromArray(reverbImpulse(masterVol.context.sampleRate)));
  reverb.connect(music);

  // Drop craft: every riser in the record gets its own noise voice and its own sweep, so two that
  // overlap never fight over one envelope. Built when the schedule is laid, never in the audio callback.
  const riserGain = new Tone.Gain(0.33).connect(music);
  const risers: Riser[] = [];
  const riser = (i: number): Riser => {
    while (risers.length <= i) {
      const synth = new Tone.NoiseSynth({ noise: { type: "white" } });
      const hp = new Tone.Filter(500, "highpass");
      synth.connect(hp); hp.connect(riserGain); risers.push({ synth, hp });
    }
    return risers[i];
  };

  type Settable = { value: number; rampTo: (v: number, r: number, at?: number) => unknown };
  const applyMaster: Board["applyMaster"] = (m, ramp, at, skip) => {
    const set = (param: Settable, v: number, owned?: AutoParam) => {
      if (!ramp) { param.value = v; return; }
      if (owned && skip?.has(owned)) return;   // a running automation owns it: a move never snaps it back
      param.rampTo(v, RAMP, at);
    };
    set(masterVol.volume as unknown as Settable, m.volume ?? 0, "volume");
    set(masterEq.low as unknown as Settable, m.eq?.low ?? 0); set(masterEq.mid as unknown as Settable, m.eq?.mid ?? 0); set(masterEq.high as unknown as Settable, m.eq?.high ?? 0);
    set(masterFilter.frequency as unknown as Settable, m.filter?.cutoff ?? 20000, "filter.cutoff");
    if (masterFilter.type !== (m.filter?.type ?? "lowpass")) masterFilter.type = m.filter?.type ?? "lowpass";
    set(comp.threshold as unknown as Settable, m.compThreshold ?? -20);
    set(makeup.volume as unknown as Settable, m.makeup ?? DEFAULT_MAKEUP);
    set(limiter.threshold as unknown as Settable, (m.limiter ?? -1) - LIMIT_UNDER);
  };

  type Sig = { cancelAndHoldAtTime: (t: number) => unknown; linearRampToValueAtTime: (v: number, t: number) => unknown; exponentialRampToValueAtTime: (v: number, t: number) => unknown };
  const sigOf = (param: AutoParam): Sig | null =>
    param === "filter.cutoff" ? masterFilter.frequency as unknown as Sig : param === "volume" ? masterVol.volume as unknown as Sig : param === "filter.q" ? masterFilter.Q as unknown as Sig : null;
  // A sweep starts from wherever the parameter is and reaches its written start in five milliseconds: never a step.
  const automate: Board["automate"] = (param, from, to, t0, t1, curve) => {
    const sig = sigOf(param); if (!sig) return;
    sig.cancelAndHoldAtTime(t0); sig.linearRampToValueAtTime(from, t0 + EDGE);
    const end = Math.max(t1, t0 + 2 * EDGE);
    if (param === "filter.cutoff" && curve !== "linear" && from > 0 && to > 0) sig.exponentialRampToValueAtTime(to, end); else sig.linearRampToValueAtTime(to, end);
  };
  const toBase: Board["toBase"] = (param, at, m) => {
    const sig = sigOf(param); if (!sig) return;
    const v = param === "volume" ? m.volume ?? 0 : param === "filter.cutoff" ? m.filter?.cutoff ?? 20000 : 1;
    const t0 = Math.max(masterVol.context.currentTime, at - EDGE);
    sig.cancelAndHoldAtTime(t0); sig.linearRampToValueAtTime(v, Math.max(t0 + 0.001, at));
  };

  const talk = (on: boolean, now = false) => {
    const db = on ? TALK_DB : 0;
    if (now) music.volume.value = db; else music.volume.rampTo(db, on ? 0.12 : 0.35);
  };
  const fadeOut = (seconds: number) => { const g = out.gain; const t = out.immediate(); g.cancelScheduledValues(t); g.setValueAtTime(g.getValueAtTime(t), t); g.linearRampToValueAtTime(0, t + seconds); };

  const nodes: { dispose: () => void }[] = [masterVol, masterEq, masterFilter, comp, makeup, limiter, prescale, clipper, out, gap, music, duck, reverb, riserGain, fft, meter, ...(wave ? [wave] : [])];
  return {
    buses: { master, music, duck, reverb },
    duck,
    gap,
    ceilingIn: prescale,
    analysis: { fft, meter, wave, tracks: new Map() },
    riser,
    talk,
    fadeOut,
    applyMaster,
    automate,
    toBase,
    dispose: () => { for (const n of [...nodes, ...risers.flatMap((r) => [r.synth, r.hp])]) { try { n.dispose(); } catch { /* already gone */ } } },
  };
}
