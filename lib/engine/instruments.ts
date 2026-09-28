// The synthesized instruments: drums built from noise and membranes when no kit sound is loaded,
// basses, keys, pads and leads. Each is built once per voice into its insert chain (`head`) and
// returns the trigger the rig calls with an explicit audio time.
import * as Tone from "tone";
import type { Note, Role, SynthParams, Wave } from "../song/types";

export type Trigger = (n: Note, time: number, bpm: number) => void;
type Env = { attack: number; decay: number; sustain: number; release: number };

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const ROLE_WAVE: Partial<Record<Role, Wave>> = { pad: "fatsawtooth", chords: "fatsawtooth", stab: "fatsawtooth", lead: "fatsawtooth", arp: "sawtooth", pluck: "triangle" };
const ROLE_UNISON: Partial<Record<Role, [number, number]>> = { pad: [3, 26], chords: [2, 14], stab: [2, 12], lead: [2, 10] };

function oscOf(p: SynthParams | undefined, fallback: Wave, unison?: [number, number]): Tone.OmniOscillatorOptions {
  let wave = p?.wave ?? fallback;
  if (wave === "epiano" || wave === "organ") wave = "sine";
  const fat = wave.startsWith("fat");
  const base: Record<string, unknown> = { type: wave };
  if (fat) { base.count = Math.max(1, Math.min(4, p?.unison ?? unison?.[0] ?? 2)); base.spread = p?.spread ?? unison?.[1] ?? 18; }
  return base as unknown as Tone.OmniOscillatorOptions;
}

// Keyboard voices: an FM electric piano and a drawbar-ish organ, for piano-house and rave chords.
function keyboardVoice(kind: "epiano" | "organ", p: SynthParams, envOf: (d: { attack: number; decay: number; sustain: number; release: number }) => { attack: number; decay: number; sustain: number; release: number }) {
  if (kind === "epiano") return new Tone.PolySynth(Tone.FMSynth, { harmonicity: 3.01, modulationIndex: 11, oscillator: { type: "sine" }, modulation: { type: "sine" }, envelope: envOf({ attack: 0.004, decay: 0.9, sustain: 0.12, release: 0.6 }), modulationEnvelope: { attack: 0.002, decay: 0.25, sustain: 0.05, release: 0.3 } });
  return new Tone.PolySynth(Tone.AMSynth, { harmonicity: 2, oscillator: { type: "sine" }, modulation: { type: "square" }, envelope: envOf({ attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.12 }), modulationEnvelope: { attack: 0.01, decay: 0.1, sustain: 1, release: 0.1 } });
}

/** The synthesized instrument for a role, wired into `head`; every node it builds goes on `disp`. */
export function synthVoice(role: Role, p: SynthParams, head: Tone.ToneAudioNode, disp: { dispose: () => void }[]): Trigger {
  const vel = (n: Note) => Math.min(1, n[3] / 127);
  const durSec = (n: Note, bpm: number) => Math.max(0.05, n[2] * (60 / bpm));
  const oct = (p.octave ?? 0) * 12;
  const env = (d: Env): Env => ({ attack: p.attack ?? d.attack, decay: p.decay ?? d.decay, sustain: p.sustain ?? d.sustain, release: p.release ?? d.release });
  let trigger: Trigger;
  switch (role) {
    case "kick": {
      const tune0 = 48 * Math.pow(2, (p.drumTune ?? 0) / 12);
      const body = new Tone.MembraneSynth({ pitchDecay: 0.035, octaves: 5.5, oscillator: { type: "sine" }, envelope: { attack: 0.001, decay: p.drumDecay ?? 0.32, sustain: 0 } }).connect(head);
      const click = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.02, sustain: 0 } });
      const clickHp = new Tone.Filter(3000, "highpass").connect(head); click.connect(clickHp);
      disp.push(body, click, clickHp);
      trigger = (n, t) => { body.triggerAttackRelease(tune0, (p.drumDecay ?? 0.32) + 0.05, t, vel(n)); click.triggerAttackRelease(0.02, t, vel(n) * 0.5); };
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
      const s = p.wave === "epiano" || p.wave === "organ" ? keyboardVoice(p.wave, p, env) : new Tone.PolySynth(Tone.Synth, { oscillator: oscOf(p, ROLE_WAVE.stab ?? "sawtooth", ROLE_UNISON.stab), envelope: env({ attack: 0.003, decay: 0.24, sustain: 0, release: 0.08 }) });
      s.connect(head); disp.push(s);
      trigger = (n, t, bpm) => s.triggerAttackRelease(midiToFreq(n[0] + oct), durSec(n, bpm), t, vel(n));
      break;
    }
    case "chords": case "pad": {
      const s = p.wave === "epiano" || p.wave === "organ" ? keyboardVoice(p.wave, p, env) : new Tone.PolySynth(Tone.Synth, { oscillator: oscOf(p, ROLE_WAVE[role] ?? "sawtooth", ROLE_UNISON[role]), envelope: env({ attack: role === "pad" ? 0.4 : 0.005, decay: 0.5, sustain: 0.65, release: 0.9 }) });
      const ch = new Tone.Chorus(0.6, 3.5, 0.4).start(); s.connect(ch); ch.connect(head); disp.push(s, ch);
      // A quiet sub-octave sine under chords gives the mids a floor without mud.
      const body = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sine" }, envelope: env({ attack: role === "pad" ? 0.4 : 0.005, decay: 0.5, sustain: 0.65, release: 0.9 }) });
      const bodyVol = new Tone.Volume(-14); body.connect(bodyVol); bodyVol.connect(head); disp.push(body, bodyVol);
      trigger = (n, t, bpm) => { s.triggerAttackRelease(midiToFreq(n[0] + oct), durSec(n, bpm), t, vel(n) * 0.8); if (n[0] + oct >= 52) body.triggerAttackRelease(midiToFreq(n[0] + oct - 12), durSec(n, bpm), t, vel(n) * 0.5); };
      break;
    }
    default: { // lead, pluck, arp, fx
      const s = p.wave === "epiano" || p.wave === "organ" ? keyboardVoice(p.wave, p, env) : new Tone.PolySynth(Tone.Synth, { oscillator: oscOf(p, ROLE_WAVE[role] ?? "triangle", ROLE_UNISON[role]), envelope: env({ attack: 0.004, decay: 0.18, sustain: role === "lead" ? 0.4 : 0.15, release: 0.12 }) });
      s.connect(head); disp.push(s);
      trigger = (n, t, bpm) => s.triggerAttackRelease(midiToFreq(n[0] + oct), durSec(n, bpm), t, vel(n));
    }
  }

  return trigger;
}
