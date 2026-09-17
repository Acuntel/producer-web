// The desk: the master chain, the buses, the riser, and the meters the eye reads.
// It is built once for a session and never torn down by a change, so a move by the
// producer is a ramp on a live desk rather than a new one. Every master number is
// rampable; the analysis taps sit on what actually leaves the master.
import * as Tone from "tone";
import type { Master, AutoParam } from "../song/types";

export type Analysis = { fft: Tone.FFT; meter: Tone.Meter; tracks: Map<string, Tone.Meter> };
export type Buses = { master: Tone.ToneAudioNode; duck: Tone.ToneAudioNode; reverb: Tone.ToneAudioNode };

export type Board = {
  buses: Buses;
  duck: Tone.Gain;
  analysis: Analysis;
  riser: { synth: Tone.NoiseSynth; hp: Tone.Filter };
  applyMaster: (m: Master, ramp: boolean) => void;
  automate: (param: AutoParam, from: number, to: number, t0: number, t1: number, curve?: "linear" | "exp") => void;
  dispose: () => void;
};

const RAMP = 0.05;

/** The desk, wired into `destination`. One per playing context (the live transport, or one offline render).
 *  An offline render has no eye on it, so it carries no analyser: those cost real time per block. */
export function makeBoard(destination?: Tone.ToneAudioNode, live = true): Board {
  const masterVol = new Tone.Volume(0);
  const masterEq = new Tone.EQ3(0, 0, 0);
  const masterFilter = new Tone.Filter(20000, "lowpass");
  const comp = new Tone.Compressor(-20, 3);
  const makeup = new Tone.Volume(6);
  const limiter = new Tone.Limiter(-1);
  // Final soft clipper: club-master glue, and a hard guarantee that nothing leaves above 0 dBFS.
  const clipper = new Tone.WaveShaper((x) => Math.tanh(x * 1.25) / Math.tanh(1.25), 4096);
  masterVol.connect(masterEq); masterEq.connect(masterFilter); masterFilter.connect(comp); comp.connect(makeup); makeup.connect(limiter); limiter.connect(clipper);
  if (destination) clipper.connect(destination); else clipper.toDestination();

  // The visible proof: a spectrum fine enough to draw on a log axis, and a stereo meter.
  const fft = new Tone.FFT({ size: live ? 1024 : 32, smoothing: 0.5 });
  const meter = new Tone.Meter({ channelCount: 2, smoothing: 0.8 });
  if (live) { clipper.connect(fft); clipper.connect(meter); }

  const master: Tone.ToneAudioNode = masterVol;
  const duck = new Tone.Gain(1).connect(master);
  const reverb = new Tone.Freeverb({ roomSize: 0.82, dampening: 2800 });
  reverb.wet.value = 1; reverb.connect(master);

  // Drop craft: one riser for the whole desk, swept by the schedule's riser part.
  const riserSynth = new Tone.NoiseSynth({ noise: { type: "white" } });
  const riserHp = new Tone.Filter(500, "highpass");
  const riserGain = new Tone.Gain(0.33);
  riserSynth.connect(riserHp); riserHp.connect(riserGain); riserGain.connect(master);

  const applyMaster = (m: Master, ramp: boolean) => {
    const set = (param: { value: number; rampTo: (v: number, t: number) => unknown }, v: number) => { if (ramp) param.rampTo(v, RAMP); else param.value = v; };
    set(masterVol.volume, m.volume ?? 0);
    set(masterEq.low, m.eq?.low ?? 0); set(masterEq.mid, m.eq?.mid ?? 0); set(masterEq.high, m.eq?.high ?? 0);
    set(masterFilter.frequency as unknown as { value: number; rampTo: (v: number, t: number) => unknown }, m.filter?.cutoff ?? 20000);
    if (masterFilter.type !== (m.filter?.type ?? "lowpass")) masterFilter.type = m.filter?.type ?? "lowpass";
    set(comp.threshold as unknown as { value: number; rampTo: (v: number, t: number) => unknown }, m.compThreshold ?? -20);
    set(makeup.volume, m.makeup ?? 6);
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

  const nodes: { dispose: () => void }[] = [masterVol, masterEq, masterFilter, comp, makeup, limiter, clipper, duck, reverb, riserSynth, riserHp, riserGain, fft, meter];
  return {
    buses: { master, duck, reverb },
    duck,
    analysis: { fft, meter, tracks: new Map() },
    riser: { synth: riserSynth, hp: riserHp },
    applyMaster,
    automate,
    dispose: () => { for (const n of nodes) { try { n.dispose(); } catch { /* already gone */ } } },
  };
}
