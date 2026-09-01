// One voice per track: the instrument, its insert chain, sends, and the
// automation surface. Ableton's device chain, radically simplified.
import * as Tone from "tone";
import type { Track, Note, Role, AutoParam, SynthParams, Wave } from "../song/types";
import type { Kit, KitSound } from "./kits";

export type Voice = {
  trigger: (n: Note, time: number, bpm: number) => void;
  automate: (param: AutoParam, from: number, to: number, t0: number, t1: number, curve?: "linear" | "exp") => boolean;
  gate: Tone.Gain;
  dispose: () => void;
};

export type Buses = { master: Tone.ToneAudioNode; duck: Tone.ToneAudioNode; reverb: Tone.ToneAudioNode };

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const REV_WET: Partial<Record<Role, number>> = { clap: 0.14, snare: 0.1, stab: 0.2, pad: 0.32, chords: 0.22, lead: 0.16, openhat: 0.07, perc: 0.08, arp: 0.15, pluck: 0.12, fx: 0.3, audio: 0.1 };
const ROLE_CUTOFF: Partial<Record<Role, number>> = { pad: 1100, chords: 2400, stab: 3200, lead: 6000, pluck: 5000, arp: 4500, fx: 8000 };

function oscOf(p: SynthParams | undefined, fallback: Wave): Tone.OmniOscillatorOptions {
  const wave = p?.wave ?? fallback;
  const fat = wave.startsWith("fat");
  const base: Record<string, unknown> = { type: wave };
  if (fat) { base.count = Math.max(1, Math.min(4, p?.unison ?? 2)); base.spread = p?.spread ?? 18; }
  return base as unknown as Tone.OmniOscillatorOptions;
}

export function makeVoice(track: Track, buses: Buses, clip?: AudioBuffer, kit?: Kit): Voice {
  const { role } = track;
  const p = track.synth ?? {};
  const fx = track.fx ?? {};
  const disp: { dispose: () => void }[] = [];
  const dest = track.duck ? buses.duck : buses.master;

  // Insert chain (built back to front): filter -> drive -> crush -> eq -> delay -> pan -> width -> volume.
  const volume = new Tone.Volume(track.volume).connect(dest); disp.push(volume);
  let head: Tone.ToneAudioNode = volume;
  if (typeof fx.width === "number") { const w = new Tone.StereoWidener(fx.width); w.connect(head); head = w; disp.push(w); }
  const panner = new Tone.Panner(fx.pan ?? 0); panner.connect(head); head = panner; disp.push(panner);
  let delay: Tone.FeedbackDelay | null = null;
  if (fx.delay && fx.delay.wet > 0) {
    delay = new Tone.FeedbackDelay(fx.delay.time, Math.min(0.9, fx.delay.feedback)); delay.wet.value = fx.delay.wet;
    delay.connect(head); head = delay; disp.push(delay);
  }
  if (fx.eq) { const eq = new Tone.EQ3(fx.eq.low, fx.eq.mid, fx.eq.high); eq.connect(head); head = eq; disp.push(eq); }
  if (fx.comp) { const c = new Tone.Compressor(fx.comp.threshold, fx.comp.ratio); c.connect(head); head = c; disp.push(c); }
  if (fx.crush && fx.crush > 0) { const b = new Tone.BitCrusher(Math.max(4, Math.min(12, fx.crush))); b.connect(head); head = b; disp.push(b); }
  const driveAmt = fx.drive ?? (role === "bass" ? 0.25 : role === "stab" ? 0.12 : 0);
  let drive: Tone.Distortion | null = null;
  if (driveAmt > 0) { drive = new Tone.Distortion(Math.min(1, driveAmt)); drive.connect(head); head = drive; disp.push(drive); }
  const cutoff = fx.filter?.cutoff ?? p.cutoff ?? ROLE_CUTOFF[role] ?? 20000;
  const filter = new Tone.Filter(cutoff, fx.filter?.type ?? "lowpass"); filter.Q.value = fx.filter?.q ?? p.resonance ?? 0.7;
  filter.connect(head); head = filter; disp.push(filter);
  const gate = new Tone.Gain(1); gate.connect(head); head = gate; disp.push(gate);

  const revAmt = fx.reverb ?? REV_WET[role] ?? 0;
  let send: Tone.Gain | null = null;
  if (revAmt > 0) { send = new Tone.Gain(revAmt); volume.connect(send); send.connect(buses.reverb); disp.push(send); }

  const vel = (n: Note) => Math.min(1, n[3] / 127);
  const durSec = (n: Note, bpm: number) => Math.max(0.05, n[2] * (60 / bpm));
  const oct = (p.octave ?? 0) * 12;
  const env = (d: { attack: number; decay: number; sustain: number; release: number }) => ({
    attack: p.attack ?? d.attack, decay: p.decay ?? d.decay, sustain: p.sustain ?? d.sustain, release: p.release ?? d.release,
  });

  let trigger: Voice["trigger"];
  const kitSound: KitSound | null = ["kick", "clap", "snare", "hat", "openhat", "perc"].includes(role) ? (role as KitSound) : null;
  if (kit && kitSound && !p.wave) {
    // Sampled drums: one Player per voice, velocity to gain, tune to rate, optional decay shaping.
    const player = new Tone.Player(kit[kitSound]);
    const decayGain = new Tone.Gain(1);
    player.connect(decayGain); decayGain.connect(head); disp.push(player, decayGain);
    const rate = Math.pow(2, (p.drumTune ?? 0) / 12);
    const dec = p.drumDecay;
    trigger = (n, t) => {
      player.playbackRate = rate;
      player.volume.value = 20 * Math.log10(Math.max(0.03, vel(n)));
      if (dec) { decayGain.gain.cancelScheduledValues(t); decayGain.gain.setValueAtTime(1, t); decayGain.gain.exponentialRampToValueAtTime(0.001, t + dec); }
      try { player.start(t); } catch { /* overlapping start */ }
    };
    return { trigger, automate: makeAutomate(), gate, dispose: () => disp.forEach((d) => d.dispose()) };
  }
  switch (role) {
    case "kick": {
      const tune = 48 * Math.pow(2, (p.drumTune ?? 0) / 12);
      const body = new Tone.MembraneSynth({ pitchDecay: 0.035, octaves: 5.5, oscillator: { type: "sine" }, envelope: { attack: 0.001, decay: p.drumDecay ?? 0.32, sustain: 0 } }).connect(head);
      const click = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.02, sustain: 0 } });
      const clickHp = new Tone.Filter(3000, "highpass").connect(head); click.connect(clickHp);
      disp.push(body, click, clickHp);
      trigger = (n, t) => { body.triggerAttackRelease(tune, (p.drumDecay ?? 0.32) + 0.05, t, vel(n)); click.triggerAttackRelease(0.02, t, vel(n) * 0.5); };
      break;
    }
    case "clap": {
      const s = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.001, decay: p.drumDecay ?? 0.16, sustain: 0 } });
      const bp = new Tone.Filter(1900, "bandpass"); bp.Q.value = 0.6;
      const air = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.08, sustain: 0 } });
      const airHp = new Tone.Filter(5000, "highpass");
      s.connect(bp); bp.connect(head); air.connect(airHp); airHp.connect(head); disp.push(s, bp, air, airHp);
      trigger = (n, t) => { s.triggerAttackRelease(0.14, t, vel(n)); s.triggerAttackRelease(0.1, t + 0.012, vel(n) * 0.7); air.triggerAttackRelease(0.08, t + 0.004, vel(n) * 0.35); };
      break;
    }
    case "snare": case "perc": {
      const dec = p.drumDecay ?? (role === "perc" ? 0.09 : 0.18);
      const s = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: dec, sustain: 0 } });
      const bp = new Tone.Filter(role === "perc" ? 4200 : 2400, "bandpass"); bp.Q.value = role === "perc" ? 1.2 : 0.7;
      const tone = new Tone.Synth({ oscillator: { type: "triangle" }, envelope: { attack: 0.001, decay: dec * 0.7, sustain: 0, release: 0.01 } });
      s.connect(bp); bp.connect(head); tone.connect(head); disp.push(s, bp, tone);
      trigger = (n, t) => { s.triggerAttackRelease(dec, t, vel(n)); tone.triggerAttackRelease(role === "perc" ? 1400 : 190, dec * 0.7, t, vel(n) * (role === "perc" ? 0.25 : 0.4)); };
      break;
    }
    case "hat": case "openhat": {
      // Two noise layers: a sizzle above 7 kHz and a resonant metallic ring, so hats read as hats, not static.
      const dec = p.drumDecay ?? (role === "hat" ? 0.07 : 0.32);
      const sizzle = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: dec, sustain: 0, release: 0.02 } });
      const hp = new Tone.Filter(7000, "highpass");
      const ring = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: dec * 0.8, sustain: 0, release: 0.02 } });
      const bp = new Tone.Filter(8200 * Math.pow(2, (p.drumTune ?? 0) / 12), "bandpass"); bp.Q.value = 5;
      const ringVol = new Tone.Volume(3);
      sizzle.connect(hp); hp.connect(head); ring.connect(bp); bp.connect(ringVol); ringVol.connect(head); disp.push(sizzle, hp, ring, bp, ringVol);
      trigger = (n, t) => { sizzle.triggerAttackRelease(dec, t, vel(n)); ring.triggerAttackRelease(dec * 0.8, t, vel(n)); };
      break;
    }
    case "bass": {
      const s = new Tone.MonoSynth({
        oscillator: oscOf(p, "fatsawtooth"),
        filter: { type: "lowpass", Q: p.resonance ?? 3, rolloff: -24 },
        filterEnvelope: { attack: 0.004, decay: p.decay ?? 0.14, sustain: p.sustain ?? 0.35, release: 0.1, baseFrequency: p.cutoff ?? 140, octaves: p.envAmount ?? 2.6 },
        envelope: env({ attack: 0.004, decay: 0.18, sustain: 0.75, release: 0.04 }),
        portamento: p.glide ?? 0,
      }).connect(head); disp.push(s);
      trigger = (n, t, bpm) => s.triggerAttackRelease(midiToFreq(n[0] + oct), durSec(n, bpm), t, vel(n));
      break;
    }
    case "sub": {
      const s = new Tone.MonoSynth({ oscillator: { type: "sine" }, filter: { type: "lowpass", Q: 0.5 }, filterEnvelope: { baseFrequency: 400, octaves: 0 }, envelope: env({ attack: 0.006, decay: 0.25, sustain: 0.85, release: 0.05 }), portamento: p.glide ?? 0 }).connect(head); disp.push(s);
      trigger = (n, t, bpm) => s.triggerAttackRelease(midiToFreq(n[0] + oct), durSec(n, bpm), t, vel(n));
      break;
    }
    case "stab": {
      const s = new Tone.PolySynth(Tone.Synth, { oscillator: oscOf(p, "sawtooth"), envelope: env({ attack: 0.003, decay: 0.22, sustain: 0, release: 0.06 }) }).connect(head); disp.push(s);
      trigger = (n, t, bpm) => s.triggerAttackRelease(midiToFreq(n[0] + oct), durSec(n, bpm), t, vel(n));
      break;
    }
    case "chords": case "pad": {
      const s = new Tone.PolySynth(Tone.Synth, { oscillator: oscOf(p, "sawtooth"), envelope: env({ attack: role === "pad" ? 0.4 : 0.005, decay: 0.5, sustain: 0.65, release: 0.9 }) });
      const ch = new Tone.Chorus(0.6, 3.5, 0.4).start(); s.connect(ch); ch.connect(head); disp.push(s, ch);
      trigger = (n, t, bpm) => s.triggerAttackRelease(midiToFreq(n[0] + oct), durSec(n, bpm), t, vel(n) * 0.8);
      break;
    }
    case "audio": {
      const player = new Tone.Player(clip ?? undefined).connect(head);
      if (track.clip?.reverse) player.reverse = true;
      disp.push(player);
      trigger = (n, t) => {
        if (!clip) return;
        player.playbackRate = Math.pow(2, ((n[0] - 60) + (track.clip?.semitones ?? 0)) / 12);
        player.volume.value = (track.clip?.gainDb ?? 0) + 20 * Math.log10(Math.max(0.05, vel(n)));
        try { player.start(t, track.clip?.startSec ?? 0); } catch { /* buffer not ready */ }
      };
      break;
    }
    default: { // lead, pluck, arp, fx
      const s = new Tone.PolySynth(Tone.Synth, { oscillator: oscOf(p, role === "lead" ? "sawtooth" : "triangle"), envelope: env({ attack: 0.004, decay: 0.18, sustain: role === "lead" ? 0.4 : 0.15, release: 0.12 }) }).connect(head); disp.push(s);
      trigger = (n, t, bpm) => s.triggerAttackRelease(midiToFreq(n[0] + oct), durSec(n, bpm), t, vel(n));
    }
  }

  function makeAutomate(): Voice["automate"] { return automate; }
  const automate: Voice["automate"] = (param, from, to, t0, t1, curve) => {
    const ramp = (sig: Tone.Signal<"frequency"> | Tone.Signal<"decibels"> | Tone.Signal<"audioRange"> | Tone.Signal<"normalRange"> | Tone.Signal<"positive">, exp: boolean) => {
      sig.cancelScheduledValues(t0);
      sig.setValueAtTime(from, t0);
      if (exp && from > 0 && to > 0) sig.exponentialRampToValueAtTime(to, t1); else sig.linearRampToValueAtTime(to, t1);
      return true;
    };
    switch (param) {
      case "filter.cutoff": return ramp(filter.frequency as unknown as Tone.Signal<"frequency">, curve !== "linear");
      case "filter.q": return ramp(filter.Q as unknown as Tone.Signal<"positive">, false);
      case "volume": return ramp(volume.volume as unknown as Tone.Signal<"decibels">, false);
      case "pan": return ramp(panner.pan as unknown as Tone.Signal<"audioRange">, false);
      case "reverb": return send ? ramp(send.gain as unknown as Tone.Signal<"normalRange">, false) : false;
      case "delay.wet": return delay ? ramp(delay.wet as unknown as Tone.Signal<"normalRange">, false) : false;
      case "drive": if (drive) { drive.distortion = Math.min(1, Math.max(0, to)); return true; } return false;
      default: return false;
    }
  };

  return { trigger, automate, gate, dispose: () => disp.forEach((d) => d.dispose()) };
}
