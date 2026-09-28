// Light devices: the same sound as Tone's Chorus and Distortion from a fraction of the native nodes.
// Tone builds each from LFOs, signals and a crossfade of its own (Chorus is 51 nodes, Distortion 12);
// a voice pays for every one of them on the audio thread whether it moves or not. These are built from
// plain gains, delays, one oscillator and one wave shaper, in whatever context is Tone's when they are made
// (the room, or an offline listen), and they plug into a Tone chain like any other node.
import * as Tone from "tone";

type Rampable = { cancelAndHoldAtTime: (t: number) => unknown; linearRampToValueAtTime: (v: number, t: number) => unknown; rampTo: (v: number, r: number, at?: number) => unknown; value: number };
// Equal power, like Tone's CrossFade: at a mix of 0.5 each side is at 0.707.
const dryOf = (wet: number) => Math.cos((Math.max(0, Math.min(1, wet)) * Math.PI) / 2);
const wetOf = (wet: number) => Math.sin((Math.max(0, Math.min(1, wet)) * Math.PI) / 2);

/** A stereo chorus: two delays swept in opposite phase by one sine (Tone's spread of 180), mixed with the dry
 *  signal at `wet`. Tone.Chorus(frequency, delayMs, depth) with its default wet of 0.5, in 11 nodes. */
export class LightChorus extends Tone.ToneAudioNode {
  readonly name = "LightChorus";
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;
  private parts: { dispose: () => unknown }[];
  private osc: OscillatorNode;

  constructor(frequency = 0.6, delayMs = 3.5, depth = 0.4, wet = 0.5) {
    super({});
    this.input = new Tone.Gain({ context: this.context });
    this.input.channelCount = 2; this.input.channelCountMode = "explicit";   // a mono source plays both sides
    this.output = new Tone.Gain({ context: this.context });
    const split = new Tone.Split({ context: this.context, channels: 2 }); const merge = new Tone.Merge({ context: this.context, channels: 2 });
    const base = delayMs / 1000; const dev = base * depth;
    const dl = new Tone.Delay({ context: this.context, delayTime: base, maxDelay: 0.05 }); const dr = new Tone.Delay({ context: this.context, delayTime: base, maxDelay: 0.05 });
    this.osc = this.context.createOscillator(); this.osc.type = "sine"; this.osc.frequency.value = frequency;
    const gl = new Tone.Gain({ context: this.context, gain: dev }); const gr = new Tone.Gain({ context: this.context, gain: -dev });
    Tone.connect(this.osc, gl); Tone.connect(this.osc, gr); gl.connect(dl.delayTime); gr.connect(dr.delayTime);
    const dry = new Tone.Gain({ context: this.context, gain: dryOf(wet) }); const wetG = new Tone.Gain({ context: this.context, gain: wetOf(wet) });
    this.input.connect(split); split.connect(dl, 0, 0); split.connect(dr, 1, 0); dl.connect(merge, 0, 0); dr.connect(merge, 0, 1);
    merge.connect(wetG); wetG.connect(this.output); this.input.connect(dry); dry.connect(this.output);
    this.osc.start();
    this.parts = [split, merge, dl, dr, gl, gr, dry, wetG];
  }

  dispose(): this {
    super.dispose();
    try { this.osc.stop(); this.osc.disconnect(); } catch { /* already gone */ }
    for (const p of this.parts) { try { p.dispose(); } catch { /* already gone */ } }
    return this;
  }
}

/** Tone.Distortion's curve and its wet control, in five nodes: a wave shaper beside a dry path. */
export class Drive extends Tone.ToneAudioNode {
  readonly name = "Drive";
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;
  readonly wet: Rampable;
  private shaper: Tone.WaveShaper;
  private dryG: Tone.Gain;
  private wetG: Tone.Gain;
  private amount = 0.4;

  constructor(distortion = 0.4, wet = 1) {
    super({});
    this.input = new Tone.Gain({ context: this.context }); this.output = new Tone.Gain({ context: this.context });
    this.shaper = new Tone.WaveShaper({ context: this.context, length: 4096 });
    this.dryG = new Tone.Gain({ context: this.context, gain: dryOf(wet) }); this.wetG = new Tone.Gain({ context: this.context, gain: wetOf(wet) });
    this.input.connect(this.shaper); this.shaper.connect(this.wetG); this.wetG.connect(this.output);
    this.input.connect(this.dryG); this.dryG.connect(this.output);
    this.distortion = distortion;
    // One mix for both sides: every move ramps the wet side to the mix and the dry side to its complement.
    const d = this.dryG.gain, w = this.wetG.gain; let now = wet;
    this.wet = {
      get value() { return now; },
      set value(v: number) { now = v; d.value = dryOf(v); w.value = wetOf(v); },
      cancelAndHoldAtTime: (t) => { d.cancelAndHoldAtTime(t); w.cancelAndHoldAtTime(t); return this.wet; },
      linearRampToValueAtTime: (v, t) => { now = v; d.linearRampToValueAtTime(dryOf(v), t); w.linearRampToValueAtTime(wetOf(v), t); return this.wet; },
      rampTo: (v, r, at) => { now = v; d.rampTo(dryOf(v), r, at); w.rampTo(wetOf(v), r, at); return this.wet; },
    };
  }

  get distortion() { return this.amount; }
  set distortion(amount: number) {
    this.amount = amount;
    const k = amount * 100; const deg = Math.PI / 180;
    this.shaper.setMap((x) => (Math.abs(x) < 0.001 ? 0 : ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x))));
  }

  dispose(): this {
    super.dispose();
    for (const p of [this.shaper, this.dryG, this.wetG]) { try { p.dispose(); } catch { /* already gone */ } }
    return this;
  }
}

/** A biquad's frequency that never leaves the band the context can hold. Tone checks a biquad's range, and a
 *  lowpass written at 20 kHz threw in a listen rendered at 22.05 kHz (its top is 11,025 Hz). */
export function hzOf(p: Tone.Param<"frequency">, sampleRate: number) {
  const top = (sampleRate / 2) * 0.99; const c = (v: number) => Math.max(1, Math.min(top, v));
  return {
    cancelAndHoldAtTime: (t: number) => p.cancelAndHoldAtTime(t),
    linearRampToValueAtTime: (v: number, t: number) => p.linearRampToValueAtTime(c(v), t),
    exponentialRampToValueAtTime: (v: number, t: number) => p.exponentialRampToValueAtTime(c(v), t),
    setValueAtTime: (v: number, t: number) => p.setValueAtTime(c(v), t),
    rampTo: (v: number, r: number, at?: number) => p.rampTo(c(v), r, at),
    get value() { return p.value as number; },
    set value(v: number) { p.value = c(v); },
    clamp: c,
  };
}
