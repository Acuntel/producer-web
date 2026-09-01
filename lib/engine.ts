// The engine v2 — plays a full SongDoc arrangement with sidechain pump,
// deterministic humanization, section fills, and offline WAV render.
import * as Tone from "tone";
import type { Song, Track, Role, Section } from "./song";

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// Deterministic PRNG — same seed, same feel, forever.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ev = { beat: number; note: [number, number, number, number] };

// Tile a track's pattern across the arrangement, apply fills + humanize.
export function scheduleEvents(song: Song): { perTrack: Map<string, Ev[]>; kickBeats: number[]; totalBeats: number; sectionStarts: { id: string; name: string; startBeat: number; beats: number }[] } {
  const rng = mulberry32(song.humanize.seed);
  const swingShift = (song.humanize.swing - 0.5) * 0.5; // beats added to offbeat 16ths
  const beatSec = 60 / song.bpm;
  const clapLate = (song.humanize.clapLateMs / 1000) / beatSec;

  const perTrack = new Map<string, Ev[]>();
  const kickBeats: number[] = [];
  const sectionStarts: { id: string; name: string; startBeat: number; beats: number }[] = [];
  let cursor = 0;

  const secById = new Map(song.sections.map((s) => [s.id, s]));
  for (const secId of song.arrangement) {
    const sec = secById.get(secId);
    if (!sec) continue;
    const secBeats = sec.bars * 4;
    sectionStarts.push({ id: sec.id, name: sec.name, startBeat: cursor, beats: secBeats });

    for (const tr of song.tracks) {
      if (tr.mute || !sec.active.includes(tr.id) || tr.notes.length === 0) continue;
      const list = perTrack.get(tr.id) ?? [];
      const reps = Math.ceil(secBeats / tr.loopBeats);
      for (let r = 0; r < reps; r++) {
        for (const n of tr.notes) {
          const local = r * tr.loopBeats + n[1];
          if (local >= secBeats) continue;
          // fill "cut": kick/bass/sub out for the final 2 beats, and EVERYTHING
          // out for the last half-beat — the engineered silence before the drop.
          if (sec.fill === "cut" && local >= secBeats - 2 && ["kick", "bass", "sub"].includes(tr.role)) continue;
          if (sec.fill === "cut" && local >= secBeats - 0.5) continue;
          let beat = cursor + local;
          let vel = n[3];
          // humanize: swing on offbeat 16ths for hats/perc/bass; clap pocket; vel looseness
          const frac = Math.round((n[1] % 0.5) * 100) / 100;
          const isOffbeat16 = frac === 0.25;
          if (isOffbeat16 && ["hat", "openhat", "bass", "pluck", "snare"].includes(tr.role)) beat += swingShift;
          if (tr.role === "clap") beat += clapLate;
          if (["hat", "openhat", "snare"].includes(tr.role) && song.humanize.velVar > 0) {
            vel = Math.max(15, Math.min(127, Math.round(vel * (1 + (rng() - 0.5) * 2 * song.humanize.velVar))));
          }
          list.push({ beat, note: [n[0], n[1], n[2], vel] });
          if (tr.role === "kick") kickBeats.push(beat);
        }
      }
      perTrack.set(tr.id, list);
    }
    // fill "roll": clap crescendo through the final 2 beats
    if (sec.fill === "roll") {
      const clap = song.tracks.find((t) => t.role === "clap" && sec.active.includes(t.id)) ?? song.tracks.find((t) => t.role === "clap");
      if (clap) {
        const list = perTrack.get(clap.id) ?? [];
        for (let i = 0; i < 8; i++) {
          list.push({ beat: cursor + secBeats - 2 + i * 0.25, note: [39, 0, 0.1, 70 + i * 8] });
        }
        perTrack.set(clap.id, list);
      }
    }
    cursor += secBeats;
  }
  return { perTrack, kickBeats, totalBeats: cursor, sectionStarts };
}

type Voice = { trigger: (n: [number, number, number, number], time: number, bpm: number) => void; dispose: () => void };

// How much of each element goes to the shared room — space without mud.
const REV_WET: Partial<Record<Role, number>> = {
  clap: 0.14, snare: 0.1, stab: 0.2, pad: 0.32, chords: 0.22, lead: 0.16, openhat: 0.07,
};

function makeVoice(role: Role, volumeDb: number, dest: Tone.ToneAudioNode, reverbBus?: Tone.ToneAudioNode): Voice {
  const out = new Tone.Volume(volumeDb).connect(dest);
  const disp: { dispose: () => void }[] = [out];
  if (reverbBus && REV_WET[role]) {
    const sendGain = new Tone.Gain(REV_WET[role]!);
    out.connect(sendGain);
    sendGain.connect(reverbBus);
    disp.push(sendGain);
  }
  const vel = (n: [number, number, number, number]) => Math.min(1, n[3] / 127);
  const durSec = (n: [number, number, number, number], bpm: number) => Math.max(0.05, n[2] * (60 / bpm));
  switch (role) {
    case "kick": {
      const body = new Tone.MembraneSynth({ pitchDecay: 0.035, octaves: 5.5, oscillator: { type: "sine" }, envelope: { attack: 0.001, decay: 0.32, sustain: 0 } }).connect(out);
      const click = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.02, sustain: 0 } });
      const clickHp = new Tone.Filter(3000, "highpass").connect(out);
      click.connect(clickHp);
      disp.push(body, click, clickHp);
      return { trigger: (n, t) => { body.triggerAttackRelease(48, 0.3, t, vel(n)); click.triggerAttackRelease(0.02, t, vel(n) * 0.5); }, dispose: () => disp.forEach((d) => d.dispose()) };
    }
    case "clap": {
      const s = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.001, decay: 0.14, sustain: 0 } });
      const bp = new Tone.Filter(1600, "bandpass"); bp.Q.value = 0.8;
      s.connect(bp); bp.connect(out);
      disp.push(s, bp);
      return { trigger: (n, t) => { s.triggerAttackRelease(0.12, t, vel(n)); s.triggerAttackRelease(0.1, t + 0.012, vel(n) * 0.7); }, dispose: () => disp.forEach((d) => d.dispose()) };
    }
    case "snare": {
      const s = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.18, sustain: 0 } });
      const bp = new Tone.Filter(2200, "bandpass"); s.connect(bp); bp.connect(out);
      disp.push(s, bp);
      return { trigger: (n, t) => s.triggerAttackRelease(0.15, t, vel(n)), dispose: () => disp.forEach((d) => d.dispose()) };
    }
    case "hat":
    case "openhat": {
      const s = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: role === "hat" ? 0.04 : 0.28, sustain: 0 } });
      const hp = new Tone.Filter(9000, "highpass"); s.connect(hp); hp.connect(out);
      disp.push(s, hp);
      return { trigger: (n, t) => s.triggerAttackRelease(role === "hat" ? 0.04 : 0.28, t, vel(n)), dispose: () => disp.forEach((d) => d.dispose()) };
    }
    case "bass": {
      const s = new Tone.MonoSynth({
        oscillator: { type: "fatsawtooth", count: 2, spread: 18 } as Tone.OmniOscillatorOptions,
        filter: { type: "lowpass", Q: 3, rolloff: -24 },
        filterEnvelope: { attack: 0.004, decay: 0.14, sustain: 0.35, baseFrequency: 140, octaves: 2.6 },
        envelope: { attack: 0.004, decay: 0.18, sustain: 0.75, release: 0.04 },
      });
      const grit = new Tone.Distortion(0.25); s.connect(grit); grit.connect(out);
      disp.push(s, grit);
      return { trigger: (n, t, bpm) => s.triggerAttackRelease(midiToFreq(n[0]), durSec(n, bpm), t, vel(n)), dispose: () => disp.forEach((d) => d.dispose()) };
    }
    case "sub": {
      const s = new Tone.MonoSynth({ oscillator: { type: "sine" }, envelope: { attack: 0.006, decay: 0.25, sustain: 0.85, release: 0.05 } }).connect(out);
      disp.push(s);
      return { trigger: (n, t, bpm) => s.triggerAttackRelease(midiToFreq(n[0]), durSec(n, bpm), t, vel(n)), dispose: () => disp.forEach((d) => d.dispose()) };
    }
    case "stab": {
      const s = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sawtooth" }, envelope: { attack: 0.003, decay: 0.22, sustain: 0, release: 0.06 } });
      const f = new Tone.Filter(3200, "lowpass"); const d = new Tone.Distortion(0.12);
      s.connect(f); f.connect(d); d.connect(out);
      disp.push(s, f, d);
      return { trigger: (n, t, bpm) => s.triggerAttackRelease(midiToFreq(n[0]), durSec(n, bpm), t, vel(n)), dispose: () => disp.forEach((x) => x.dispose()) };
    }
    case "chords":
    case "pad": {
      const s = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sawtooth" }, envelope: { attack: role === "pad" ? 0.4 : 0.005, decay: 0.5, sustain: 0.65, release: 0.9 } });
      const f = new Tone.Filter(role === "pad" ? 1100 : 2400, "lowpass");
      const ch = new Tone.Chorus(0.6, 3.5, 0.4).start();
      s.connect(f); f.connect(ch); ch.connect(out);
      disp.push(s, f, ch);
      return { trigger: (n, t, bpm) => s.triggerAttackRelease(midiToFreq(n[0]), durSec(n, bpm), t, vel(n) * 0.8), dispose: () => disp.forEach((x) => x.dispose()) };
    }
    default: { // lead, pluck
      const s = new Tone.Synth({ oscillator: { type: "triangle" }, envelope: { attack: 0.004, decay: 0.18, sustain: 0.25, release: 0.1 } }).connect(out);
      disp.push(s);
      return { trigger: (n, t, bpm) => s.triggerAttackRelease(midiToFreq(n[0]), durSec(n, bpm), t, vel(n)), dispose: () => disp.forEach((x) => x.dispose()) };
    }
  }
}

// Build the whole mix graph + parts into a given context's destination.
function buildGraph(song: Song, transport: ReturnType<typeof Tone.getTransport>) {
  const master = new Tone.Compressor(-20, 3);
  const limiter = new Tone.Limiter(-1);
  master.connect(limiter); limiter.toDestination();
  const duckBus = new Tone.Gain(1).connect(master);
  const reverb = new Tone.Freeverb({ roomSize: 0.82, dampening: 2800 });
  reverb.wet.value = 1;
  reverb.connect(master);

  const { perTrack, kickBeats, totalBeats, sectionStarts } = scheduleEvents(song);
  const ppq = transport.PPQ;
  const parts: Tone.Part[] = [];
  const voices: Voice[] = [];

  for (const tr of song.tracks) {
    const evs = perTrack.get(tr.id);
    if (!evs || evs.length === 0) continue;
    const voice = makeVoice(tr.role, tr.volume, tr.duck ? duckBus : master, reverb);
    voices.push(voice);
    const part = new Tone.Part((time, ev: Ev) => voice.trigger(ev.note, time, song.bpm), evs.map((e) => [`${Math.max(0, Math.round(e.beat * ppq))}i`, e] as [string, Ev]));
    part.start(0);
    parts.push(part);
  }

  // Automatic drop craft: every "cut" section gets a white-noise riser sweeping
  // up through its final bars, dying into the engineered silence gap.
  const beatSec = 60 / song.bpm;
  const secById = new Map(song.sections.map((s) => [s.id, s]));
  const riserSynth = new Tone.NoiseSynth({ noise: { type: "white" } });
  const riserHp = new Tone.Filter(500, "highpass");
  const riserGain = new Tone.Gain(0.33);
  riserSynth.connect(riserHp); riserHp.connect(riserGain); riserGain.connect(master);
  const riserEvents: [string, number][] = [];
  for (const s of sectionStarts) {
    if (secById.get(s.id)?.fill !== "cut") continue;
    const lenBeats = Math.min(16, s.beats);
    const startBeat = s.startBeat + s.beats - lenBeats - 0.5;
    riserEvents.push([`${Math.max(0, Math.round(startBeat * ppq))}i`, lenBeats]);
  }
  if (riserEvents.length > 0) {
    const riserPart = new Tone.Part((time, lenBeats: number) => {
      const len = lenBeats * beatSec;
      riserSynth.envelope.attack = Math.max(0.1, len - 0.15);
      riserSynth.envelope.decay = 0.1;
      riserSynth.envelope.sustain = 0;
      riserHp.frequency.setValueAtTime(500, time);
      riserHp.frequency.exponentialRampToValueAtTime(7000, time + len);
      riserSynth.triggerAttackRelease(len, time, 0.85);
    }, riserEvents);
    riserPart.start(0);
    parts.push(riserPart);
  }

  // The pump: duck the bus at every kick.
  const duckPart = new Tone.Part((time) => {
    duckBus.gain.cancelScheduledValues(time);
    duckBus.gain.setValueAtTime(1, time);
    duckBus.gain.linearRampToValueAtTime(0.38, time + 0.015);
    duckBus.gain.linearRampToValueAtTime(1, time + Math.min(0.26, beatSec * 0.55));
  }, kickBeats.map((b) => [`${Math.max(0, Math.round(b * ppq))}i`, b] as [string, number]));
  duckPart.start(0);
  parts.push(duckPart);

  transport.bpm.value = song.bpm;
  const nodes = [master, limiter, duckBus, reverb, riserSynth, riserHp, riserGain];
  return { parts, voices, nodes, totalBeats, sectionStarts };
}

export class Engine {
  private parts: Tone.Part[] = [];
  private voices: Voice[] = [];
  private nodes: { dispose: () => void }[] = [];
  private watch: number | null = null;
  private sectionStarts: { id: string; name: string; startBeat: number; beats: number }[] = [];
  private builtBeats = 0;
  playing = false;
  onSection: ((name: string, index: number, total: number) => void) | null = null;

  pause() {
    Tone.Transport.pause();
    this.playing = false;
  }

  resume() {
    Tone.Transport.start();
    this.playing = true;
  }

  // Raw playhead beat for the note-grid visuals.
  getBeat(): number | null {
    if (this.sectionStarts.length === 0) return null;
    return Tone.Transport.ticks / Tone.Transport.PPQ;
  }

  // Where the playhead is RIGHT NOW — so "this beat here" means something.
  getPosition(): { section: string; barInSection: number; absBar: number } | null {
    if (this.sectionStarts.length === 0) return null;
    const beat = Tone.Transport.ticks / Tone.Transport.PPQ;
    const s = this.sectionStarts.find((x) => beat >= x.startBeat && beat < x.startBeat + x.beats);
    if (!s) return null;
    return {
      section: s.name,
      barInSection: Math.floor((beat - s.startBeat) / 4) + 1,
      absBar: Math.floor(beat / 4) + 1,
    };
  }

  async start(song: Song) {
    await Tone.start();
    this.buildLive(song);
    Tone.Transport.start();
    this.playing = true;
  }

  stop() {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    this.teardown();
    this.playing = false;
  }

  update(song: Song) {
    // Always rebuild — playing OR paused — so a change made during a pause is
    // there the moment they hit play. Keep the groove position, clamped to the
    // new arrangement length.
    const pos = Tone.Transport.ticks;
    this.teardown();
    this.buildLive(song);
    const end = Math.max(1, this.builtBeats * Tone.Transport.PPQ);
    Tone.Transport.ticks = pos % end;
  }

  private buildLive(song: Song) {
    const g = buildGraph(song, Tone.Transport);
    this.parts = g.parts; this.voices = g.voices; this.nodes = g.nodes;
    this.sectionStarts = g.sectionStarts;
    this.builtBeats = g.totalBeats;
    Tone.Transport.loop = true;
    Tone.Transport.loopStart = 0;
    Tone.Transport.loopEnd = `${g.totalBeats * Tone.Transport.PPQ}i`;
    if (this.watch) window.clearInterval(this.watch);
    this.watch = window.setInterval(() => {
      if (!this.playing || !this.onSection) return;
      const beat = Tone.Transport.ticks / Tone.Transport.PPQ;
      const idx = g.sectionStarts.findIndex((s) => beat >= s.startBeat && beat < s.startBeat + s.beats);
      if (idx >= 0) this.onSection(g.sectionStarts[idx].name, idx, g.sectionStarts.length);
    }, 250);
  }

  private teardown() {
    if (this.watch) { window.clearInterval(this.watch); this.watch = null; }
    this.parts.forEach((p) => { p.stop(); p.dispose(); });
    this.voices.forEach((v) => v.dispose());
    this.nodes.forEach((n) => n.dispose());
    this.parts = []; this.voices = []; this.nodes = [];
  }
}

// The producer's EARS: render the drop and measure what it actually sounds
// like — band balance, loudness breathing, pump. Headphones-proof by design:
// this analyzes the signal itself, not the room.
export type Ears = {
  sub: number; low: number; mid: number; high: number; // energy shares, sum≈1
  pump: number;    // loudness breathing at beat rate (0..1+, higher = pumpier)
  rmsVar: number;  // overall dynamics
  section: string;
};

export async function analyzeSong(song: Song): Promise<Ears> {
  const { sectionStarts } = scheduleEvents(song);
  const drop = sectionStarts.find((s) => /drop/i.test(s.name)) ?? sectionStarts[Math.min(1, sectionStarts.length - 1)] ?? sectionStarts[0];
  const beatSec = 60 / song.bpm;
  const sliceBeats = 8;
  const startSec = drop.startBeat * beatSec;
  const buffer = await Tone.Offline(({ transport }) => {
    buildGraph(song, transport as unknown as ReturnType<typeof Tone.getTransport>);
    transport.start(0);
  }, startSec + sliceBeats * beatSec + 0.2);
  const full = buffer.get() as AudioBuffer;
  const sr = full.sampleRate;
  const from = Math.floor(startSec * sr);
  const len = Math.min(full.length - from, Math.floor(sliceBeats * beatSec * sr));
  if (len <= 0) return { sub: 0, low: 0, mid: 0, high: 0, pump: 0, rmsVar: 0, section: drop.name };

  // Band split via a 4-channel offline graph.
  const slice = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
  const mono = new Float32Array(len);
  const ch0 = full.getChannelData(0);
  for (let i = 0; i < len; i++) mono[i] = ch0[from + i];
  slice.copyToChannel(mono, 0);
  const off = new OfflineAudioContext(4, len, sr);
  const src = off.createBufferSource();
  src.buffer = slice;
  const merger = off.createChannelMerger(4);
  const defs: [BiquadFilterType, number, number?][] = [["lowpass", 95], ["bandpass", 180, 0.9], ["bandpass", 1100, 0.7], ["highpass", 4500]];
  defs.forEach(([type, freq, q], i) => {
    const f = off.createBiquadFilter();
    f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    src.connect(f); f.connect(merger, 0, i);
  });
  merger.connect(off.destination);
  src.start(0);
  const out = await off.startRendering();
  const energy = [0, 1, 2, 3].map((c) => {
    const d = out.getChannelData(c);
    let e = 0;
    for (let i = 0; i < d.length; i += 4) e += d[i] * d[i];
    return e;
  });
  const total = energy.reduce((a, b) => a + b, 0) || 1;

  // Pump: per-16th RMS of the mono slice.
  const win = Math.max(64, Math.floor((beatSec / 4) * sr));
  const rms: number[] = [];
  for (let i = 0; i + win <= len; i += win) {
    let e = 0;
    for (let j = i; j < i + win; j += 2) e += mono[j] * mono[j];
    rms.push(Math.sqrt(e / (win / 2)));
  }
  const mean = rms.reduce((a, b) => a + b, 0) / (rms.length || 1);
  const varr = rms.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (rms.length || 1);
  return {
    sub: +(energy[0] / total).toFixed(3),
    low: +(energy[1] / total).toFixed(3),
    mid: +(energy[2] / total).toFixed(3),
    high: +(energy[3] / total).toFixed(3),
    pump: +(mean ? Math.sqrt(varr) / mean : 0).toFixed(3),
    rmsVar: +Math.sqrt(varr).toFixed(4),
    section: drop.name,
  };
}

// Offline render of the FULL arrangement -> WAV.
export async function renderWav(song: Song): Promise<Blob> {
  const { totalBeats } = scheduleEvents(song);
  const secs = (totalBeats * 60) / song.bpm + 1.5;
  const buffer = await Tone.Offline(({ transport }) => {
    buildGraph(song, transport as unknown as ReturnType<typeof Tone.getTransport>);
    transport.start(0);
  }, secs);
  return audioBufferToWav(buffer.get() as AudioBuffer);
}

function audioBufferToWav(buf: AudioBuffer): Blob {
  const numCh = Math.min(2, buf.numberOfChannels);
  const length = buf.length * numCh * 2;
  const out = new DataView(new ArrayBuffer(44 + length));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); out.setUint32(4, 36 + length, true); w(8, "WAVE");
  w(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true);
  out.setUint16(22, numCh, true); out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * numCh * 2, true); out.setUint16(32, numCh * 2, true);
  out.setUint16(34, 16, true); w(36, "data"); out.setUint32(40, length, true);
  let off = 44;
  const chans = Array.from({ length: numCh }, (_, c) => buf.getChannelData(c));
  for (let i = 0; i < buf.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      out.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}
