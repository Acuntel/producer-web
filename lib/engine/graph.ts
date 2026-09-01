// Build the whole studio for one context: master chain, buses, voices, parts,
// automation, clips, drop craft (riser, silence gap), the pump.
import * as Tone from "tone";
import type { Song, AutoParam } from "../song/types";
import { scheduleEvents, type Ev, type Schedule } from "./schedule";
import { makeVoice, type Voice } from "./voices";
import type { Kit } from "./kits";

export type Clips = Map<string, AudioBuffer>;
export type Graph = { parts: Tone.Part[]; voices: Voice[]; nodes: { dispose: () => void }[]; schedule: Schedule };

type Transport = ReturnType<typeof Tone.getTransport>;

export function buildGraph(song: Song, transport: Transport, clips: Clips = new Map(), kit?: Kit): Graph {
  const m = song.master ?? {};
  const masterVol = new Tone.Volume(m.volume ?? 0);
  const masterEq = new Tone.EQ3(m.eq?.low ?? 0, m.eq?.mid ?? 0, m.eq?.high ?? 0);
  const masterFilter = new Tone.Filter(m.filter?.cutoff ?? 20000, m.filter?.type ?? "lowpass");
  const comp = new Tone.Compressor(m.compThreshold ?? -20, 3);
  const makeup = new Tone.Volume(m.makeup ?? 6);
  const limiter = new Tone.Limiter(m.limiter ?? -1);
  // Final soft clipper: club-master glue, and a hard guarantee that nothing leaves above 0 dBFS.
  const clipper = new Tone.WaveShaper((x) => Math.tanh(x * 1.25) / Math.tanh(1.25), 4096);
  masterVol.connect(masterEq); masterEq.connect(masterFilter); masterFilter.connect(comp); comp.connect(makeup); makeup.connect(limiter); limiter.connect(clipper); clipper.toDestination();
  const master: Tone.ToneAudioNode = masterVol;
  const duck = new Tone.Gain(1).connect(master);
  const reverb = new Tone.Freeverb({ roomSize: 0.82, dampening: 2800 });
  reverb.wet.value = 1; reverb.connect(master);
  const buses = { master, duck, reverb };

  const schedule = scheduleEvents(song);
  const { perTrack, kickBeats, sectionStarts, automation, clipSpans } = schedule;
  const ppq = transport.PPQ;
  const tick = (beat: number) => `${Math.max(0, Math.round(beat * ppq))}i`;
  const beatSec = 60 / song.bpm;
  const parts: Tone.Part[] = [];
  const voices: Voice[] = [];
  const voiceByTrack = new Map<string, Voice>();

  for (const tr of song.tracks) {
    const evs = perTrack.get(tr.id);
    const spans = clipSpans.filter((c) => c.trackId === tr.id);
    if ((!evs || evs.length === 0) && spans.length === 0) continue;
    const buf = tr.clip ? clips.get(tr.clip.clipId) : undefined;
    const voice = makeVoice(tr, buses, buf, kit);
    voices.push(voice); voiceByTrack.set(tr.id, voice);
    if (evs && evs.length) {
      // Tone sources demand strictly increasing start times per voice: nudge exact collisions by 1 ms.
      let lastTime = -1;
      const part = new Tone.Part((time, ev: Ev) => { const t = time <= lastTime ? lastTime + 0.001 : time; lastTime = t; voice.trigger(ev.note, t, song.bpm); }, evs.map((e) => [tick(e.beat), e] as [string, Ev]));
      part.start(0); parts.push(part);
    }
    // Warped audio loops: a GrainPlayer per active span, stretched to the song tempo.
    if (spans.length && buf && tr.clip) {
      const c = tr.clip;
      const rate = c.warp !== false && c.bpm ? song.bpm / c.bpm : 1;
      const gp = new Tone.GrainPlayer({ url: buf, loop: true, playbackRate: rate, detune: (c.semitones ?? 0) * 100, grainSize: 0.12, overlap: 0.05, loopStart: c.startSec ?? 0 });
      gp.volume.value = c.gainDb ?? 0;
      if (c.lengthBeats) gp.loopEnd = (c.startSec ?? 0) + (c.lengthBeats * beatSec) / rate;
      gp.connect(voice.gate);
      const spanPart = new Tone.Part((time, s: { beats: number }) => { try { gp.start(time, c.startSec ?? 0, s.beats * beatSec); } catch { /* not loaded */ } }, spans.map((s) => [tick(s.startBeat), s] as [string, { beats: number }]));
      spanPart.start(0); parts.push(spanPart);
      voices.push({ trigger: () => {}, automate: () => false, gate: voice.gate, dispose: () => gp.dispose() });
    }
    // Trance gate: chop the track at N sixteenths.
    if (tr.fx?.gate && tr.fx.gate > 0) {
      const step = (tr.fx.gate / 4);
      const total = schedule.totalBeats;
      const gateEvs: [string, number][] = [];
      for (let b = 0; b < total; b += step) gateEvs.push([tick(b), b]);
      const gatePart = new Tone.Part((time) => {
        voice.gate.gain.cancelScheduledValues(time);
        voice.gate.gain.setValueAtTime(1, time);
        voice.gate.gain.setValueAtTime(0.02, time + step * beatSec * 0.55);
      }, gateEvs);
      gatePart.start(0); parts.push(gatePart);
    }
  }

  // Automation ramps, scheduled against the transport timeline.
  const masterAutomate = (param: AutoParam, from: number, to: number, t0: number, t1: number, curve?: "linear" | "exp") => {
    const ramp = (sig: { cancelScheduledValues: (t: number) => unknown; setValueAtTime: (v: number, t: number) => unknown; linearRampToValueAtTime: (v: number, t: number) => unknown; exponentialRampToValueAtTime: (v: number, t: number) => unknown }, exp: boolean) => {
      sig.cancelScheduledValues(t0); sig.setValueAtTime(from, t0);
      if (exp && from > 0 && to > 0) sig.exponentialRampToValueAtTime(to, t1); else sig.linearRampToValueAtTime(to, t1);
    };
    if (param === "filter.cutoff") ramp(masterFilter.frequency, curve !== "linear");
    else if (param === "volume") ramp(masterVol.volume, false);
    else if (param === "filter.q") ramp(masterFilter.Q, false);
  };
  if (automation.length) {
    const autoPart = new Tone.Part((time, a: Schedule["automation"][number]) => {
      const dur = (a.endBeat - a.startBeat) * beatSec;
      if (a.track === "master") masterAutomate(a.param, a.from, a.to, time, time + dur, a.curve);
      else voiceByTrack.get(a.track)?.automate(a.param, a.from, a.to, time, time + dur, a.curve);
    }, automation.map((a) => [tick(a.startBeat), a] as [string, Schedule["automation"][number]]));
    autoPart.start(0); parts.push(autoPart);
  }

  // Drop craft: "cut" and "riser" sections get a white-noise riser through the final bars.
  const riserSynth = new Tone.NoiseSynth({ noise: { type: "white" } });
  const riserHp = new Tone.Filter(500, "highpass");
  const riserGain = new Tone.Gain(0.33);
  riserSynth.connect(riserHp); riserHp.connect(riserGain); riserGain.connect(master);
  const riserEvents: [string, number][] = [];
  for (const s of sectionStarts) {
    if (s.fill !== "cut" && s.fill !== "riser") continue;
    const lenBeats = Math.min(16, s.beats);
    riserEvents.push([tick(s.startBeat + s.beats - lenBeats - (s.fill === "cut" ? 0.5 : 0)), lenBeats]);
  }
  if (riserEvents.length) {
    const riserPart = new Tone.Part((time, lenBeats: number) => {
      const len = lenBeats * beatSec;
      riserSynth.envelope.attack = Math.max(0.1, len - 0.15); riserSynth.envelope.decay = 0.1; riserSynth.envelope.sustain = 0;
      riserHp.frequency.setValueAtTime(500, time); riserHp.frequency.exponentialRampToValueAtTime(7000, time + len);
      riserSynth.triggerAttackRelease(len, time, 0.85);
    }, riserEvents);
    riserPart.start(0); parts.push(riserPart);
  }

  // The pump: duck the bus at every kick.
  const duckPart = new Tone.Part((time) => {
    duck.gain.cancelScheduledValues(time);
    duck.gain.setValueAtTime(1, time);
    duck.gain.linearRampToValueAtTime(0.38, time + 0.015);
    duck.gain.linearRampToValueAtTime(1, time + Math.min(0.26, beatSec * 0.55));
  }, kickBeats.map((b) => [tick(b), b] as [string, number]));
  duckPart.start(0); parts.push(duckPart);

  transport.bpm.value = song.bpm;
  const nodes = [masterVol, masterEq, masterFilter, comp, makeup, limiter, clipper, duck, reverb, riserSynth, riserHp, riserGain];
  return { parts, voices, nodes, schedule };
}
