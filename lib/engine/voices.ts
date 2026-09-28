// One voice per track: the instrument, its insert chain, sends, and the
// automation surface. Ableton's device chain, radically simplified.
//
// A voice outlives a change. Everything the producer usually moves (volume, pan,
// cutoff, resonance, reverb, delay, drive, crush, width) ramps in place through
// `tune`, and only a change of instrument (role, synth shape, clip, kit) builds a
// new voice. `voiceSignature` is what decides that, and `tune` also puts every
// automatable parameter back to the written value before a new schedule is laid down.
import * as Tone from "tone";
import type { Track, Note, Role, AutoParam } from "../song/types";
import type { Kit, KitSound } from "./kits";
import { synthVoice } from "./instruments";
import { hitter, reversedOf } from "./hits";
import { Drive, hzOf } from "./fx";

export type Voice = {
  trigger: (n: Note, time: number, bpm: number) => void;
  automate: (param: AutoParam, from: number, to: number, t0: number, t1: number, curve?: "linear" | "exp") => boolean;
  gate: Tone.Gain;
  out: Tone.ToneAudioNode;   // post-fader output, for meters
  setVolume: (db: number) => void;   // live fader moves, no rebuild
  /** The track's rampable values, ramped in place from audio time `at`. Parameters in `skip` are under
   *  a running automation and are left alone, so a move never snaps a sweep or a fade back. */
  tune: (track: Track, at: number, skip?: ReadonlySet<AutoParam>) => void;
  /** Put an automated parameter back to the track's written value, arriving at audio time `at`. */
  toBase: (param: AutoParam, at: number) => void;
  /** Leave: fade the whole voice (sends included) out from audio time `at` over `seconds`. */
  release: (at: number, seconds: number) => void;
  dispose: () => void;
};

export type Buses = { master: Tone.ToneAudioNode; music: Tone.ToneAudioNode; duck: Tone.ToneAudioNode; reverb: Tone.ToneAudioNode };

const REV_WET: Partial<Record<Role, number>> = { clap: 0.14, snare: 0.1, stab: 0.2, pad: 0.32, chords: 0.22, lead: 0.16, openhat: 0.07, perc: 0.08, arp: 0.15, pluck: 0.12, fx: 0.3, audio: 0.1 };
const ROLE_CUTOFF: Partial<Record<Role, number>> = { pad: 2400, chords: 3600, stab: 4800, lead: 6500, pluck: 5200, arp: 5000, fx: 8000 };
// Gain staging: measured solo LUFS in the drop with seed volumes, targeted at record levels relative to the kick.
const ROLE_TRIM: Partial<Record<Role, number>> = { kick: -2.5, clap: 2, snare: 3, hat: 5, openhat: 4, perc: 4, bass: 3, sub: -3, stab: 7, chords: 7, pad: 8, lead: 6, pluck: 6, arp: 6, fx: 4, audio: 3 };
const DRUM_ROLES: Role[] = ["kick", "clap", "snare", "hat", "openhat", "perc"];

const RAMP = 0.04;   // a parameter move the ear reads as instant but never hears as a click
const EDGE = 0.005;  // an automation's approach to its written start, and a return to base: no step, ever

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

/** The devices a track uses. A voice builds only these (the node budget), so switching one on or off is a
 *  new voice, swapped at its boundary; a move within a device is a ramp. */
export function devicesOf(track: Track, automated?: ReadonlySet<AutoParam>) {
  const b = baseOf(track); const fx = track.fx ?? {}; const a = (p: AutoParam) => !!automated?.has(p);
  return { width: (typeof fx.width === "number" && fx.width !== 0.5) || a("width"), pan: !!fx.pan || a("pan"), delay: b.delayWet > 0 || a("delay.wet"), drive: b.drive > 0 || a("drive"), send: b.reverb > 0 || a("reverb") };
}

/** The parameters a song automates on a track anywhere in it: their devices must exist to be moved. */
export function automatedOn(song: { sections: { automation?: { track: string; param: AutoParam }[] }[] }, trackId: string): Set<AutoParam> {
  const out = new Set<AutoParam>();
  for (const sec of song.sections) for (const a of sec.automation ?? []) if (a.track === trackId) out.add(a.param);
  return out;
}

/** What makes this a different instrument. Same signature, same voice: the change ramps instead of rebuilding. */
export function voiceSignature(track: Track, ctx?: { kitId?: string; bpm?: number; automated?: ReadonlySet<AutoParam> }): string {
  const p = track.synth ?? {}; const fx = track.fx ?? {}; const c = track.clip;
  const sampled = DRUM_ROLES.includes(track.role) || track.role === "audio";
  const dv = devicesOf(track, ctx?.automated);
  return JSON.stringify([
    track.role,
    [dv.width, dv.pan, dv.delay, dv.drive, dv.send],
    // A sampled voice plays a buffer, so tuning and decay are per hit and never rebuild it;
    // a synthesized one bakes them into its envelopes.
    sampled ? { wave: p.wave, octave: p.octave } : p,
    c ? [c.clipId, c.sampleId, c.semitones, c.reverse, c.startSec, c.oneShot, c.warp, c.bpm, c.lengthBeats, c.warp !== false && c.bpm ? ctx?.bpm : 0, !!c.voice] : null,
    !!track.duck,
    (fx.crush ?? 0) > 0,   // the crusher is built only when used, so switching it on or off is a new voice
    fx.filter?.type ?? null,
    fx.eq ?? null,
    fx.comp ?? null,
    DRUM_ROLES.includes(track.role) ? ctx?.kitId ?? "" : "",
  ]);
}

// A voice builds only the devices its track uses (devicesOf, part of its signature): a device switched on
// or off is a new voice at the boundary, and the seed runs on a fraction of the nodes it did when every
// voice carried every device bypassed by a zero wet. The sound is identical: a bypassed device is transparent.
export function makeVoice(track: Track, buses: Buses, clip?: AudioBuffer, kit?: Kit, automated?: ReadonlySet<AutoParam>): Voice {
  const { role } = track;
  const p = track.synth ?? {};
  const fx = track.fx ?? {};
  const disp: { dispose: () => void }[] = [];
  const dest = track.duck ? buses.duck : buses.music;
  let base = baseOf(track);

  // Insert chain (built back to front): filter -> drive -> crush -> eq -> delay -> pan -> width -> volume.
  const volume = new Tone.Volume(base.volume).connect(dest); disp.push(volume);
  let head: Tone.ToneAudioNode = volume;
  const dv = devicesOf(track, automated);
  const widener = dv.width ? new Tone.StereoWidener(base.width) : null;
  if (widener) { widener.connect(head); head = widener; disp.push(widener); }
  const panner = dv.pan ? new Tone.Panner(base.pan) : null;
  if (panner) { panner.connect(head); head = panner; disp.push(panner); }
  const delay = dv.delay ? new Tone.FeedbackDelay(base.delayTime, base.delayFeedback) : null;
  if (delay) { delay.wet.value = base.delayWet; delay.connect(head); head = delay; disp.push(delay); }
  if (fx.eq) { const eq = new Tone.EQ3(fx.eq.low, fx.eq.mid, fx.eq.high); eq.connect(head); head = eq; disp.push(eq); }
  if (fx.comp) { const c = new Tone.Compressor(fx.comp.threshold, fx.comp.ratio); c.connect(head); head = c; disp.push(c); }
  // The crusher is an AudioWorklet (JavaScript on the audio thread), so it exists only on a track that crushes.
  const crush = base.crush > 0 ? new Tone.BitCrusher(Math.max(4, Math.min(12, base.crush))) : null;
  if (crush) { crush.wet.value = base.crush > 0 ? 1 : 0; crush.connect(head); head = crush; disp.push(crush); }
  const drive = dv.drive ? new Drive(Math.min(1, Math.max(0.001, base.drive))) : null;
  if (drive) { drive.wet.value = base.drive > 0 ? 1 : 0; drive.connect(head); head = drive; disp.push(drive); }
  // A plain biquad: Tone.Filter wraps one in two gains and four signals (ten native nodes), this is one.
  const filter = new Tone.BiquadFilter({ frequency: Math.min(base.cutoff, volume.context.sampleRate * 0.495), type: fx.filter?.type ?? "lowpass", Q: base.q });
  const cutoff = hzOf(filter.frequency, volume.context.sampleRate);
  filter.connect(head); head = filter; disp.push(filter);
  // A zero-delay wall: standardized-audio-context walks every downstream path for a cycle on each new connect
  // and stops only at a DelayNode, so every note start into the gate cost 7 to 12 ms. Behind it, under 0.1 ms.
  const wall = new Tone.Delay(0, 0.01); wall.connect(head); head = wall; disp.push(wall);
  const gate = new Tone.Gain(1); gate.connect(head); head = gate; disp.push(gate);

  // The reverb send always exists at the track's amount, so "more space on the pad" is a ramp.
  const send = dv.send ? new Tone.Gain(base.reverb) : null;
  if (send) { volume.connect(send); send.connect(buses.reverb); disp.push(send); }

  const vel = (n: Note) => Math.min(1, n[3] / 127);
  type Sig = { cancelAndHoldAtTime: (t: number) => unknown; linearRampToValueAtTime: (v: number, t: number) => unknown; exponentialRampToValueAtTime: (v: number, t: number) => unknown; rampTo: (v: number, r: number, at?: number) => unknown };
  const sigOf = (param: AutoParam): Sig | null => {
    switch (param) {
      case "filter.cutoff": return cutoff as unknown as Sig;
      case "filter.q": return filter.Q as unknown as Sig;
      case "volume": return volume.volume as unknown as Sig;
      case "pan": return (panner?.pan ?? null) as unknown as Sig | null;
      case "width": return (widener?.width ?? null) as unknown as Sig | null;
      case "reverb": return (send?.gain ?? null) as unknown as Sig | null;
      case "delay.wet": return (delay?.wet ?? null) as unknown as Sig | null;
      default: return null;
    }
  };
  const baseValue = (param: AutoParam): number => ({ "filter.cutoff": base.cutoff, "filter.q": base.q, volume: base.volume, pan: base.pan, width: base.width, reverb: base.reverb, "delay.wet": base.delayWet, drive: base.drive })[param];
  const trim = ROLE_TRIM[role] ?? 0;

  // The automation surface, shared by the sampled and synthesized paths. A sweep starts from wherever
  // the parameter is: it holds that value at t0 and reaches the written start within five
  // milliseconds, so a sweep that begins away from the current value is a fast glide, never a step.
  const automate: Voice["automate"] = (param, from, to, t0, t1, curve) => {
    if (param === "drive") {
      if (!drive) return false;
      drive.distortion = Math.min(1, Math.max(0.001, to));
      drive.wet.cancelAndHoldAtTime(t0); drive.wet.linearRampToValueAtTime(to > 0 ? 1 : 0, t0 + Math.max(0.01, t1 - t0));
      return true;
    }
    const sig = sigOf(param); if (!sig) return false;
    const [a, b] = param === "volume" ? [from + trim, to + trim] : [from, to];
    sig.cancelAndHoldAtTime(t0);
    sig.linearRampToValueAtTime(a, t0 + EDGE);
    const exp = curve !== "linear" && param === "filter.cutoff";
    if (exp && a > 0 && b > 0) sig.exponentialRampToValueAtTime(b, Math.max(t1, t0 + 2 * EDGE)); else sig.linearRampToValueAtTime(b, Math.max(t1, t0 + 2 * EDGE));
    return true;
  };
  // Every section start and the loop wrap put an automated parameter back where the record writes it,
  // so a fade or a sweep that ended somewhere never carries into the next pass.
  const toBase: Voice["toBase"] = (param, at) => {
    const t0 = Math.max(volume.context.currentTime, at - EDGE), t1 = Math.max(t0 + 0.001, at);
    if (param === "drive") { if (drive) { drive.distortion = Math.min(1, Math.max(0.001, base.drive)); drive.wet.cancelAndHoldAtTime(t0); drive.wet.linearRampToValueAtTime(base.drive > 0 ? 1 : 0, t1); } return; }
    const sig = sigOf(param); if (!sig) return;
    sig.cancelAndHoldAtTime(t0); sig.linearRampToValueAtTime(baseValue(param), t1);
  };

  // A move the producer made: the numbers that can ramp, ramped from `at`; the ones that cannot are a new
  // voice. A parameter a running automation owns is skipped (no snapback); every other one is put back to
  // the written value, including a trance gate's leftovers when the track no longer gates.
  const tune: Voice["tune"] = (t, at, skip) => {
    base = baseOf(t);
    const ramp = (param: AutoParam, v: number) => { if (skip?.has(param)) return; sigOf(param)?.rampTo(v, RAMP, at); };
    if (!((t.fx?.gate ?? 0) > 0)) gate.gain.rampTo(1, 0.02, at);
    ramp("filter.cutoff", base.cutoff); ramp("filter.q", base.q); ramp("volume", base.volume);
    ramp("pan", base.pan); ramp("width", base.width); ramp("reverb", base.reverb); ramp("delay.wet", base.delayWet);
    if (delay) { delay.delayTime.rampTo(base.delayTime, RAMP, at); delay.feedback.rampTo(base.delayFeedback, RAMP, at); }
    if (drive && !skip?.has("drive")) { drive.distortion = Math.min(1, Math.max(0.001, base.drive)); drive.wet.rampTo(base.drive > 0 ? 1 : 0, RAMP, at); }
    if (crush) { if (base.crush > 0) crush.bits.value = Math.max(4, Math.min(12, base.crush)); crush.wet.rampTo(base.crush > 0 ? 1 : 0, RAMP, at); }
  };
  const release: Voice["release"] = (at, seconds) => {
    volume.volume.cancelAndHoldAtTime(at); volume.volume.linearRampToValueAtTime(-100, at + seconds);
  };
  const setVolume: Voice["setVolume"] = (db) => volume.volume.rampTo(db + trim, 0.03);
  const done = (trigger: Voice["trigger"]): Voice => ({ trigger, automate, gate, out: volume, setVolume, tune, toBase, release, dispose: () => disp.forEach((d) => d.dispose()) });

  const kitSound: KitSound | null = DRUM_ROLES.includes(role) ? (role as KitSound) : null;
  // A drum track carrying its own clip (a one-shot sliced from a record) plays that sound; else the kit; else the synth.
  const own = !!(track.clip && clip);
  const drumBuf = kitSound ? (own ? clip : kit && !p.wave ? kit[kitSound] : undefined) : undefined;
  if (kitSound && drumBuf) {
    // Sampled drums: a source per hit, velocity to its gain and tune to its rate, both for that hit at
    // its own time (hits.ts). Tune and decay are read per hit, so "tune the kick down" never rebuilds.
    const decayGain = new Tone.Gain(1); decayGain.connect(head); disp.push(decayGain);
    const hits = hitter(drumBuf, decayGain); disp.push(hits);
    const clipSemis = own ? track.clip?.semitones ?? 0 : 0;
    const clipGain = Math.pow(10, (own ? track.clip?.gainDb ?? 0 : 0) / 20);
    return done((n, t) => {
      const dec = base.drumDecay;
      if (dec) { decayGain.gain.cancelAndHoldAtTime(t); decayGain.gain.linearRampToValueAtTime(1, t + 0.001); decayGain.gain.exponentialRampToValueAtTime(0.001, t + dec); }
      hits.hit(t, clipGain * Math.max(0.03, vel(n)), Math.pow(2, (base.drumTune + clipSemis) / 12));
    });
  }
  if (role === "audio") {
    // A one-shot clip: its own source per hit, like a drum, and a retrigger fades the last one out.
    const buf = clip && track.clip?.reverse ? reversedOf(clip) : clip;
    const hits = buf ? hitter(buf, head) : null; if (hits) disp.push(hits);
    const gain0 = Math.pow(10, (track.clip?.gainDb ?? 0) / 20);
    return done((n, t) => {
      if (!hits) return;
      // A sung voice plays its pre-render at rate 1, whatever the note says: varispeed would chipmunk it.
      const rate = track.clip?.voice ? 1 : Math.pow(2, ((n[0] - 60) + (track.clip?.semitones ?? 0)) / 12);
      hits.hit(t, gain0 * Math.max(0.05, vel(n)), rate, track.clip?.startSec ?? 0);
    });
  }
  return done(synthVoice(role, p, head, disp));
}
