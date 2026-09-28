// Drum kits: one-shots synthesized once per style with the raw Web Audio API,
// cached as AudioBuffers, played back like samples. Record-weight kicks,
// 909-style metal hats (six detuned squares), layered claps. Cheap to play,
// cheap to render, bright where records are bright.
import { laneHomeBpm } from "../brain/laneNames";
import { assetRequested, assetDecoded, assetReady } from "./ledger";

export type KitStyle = "tech-house" | "hard-house";
export type KitSound = "kick" | "clap" | "snare" | "hat" | "openhat" | "perc";
export type Kit = Record<KitSound, AudioBuffer>;

const cache = new Map<string, Promise<Kit>>();
const sampled = new Map<string, Promise<Kit>>();
const SR = 44100;

// Two synthesized kits exist. Any other lane borrows the closer one by tempo: a known lane's home tempo, else the song's own; 136 and up gets the hard kick.
export function kitStyleFor(lane: string, bpm?: number): KitStyle {
  if (lane === "hard-house" || lane === "tech-house") return lane;
  const tempo = laneHomeBpm(lane) ?? bpm ?? 126;
  return tempo >= 136 ? "hard-house" : "tech-house";
}

// The kit a song plays: `kit` undefined or "synth" = the synthesized kit for the lane;
// anything else names a library kit (or a lane) from public/samples, sound by sound
// falling back to the synthesized kit. A failed library load never blocks playback.
export function getKit(lane: string, kit?: string, bpm?: number): Promise<Kit> {
  const style = kitStyleFor(lane, bpm);
  if (!kit || kit === "synth") return synthKit(style);
  const key = `${kit}|${style}`;
  let p = sampled.get(key);
  if (!p) {
    assetRequested(`kit:${key}`, "kit");
    p = import("./samples").then((m) => m.sampleKit(kit, style)).then((r) => { assetReady(`kit:${key}`, "http"); return r.kit; }).catch(() => { sampled.delete(key); return synthKit(style); });
    sampled.set(key, p);
  }
  return p;
}

export function synthKit(style: KitStyle): Promise<Kit> {
  const key = style === "hard-house" ? "hard-house" : "tech-house";
  let p = cache.get(key);
  if (!p) {
    const id = `kit:synth|${key}`;
    assetRequested(id, "kit");
    p = renderKit(key).then((k) => { assetDecoded(id); assetReady(id, "render"); return k; });
    cache.set(key, p);
  }
  return p;
}

async function renderKit(style: "tech-house" | "hard-house"): Promise<Kit> {
  const hard = style === "hard-house";
  const [kick, clap, snare, hat, openhat, perc] = await Promise.all([
    render(0.6, (ctx, out) => kickVoice(ctx, out, hard)),
    render(0.45, (ctx, out) => clapVoice(ctx, out)),
    render(0.3, (ctx, out) => snareVoice(ctx, out)),
    render(0.12, (ctx, out) => hatVoice(ctx, out, 0.055)),
    render(0.5, (ctx, out) => hatVoice(ctx, out, 0.32)),
    render(0.15, (ctx, out) => percVoice(ctx, out)),
  ]);
  return { kick, clap, snare, hat, openhat, perc };
}

async function render(secs: number, build: (ctx: OfflineAudioContext, out: AudioNode) => void): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, Math.ceil(secs * SR), SR);
  const out = ctx.createGain(); out.connect(ctx.destination);
  build(ctx, out);
  const buf = await ctx.startRendering();
  // Normalize to -1 dBFS peak so every kit sound arrives at a known level.
  const d = buf.getChannelData(0);
  let peak = 0; for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak > 0) { const g = 0.89 / peak; for (let i = 0; i < d.length; i++) d[i] *= g; }
  return buf;
}

function env(param: AudioParam, t0: number, peak: number, attack: number, decay: number, curve: "exp" | "lin" = "exp") {
  param.setValueAtTime(0.0001, t0);
  param.linearRampToValueAtTime(peak, t0 + attack);
  if (curve === "exp") param.exponentialRampToValueAtTime(0.0001, t0 + attack + decay); else param.linearRampToValueAtTime(0, t0 + attack + decay);
}

function noise(ctx: OfflineAudioContext, secs: number, color: "white" | "pink" = "white"): AudioBufferSourceNode {
  const b = ctx.createBuffer(1, Math.ceil(secs * SR), SR);
  const d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (color === "white") d[i] = w;
    else { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25; }
  }
  const src = ctx.createBufferSource(); src.buffer = b; return src;
}

function shaper(ctx: OfflineAudioContext, drive: number): WaveShaperNode {
  const ws = ctx.createWaveShaper(); const n = 2048; const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); }
  ws.curve = c; ws.oversample = "2x"; return ws;
}

function kickVoice(ctx: OfflineAudioContext, out: AudioNode, hard: boolean) {
  const t = 0;
  // Body: sine with a fast pitch drop into the fundamental, saturated.
  const body = ctx.createOscillator(); body.type = "sine";
  const f0 = hard ? 52 : 48;
  body.frequency.setValueAtTime(hard ? 220 : 170, t);
  body.frequency.exponentialRampToValueAtTime(f0 * 1.6, t + 0.025);
  body.frequency.exponentialRampToValueAtTime(f0, t + 0.09);
  const bodyGain = ctx.createGain(); env(bodyGain.gain, t, 1, 0.001, hard ? 0.5 : 0.42);
  const sat = shaper(ctx, hard ? 2.6 : 1.6);
  body.connect(bodyGain); bodyGain.connect(sat); sat.connect(out);
  body.start(t); body.stop(t + 0.6);
  // Click: a few ms of highpassed noise for the transient.
  const click = noise(ctx, 0.02); const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2500;
  const cg = ctx.createGain(); env(cg.gain, t, hard ? 0.5 : 0.35, 0.0005, 0.012);
  click.connect(hp); hp.connect(cg); cg.connect(out); click.start(t);
  // Knock: a short 180 Hz thump for the beater.
  const knock = ctx.createOscillator(); knock.type = "triangle"; knock.frequency.value = 180;
  const kg = ctx.createGain(); env(kg.gain, t, 0.35, 0.001, 0.03);
  knock.connect(kg); kg.connect(out); knock.start(t); knock.stop(t + 0.05);
}

function clapVoice(ctx: OfflineAudioContext, out: AudioNode) {
  // Four bursts 9 ms apart through a bandpass, then a longer tail with a little room.
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1500; bp.Q.value = 0.7;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 500;
  bp.connect(hp); hp.connect(out);
  for (let i = 0; i < 4; i++) {
    const n = noise(ctx, 0.03, "pink"); const g = ctx.createGain(); env(g.gain, i * 0.009, 0.8, 0.0005, 0.02);
    n.connect(g); g.connect(bp); n.start(i * 0.009);
  }
  const tail = noise(ctx, 0.4, "pink"); const tg = ctx.createGain(); env(tg.gain, 0.027, 0.9, 0.001, 0.32);
  tail.connect(tg); tg.connect(bp); tail.start(0.027);
  const air = noise(ctx, 0.12); const ahp = ctx.createBiquadFilter(); ahp.type = "highpass"; ahp.frequency.value = 6000;
  const ag = ctx.createGain(); env(ag.gain, 0.027, 0.35, 0.001, 0.09); air.connect(ahp); ahp.connect(ag); ag.connect(out); air.start(0.027);
}

function snareVoice(ctx: OfflineAudioContext, out: AudioNode) {
  const tone = ctx.createOscillator(); tone.type = "triangle"; tone.frequency.setValueAtTime(240, 0); tone.frequency.exponentialRampToValueAtTime(170, 0.05);
  const tg = ctx.createGain(); env(tg.gain, 0, 0.6, 0.001, 0.12); tone.connect(tg); tg.connect(out); tone.start(0); tone.stop(0.3);
  const n = noise(ctx, 0.3); const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3200; bp.Q.value = 0.5;
  const ng = ctx.createGain(); env(ng.gain, 0, 0.9, 0.001, 0.17); n.connect(bp); bp.connect(ng); ng.connect(out); n.start(0);
}

function hatVoice(ctx: OfflineAudioContext, out: AudioNode, decay: number) {
  // The 808/909 recipe: six square waves at inharmonic ratios through a bandpass and a highpass.
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 10000; bp.Q.value = 1.1;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000;
  const g = ctx.createGain(); env(g.gain, 0, 0.9, 0.0005, decay);
  bp.connect(hp); hp.connect(g); g.connect(out);
  for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
    const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = f;
    const og = ctx.createGain(); og.gain.value = 0.2; o.connect(og); og.connect(bp); o.start(0); o.stop(decay + 0.1);
  }
  const n = noise(ctx, decay + 0.05); const nhp = ctx.createBiquadFilter(); nhp.type = "highpass"; nhp.frequency.value = 9000;
  const ng = ctx.createGain(); env(ng.gain, 0, 0.35, 0.0005, decay * 0.8); n.connect(nhp); nhp.connect(ng); ng.connect(out); n.start(0);
}

function percVoice(ctx: OfflineAudioContext, out: AudioNode) {
  // Tambourine-ish: bright metallic partials plus a shaker sizzle.
  const g = ctx.createGain(); env(g.gain, 0, 0.8, 0.0005, 0.09); g.connect(out);
  for (const f of [4200, 5300, 6900, 8100]) { const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = 0.12; o.connect(og); og.connect(g); o.start(0); o.stop(0.15); }
  const n = noise(ctx, 0.15); const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 6500; bp.Q.value = 1.5;
  const ng = ctx.createGain(); env(ng.gain, 0, 0.7, 0.0005, 0.08); n.connect(bp); bp.connect(ng); ng.connect(out); n.start(0);
}
