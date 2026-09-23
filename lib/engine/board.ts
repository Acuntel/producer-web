// The desk: the master chain, the buses, the riser, and the meters the eye reads.
// It is built once for a session and never torn down by a change, so a move by the
// producer is a ramp on a live desk rather than a new one. Every master number is
// rampable; the analysis taps sit on what actually leaves the master.
import * as Tone from "tone";
import type { Master, AutoParam } from "../song/types";
import { reverbImpulse } from "./context";

// meter = the smoothed level the bars show; wave = the raw samples, so PEAK is a real sample peak, not a held level.
export type Analysis = { fft: Tone.FFT; meter: Tone.Meter; wave: Tone.Analyser | null; tracks: Map<string, Tone.Meter> };
// `music` is where the record's voices, reverb and riser meet; the producer's talk-duck rides it, so an
// audition entering `master` goes through the whole master chain without being ducked with the record.
export type Buses = { master: Tone.ToneAudioNode; music: Tone.ToneAudioNode; duck: Tone.ToneAudioNode; reverb: Tone.ToneAudioNode };
export type Riser = { synth: Tone.NoiseSynth; hp: Tone.Filter };

export type Board = {
  buses: Buses;
  duck: Tone.Gain;
  analysis: Analysis;
  riser: (i: number) => Riser;
  talk: (on: boolean, now?: boolean) => void;
  fadeOut: (seconds: number) => void;
  applyMaster: (m: Master, ramp: boolean) => void;
  automate: (param: AutoParam, from: number, to: number, t0: number, t1: number, curve?: "linear" | "exp") => void;
  dispose: () => void;
};

const RAMP = 0.05;
const TALK_DB = -7;   // how far the record steps back while the producer speaks
// The desk's ceiling: -1 dBFS, so the record never reaches full scale and the producer's voice has room on top.
const CEILING = Math.pow(10, -1 / 20);
// Post-compressor gain when a record names none. It was +6 into a clipper that added 3.4 dB of its own, which
// drove every record into saturation (about -5.5 LUFS): the crackle. +5 into a transparent ceiling lands the
// seed at about -9.5 LUFS, inside the -10 to -7 the mix step asks for (+3 measured -11.5).
export const DEFAULT_MAKEUP = 5;

/** The desk, wired into `destination`. One per playing context (the live transport, or one offline render).
 *  An offline render has no eye on it, so it carries no analyser: those cost real time per block. */
export function makeBoard(destination?: Tone.ToneAudioNode, live = true): Board {
  const masterVol = new Tone.Volume(0);
  const masterEq = new Tone.EQ3(0, 0, 0);
  const masterFilter = new Tone.Filter(20000, "lowpass");
  const comp = new Tone.Compressor(-20, 3);
  const makeup = new Tone.Volume(DEFAULT_MAKEUP);
  const limiter = new Tone.Limiter(-1);
  // Final soft ceiling: unity gain for anything below it (x stays x), bending smoothly into -1 dBFS, so
  // nothing leaves above it and nothing below it is coloured. The old curve, tanh(1.25x) / tanh(1.25),
  // added 3.4 dB and saturated the whole record.
  const clipper = new Tone.WaveShaper((x) => CEILING * Math.tanh(x / CEILING), 4096);
  // The last gain on the desk: stop fades it down before the rig is torn down, so a tail is faded, not cut.
  const out = new Tone.Gain(1);
  masterVol.connect(masterEq); masterEq.connect(masterFilter); masterFilter.connect(comp); comp.connect(makeup); makeup.connect(limiter); limiter.connect(clipper); clipper.connect(out);
  if (destination) out.connect(destination); else out.toDestination();

  // The visible proof: a spectrum fine enough to draw on a log axis, and a stereo meter.
  const fft = new Tone.FFT({ size: live ? 1024 : 32, smoothing: 0.5 });
  const meter = new Tone.Meter({ channelCount: 2, smoothing: 0.8 });
  const wave = live ? new Tone.Analyser({ type: "waveform", size: 1024, channels: 2 }) : null;
  if (live) { clipper.connect(fft); clipper.connect(meter); clipper.connect(wave!); }

  const master: Tone.ToneAudioNode = masterVol;
  const music = new Tone.Volume(0).connect(master);
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

  const applyMaster = (m: Master, ramp: boolean) => {
    const set = (param: { value: number; rampTo: (v: number, t: number) => unknown }, v: number) => { if (ramp) param.rampTo(v, RAMP); else param.value = v; };
    set(masterVol.volume, m.volume ?? 0);
    set(masterEq.low, m.eq?.low ?? 0); set(masterEq.mid, m.eq?.mid ?? 0); set(masterEq.high, m.eq?.high ?? 0);
    set(masterFilter.frequency as unknown as { value: number; rampTo: (v: number, t: number) => unknown }, m.filter?.cutoff ?? 20000);
    if (masterFilter.type !== (m.filter?.type ?? "lowpass")) masterFilter.type = m.filter?.type ?? "lowpass";
    set(comp.threshold as unknown as { value: number; rampTo: (v: number, t: number) => unknown }, m.compThreshold ?? -20);
    set(makeup.volume, m.makeup ?? DEFAULT_MAKEUP);
    set(limiter.threshold as unknown as { value: number; rampTo: (v: number, t: number) => unknown }, m.limiter ?? -1);
  };

  const automate: Board["automate"] = (param, from, to, t0, t1, curve) => {
    const ramp = (sig: { cancelScheduledValues: (t: number) => unknown; setValueAtTime: (v: number, t: number) => unknown; linearRampToValueAtTime: (v: number, t: number) => unknown; exponentialRampToValueAtTime: (v: number, t: number) => unknown }, exp: boolean) => {
      sig.cancelScheduledValues(t0); sig.setValueAtTime(from, t0);
      if (exp && from > 0 && to > 0) sig.exponentialRampToValueAtTime(to, t1); else sig.linearRampToValueAtTime(to, t1);
    };
    if (param === "filter.cutoff") ramp(masterFilter.frequency, curve !== "linear");
    else if (param === "volume") ramp(masterVol.volume, false);
    else if (param === "filter.q") ramp(masterFilter.Q, false);
  };

  const talk = (on: boolean, now = false) => {
    const db = on ? TALK_DB : 0;
    if (now) music.volume.value = db; else music.volume.rampTo(db, on ? 0.12 : 0.35);
  };
  const fadeOut = (seconds: number) => { const g = out.gain; const t = out.immediate(); g.cancelScheduledValues(t); g.setValueAtTime(g.getValueAtTime(t), t); g.linearRampToValueAtTime(0, t + seconds); };

  const nodes: { dispose: () => void }[] = [masterVol, masterEq, masterFilter, comp, makeup, limiter, clipper, out, music, duck, reverb, riserGain, fft, meter, ...(wave ? [wave] : [])];
  return {
    buses: { master, music, duck, reverb },
    duck,
    analysis: { fft, meter, wave, tracks: new Map() },
    riser,
    talk,
    fadeOut,
    applyMaster,
    automate,
    dispose: () => { for (const n of [...nodes, ...risers.flatMap((r) => [r.synth, r.hp])]) { try { n.dispose(); } catch { /* already gone */ } } },
  };
}
