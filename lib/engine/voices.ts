// One voice per track: the instrument, its insert chain, sends, and the
// automation surface. Ableton's device chain, radically simplified.
//
// A voice outlives a change. Everything the producer usually moves (volume, pan,
// cutoff, resonance, reverb, delay, drive, crush, width) ramps in place through
// `tune`, and only a change of instrument (role, synth shape, clip, kit) builds a
// new voice. `voiceSignature` is what decides that, and `tune` also puts every
// automatable parameter back to the written value before a new schedule is laid down.
import * as Tone from "tone";
import type { Track, Note, Role, AutoParam, SynthParams, Wave } from "../song/types";
import type { Kit, KitSound } from "./kits";

export type Voice = {
  trigger: (n: Note, time: number, bpm: number) => void;
  automate: (param: AutoParam, from: number, to: number, t0: number, t1: number, curve?: "linear" | "exp") => boolean;
  gate: Tone.Gain;
  out: Tone.ToneAudioNode;   // post-fader output, for meters
  setVolume: (db: number) => void;   // live fader moves, no rebuild
  tune: (track: Track) => void;      // the track's rampable values, ramped in place
  dispose: () => void;
};

export type Buses = { master: Tone.ToneAudioNode; duck: Tone.ToneAudioNode; reverb: Tone.ToneAudioNode };

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const REV_WET: Partial<Record<Role, number>> = { clap: 0.14, snare: 0.1, stab: 0.2, pad: 0.32, chords: 0.22, lead: 0.16, openhat: 0.07, perc: 0.08, arp: 0.15, pluck: 0.12, fx: 0.3, audio: 0.1 };
const ROLE_CUTOFF: Partial<Record<Role, number>> = { pad: 2400, chords: 3600, stab: 4800, lead: 6500, pluck: 5200, arp: 5000, fx: 8000 };
// Gain staging: measured solo LUFS in the drop with seed volumes, targeted at record levels relative to the kick.
const ROLE_TRIM: Partial<Record<Role, number>> = { kick: -2.5, clap: 2, snare: 3, hat: 5, openhat: 4, perc: 4, bass: 3, sub: -3, stab: 7, chords: 7, pad: 8, lead: 6, pluck: 6, arp: 6, fx: 4, audio: 3 };
const ROLE_WAVE: Partial<Record<Role, Wave>> = { pad: "fatsawtooth", chords: "fatsawtooth", stab: "fatsawtooth", lead: "fatsawtooth", arp: "sawtooth", pluck: "triangle" };
const ROLE_UNISON: Partial<Record<Role, [number, number]>> = { pad: [3, 26], chords: [2, 14], stab: [2, 12], lead: [2, 10] };
const DRUM_ROLES: Role[] = ["kick", "clap", "snare", "hat", "openhat", "perc"];

const RAMP = 0.04;   // a parameter move the ear reads as instant but never hears as a click

// What the track's own numbers say each rampable parameter should be right now.
function baseOf(track: Track) {
  const p = track.synth ?? {}; const fx = track.fx ?? {};
  return {
    cutoff: fx.filter?.cutoff ?? p.cutoff ?? ROLE_CUTOFF[track.role] ?? 20000,
    q: fx.filter?.q ?? p.resonance ?? 0.7,
    volume: track.volume + (ROLE_TRIM[track.role] ?? 0),
    pan: fx.pan ?? 0,
    width: fx.width ?? 0.5,
    reverb: fx.reverb ?? REV_WET[track.role] ?? 0,
    delayWet: fx.delay?.wet ?? 0,
    delayTime: fx.delay?.time ?? "8n",
    delayFeedback: Math.min(0.9, fx.delay?.feedback ?? 0.2),
    drive: fx.drive ?? (track.role === "bass" ? 0.25 : track.role === "stab" ? 0.12 : 0),
    crush: fx.crush ?? 0,
    drumTune: p.drumTune ?? 0,
    drumDecay: p.drumDecay,
  };
}

/** What makes this a different instrument. Same signature, same voice: the change ramps instead of rebuilding. */
export function voiceSignature(track: Track, ctx?: { kitId?: string; bpm?: number }): string {
  const p = track.synth ?? {}; const fx = track.fx ?? {}; const c = track.clip;
  const sampled = DRUM_ROLES.includes(track.role) || track.role === "audio";
  return JSON.stringify([
    track.role,
    // A sampled voice plays a buffer, so tuning and decay are per hit and never rebuild it;
    // a synthesized one bakes them into its envelopes.
    sampled ? { wave: p.wave, octave: p.octave } : p,
    c ? [c.clipId, c.sampleId, c.semitones, c.reverse, c.startSec, c.oneShot, c.warp, c.bpm, c.lengthBeats, c.warp !== false && c.bpm ? ctx?.bpm : 0] : null,
    !!track.duck,
    fx.filter?.type ?? null,
    fx.eq ?? null,
    fx.comp ?? null,
    DRUM_ROLES.includes(track.role) ? ctx?.kitId ?? "" : "",
  ]);
}

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

// A voice that will be tuned later keeps every rampable device in its chain even when the device is
// off, bypassed by a zero wet. A voice rendered once offline builds only what it uses: the bypassed
// devices are transparent, so the sound is identical, and eight section renders do not pay for them.
export function makeVoice(track: Track, buses: Buses, clip?: AudioBuffer, kit?: Kit, live = true): Voice {
  const { role } = track;
  const p = track.synth ?? {};
  const fx = track.fx ?? {};
  const disp: { dispose: () => void }[] = [];
  const dest = track.duck ? buses.duck : buses.master;
  let base = baseOf(track);

  // Insert chain (built back to front): filter -> drive -> crush -> eq -> delay -> pan -> width -> volume.
  const volume = new Tone.Volume(base.volume).connect(dest); disp.push(volume);
  let head: Tone.ToneAudioNode = volume;
  const widener = live || typeof fx.width === "number" ? new Tone.StereoWidener(base.width) : null;
  if (widener) { widener.connect(head); head = widener; disp.push(widener); }
  const panner = live || fx.pan ? new Tone.Panner(base.pan) : null;
  if (panner) { panner.connect(head); head = panner; disp.push(panner); }
  const delay = live || base.delayWet > 0 ? new Tone.FeedbackDelay(base.delayTime, base.delayFeedback) : null;
  if (delay) { delay.wet.value = base.delayWet; delay.connect(head); head = delay; disp.push(delay); }
  if (fx.eq) { const eq = new Tone.EQ3(fx.eq.low, fx.eq.mid, fx.eq.high); eq.connect(head); head = eq; disp.push(eq); }
  if (fx.comp) { const c = new Tone.Compressor(fx.comp.threshold, fx.comp.ratio); c.connect(head); head = c; disp.push(c); }
  const crush = live || base.crush > 0 ? new Tone.BitCrusher(Math.max(4, Math.min(12, base.crush || 8))) : null;
  if (crush) { crush.wet.value = base.crush > 0 ? 1 : 0; crush.connect(head); head = crush; disp.push(crush); }
  const drive = live || base.drive > 0 ? new Tone.Distortion(Math.min(1, Math.max(0.001, base.drive))) : null;
  if (drive) { drive.wet.value = base.drive > 0 ? 1 : 0; drive.connect(head); head = drive; disp.push(drive); }
  const filter = new Tone.Filter(base.cutoff, fx.filter?.type ?? "lowpass"); filter.Q.value = base.q;
  filter.connect(head); head = filter; disp.push(filter);
  const gate = new Tone.Gain(1); gate.connect(head); head = gate; disp.push(gate);

  // The reverb send always exists at the track's amount, so "more space on the pad" is a ramp.
  const send = live || base.reverb > 0 ? new Tone.Gain(base.reverb) : null;
  if (send) { volume.connect(send); send.connect(buses.reverb); disp.push(send); }

  const vel = (n: Note) => Math.min(1, n[3] / 127);
  const durSec = (n: Note, bpm: number) => Math.max(0.05, n[2] * (60 / bpm));
  const oct = (p.octave ?? 0) * 12;
  const env = (d: { attack: number; decay: number; sustain: number; release: number }) => ({
    attack: p.attack ?? d.attack, decay: p.decay ?? d.decay, sustain: p.sustain ?? d.sustain, release: p.release ?? d.release,
  });

  // The automation surface is shared by the sampled and synthesized paths, so it is defined first.
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
      case "volume": { const trim = ROLE_TRIM[role] ?? 0; volume.volume.cancelScheduledValues(t0); volume.volume.setValueAtTime(from + trim, t0); volume.volume.linearRampToValueAtTime(to + trim, t1); return true; }
      case "pan": return panner ? ramp(panner.pan as unknown as Tone.Signal<"audioRange">, false) : false;
      case "width": return widener ? ramp(widener.width as unknown as Tone.Signal<"normalRange">, false) : false;
      case "reverb": return send ? ramp(send.gain as unknown as Tone.Signal<"normalRange">, false) : false;
      case "delay.wet": return delay ? ramp(delay.wet as unknown as Tone.Signal<"normalRange">, false) : false;
      case "drive": { if (!drive) return false; drive.distortion = Math.min(1, Math.max(0.001, to)); drive.wet.rampTo(to > 0 ? 1 : 0, Math.max(0.01, t1 - t0)); return true; }
      default: return false;
    }
  };

  // A move the producer made: the numbers that can ramp, ramped; the ones that cannot are a new voice.
  // It also puts back whatever an automation sweep or a trance gate left behind, so every new
  // schedule starts from the written record instead of from the middle of a filter sweep.
  const tune: Voice["tune"] = (t) => {
    base = baseOf(t);
    gate.gain.rampTo(1, 0.02);
    filter.frequency.rampTo(base.cutoff, RAMP);
    filter.Q.rampTo(base.q, RAMP);
    volume.volume.rampTo(base.volume, RAMP);
    panner?.pan.rampTo(base.pan, RAMP);
    widener?.width.rampTo(base.width, RAMP);
    send?.gain.rampTo(base.reverb, RAMP);
    if (delay) { delay.delayTime.rampTo(base.delayTime, RAMP); delay.feedback.rampTo(base.delayFeedback, RAMP); delay.wet.rampTo(base.delayWet, RAMP); }
    if (drive) { drive.distortion = Math.min(1, Math.max(0.001, base.drive)); drive.wet.rampTo(base.drive > 0 ? 1 : 0, RAMP); }
    if (crush) { if (base.crush > 0) crush.bits.value = Math.max(4, Math.min(12, base.crush)); crush.wet.rampTo(base.crush > 0 ? 1 : 0, RAMP); }
  };

  let trigger: Voice["trigger"];
  const kitSound: KitSound | null = DRUM_ROLES.includes(role) ? (role as KitSound) : null;
  // A drum track carrying its own clip (a one-shot sliced from a record) plays that sound; else the kit; else the synth.
  const drumBuf = kitSound ? (track.clip && clip ? clip : kit && !p.wave ? kit[kitSound] : undefined) : undefined;
  if (kitSound && drumBuf) {
    // Sampled drums: one Player per voice, velocity to gain, tune to rate, optional decay shaping.
    // Tune and decay are read per hit, so "tune the kick down" never rebuilds the voice.
    const player = new Tone.Player(drumBuf);
    const decayGain = new Tone.Gain(1);
    player.connect(decayGain); decayGain.connect(head); disp.push(player, decayGain);
    const clipSemis = track.clip && clip ? track.clip.semitones ?? 0 : 0;
    const clipGain = track.clip && clip ? track.clip.gainDb ?? 0 : 0;
    trigger = (n, t) => {
      player.playbackRate = Math.pow(2, (base.drumTune + clipSemis) / 12);
      player.volume.value = clipGain + 20 * Math.log10(Math.max(0.03, vel(n)));
      const dec = base.drumDecay;
      if (dec) { decayGain.gain.cancelScheduledValues(t); decayGain.gain.setValueAtTime(1, t); decayGain.gain.exponentialRampToValueAtTime(0.001, t + dec); }
      try { player.start(t); } catch { /* overlapping start */ }
    };
    return { trigger, automate, gate, out: volume, setVolume: (db) => volume.volume.rampTo(db + (ROLE_TRIM[role] ?? 0), 0.03), tune, dispose: () => disp.forEach((d) => d.dispose()) };
  }
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
      const s = p.wave === "epiano" || p.wave === "organ" ? keyboardVoice(p.wave, p, env) : new Tone.PolySynth(Tone.Synth, { oscillator: oscOf(p, ROLE_WAVE[role] ?? "triangle", ROLE_UNISON[role]), envelope: env({ attack: 0.004, decay: 0.18, sustain: role === "lead" ? 0.4 : 0.15, release: 0.12 }) });
      s.connect(head); disp.push(s);
      trigger = (n, t, bpm) => s.triggerAttackRelease(midiToFreq(n[0] + oct), durSec(n, bpm), t, vel(n));
    }
  }

  return { trigger, automate, gate, out: volume, setVolume: (db) => volume.volume.rampTo(db + (ROLE_TRIM[role] ?? 0), 0.03), tune, dispose: () => disp.forEach((d) => d.dispose()) };
}
