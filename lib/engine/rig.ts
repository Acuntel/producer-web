// The rig: one desk, one voice per track, and a schedule laid down over them.
//
// This is what makes a change audible without a glitch. The desk and the voices
// survive; only the schedule is rebuilt, and a Part makes no sound of its own, so
// tearing one down and laying a new one is silent. A track whose instrument really
// changed gets a new voice under a short fade while the rest of the record plays on.
// The offline render drives the same rig once, so the ears hear exactly what plays.
import * as Tone from "tone";
import type { Song, Track } from "../song/types";
import { scheduleEvents, type Ev, type Schedule } from "./schedule";
import { makeVoice, voiceSignature, type Voice } from "./voices";
import { makeBoard, type Board, type Analysis } from "./board";
import { clipBuffer } from "./clips";
import type { Kit } from "./kits";
import { hitsAddress } from "./steady";

export type Clips = Map<string, AudioBuffer>;
// The rig's own health: how many note events fired, how many fired late (their time already past when the
// callback ran, which the ear hears as a flam or a dropout), and the thinnest margin seen in milliseconds.
export type Health = { events: number; late: number; minMarginMs: number };

type Transport = ReturnType<typeof Tone.getTransport>;
type Entry = { voice: Voice; sig: string; meter: Tone.Meter; grain?: Tone.GrainPlayer };

const FADE_SEC = 0.015;   // a swapped instrument crosses over in fifteen milliseconds

function hashBeats(beats: number[]): string {
  let h = 2166136261;
  for (const b of beats) h = Math.imul(h ^ Math.round(b * 960), 16777619);
  return `${beats.length}.${(h >>> 0).toString(36)}`;
}

export class Rig {
  readonly board: Board;
  readonly health: Health = { events: 0, late: 0, minMarginMs: Infinity };
  schedule: Schedule = { perTrack: new Map(), kickBeats: [], totalBeats: 0, sectionStarts: [], automation: [], clipSpans: [], audible: new Set<string>() };
  private entries = new Map<string, Entry>();
  private parts = new Map<string, { part: Tone.Part; hash: string }>();
  private laid = false;

  constructor(private transport: Transport, destination?: Tone.ToneAudioNode, private live = true) {
    this.board = makeBoard(destination, live);
  }

  get analysis(): Analysis { return this.board.analysis; }
  get voiceById(): Map<string, Voice> { const m = new Map<string, Voice>(); for (const [id, e] of this.entries) m.set(id, e.voice); return m; }

  /** Put this song on the rig: diff the voices, relay the schedule, ramp the desk. Never rebuilds what still fits. */
  apply(song: Song, clips: Clips = new Map(), kit?: Kit, kitId = "") {
    const schedule = scheduleEvents(song);
    this.schedule = schedule;
    const ppq = this.transport.PPQ;
    const tick = (beat: number) => `${Math.max(0, Math.round(beat * ppq))}i`;
    const beatSec = 60 / song.bpm;

    // A part whose hits have not changed is left exactly where it is. A fader move or a filter
    // sweep therefore costs nothing at all here, and a mute relays one track instead of fourteen.
    const kept = new Set<string>();
    const lay = (key: string, hash: string, make: () => Tone.Part) => {
      kept.add(key);
      const have = this.parts.get(key);
      if (have && have.hash === hash) return;
      if (have) { try { have.part.stop(); have.part.dispose(); } catch { /* already gone */ } }
      const part = make(); part.start(0);
      this.parts.set(key, { part, hash });
    };

    this.board.applyMaster(song.master ?? {}, this.laid);

    // Voices: every track in the song keeps one, playing or muted, so a mute is a schedule and not a rebuild.
    const wanted = new Set(song.tracks.map((t) => t.id));
    for (const [id, e] of [...this.entries]) if (!wanted.has(id)) { this.retire(e); this.entries.delete(id); this.board.analysis.tracks.delete(id); }
    for (const tr of song.tracks) {
      const buf = clipBuffer(clips, tr.clip);
      const sig = this.sigOf(tr, song, buf, kitId);
      const have = this.entries.get(tr.id);
      if (have && have.sig === sig) { have.voice.tune(tr); continue; }
      if (have) this.retire(have);
      this.entries.set(tr.id, this.build(tr, song, buf, kit, sig));
    }

    // The schedule: notes, warped clip loops, trance gates, automation, the riser, the pump.
    for (const tr of song.tracks) {
      const e = this.entries.get(tr.id); if (!e) continue;
      const evs = schedule.perTrack.get(tr.id);
      if (evs && evs.length) {
        // The tempo is read where each note plays (a note's length is in beats), so a tempo move keeps this part.
        lay(`hits:${tr.id}`, hitsAddress(e.sig, evs), () => {
          // Tone sources demand strictly increasing start times per voice: nudge exact collisions by 1 ms.
          let lastTime = -1;
          return new Tone.Part((time, ev: Ev) => {
            const margin = (time - this.transport.context.currentTime) * 1000;
            this.health.events++; if (margin < this.health.minMarginMs) this.health.minMarginMs = margin; if (margin < 0) this.health.late++;
            const t = time <= lastTime ? lastTime + 0.001 : time; lastTime = t; e.voice.trigger(ev.note, t, this.transport.bpm.getValueAtTime(time));
          }, evs.map((x) => [tick(x.beat), x] as [string, Ev]));
        });
      }
      const spans = schedule.clipSpans.filter((c) => c.trackId === tr.id);
      if (spans.length && e.grain && tr.clip) {
        const c = tr.clip; const gp = e.grain;
        lay(`span:${tr.id}`, `${e.sig}|${song.bpm}|${spans.map((s) => `${s.startBeat}/${s.beats}`).join(",")}`, () =>
          new Tone.Part((time, s: { beats: number }) => { try { gp.start(time, c.startSec ?? 0, s.beats * beatSec); } catch { /* not loaded */ } }, spans.map((s) => [tick(s.startBeat), s] as [string, { beats: number }])));
      }
      // Trance gate: chop the track at N sixteenths.
      if (tr.fx?.gate && tr.fx.gate > 0) {
        const step = tr.fx.gate / 4;
        lay(`gate:${tr.id}`, `${e.sig}|${song.bpm}|${step}|${schedule.totalBeats}`, () => {
          const gateEvs: [string, number][] = [];
          for (let b = 0; b < schedule.totalBeats; b += step) gateEvs.push([tick(b), b]);
          return new Tone.Part((time) => {
            e.voice.gate.gain.cancelScheduledValues(time);
            e.voice.gate.gain.setValueAtTime(1, time);
            e.voice.gate.gain.setValueAtTime(0.02, time + step * beatSec * 0.55);
          }, gateEvs);
        });
      }
    }

    if (schedule.automation.length) {
      lay("automation", `${song.bpm}|${JSON.stringify(schedule.automation)}`, () =>
        new Tone.Part((time, a: Schedule["automation"][number]) => {
          const dur = (a.endBeat - a.startBeat) * beatSec;
          if (a.track === "master") this.board.automate(a.param, a.from, a.to, time, time + dur, a.curve);
          else this.entries.get(a.track)?.voice.automate(a.param, a.from, a.to, time, time + dur, a.curve);
        }, schedule.automation.map((a) => [tick(a.startBeat), a] as [string, Schedule["automation"][number]])));
    }

    // Drop craft: "cut" and "riser" sections get a white-noise riser through the final bars.
    const riserEvents: [string, number][] = [];
    for (const s of schedule.sectionStarts) {
      if (s.fill !== "cut" && s.fill !== "riser") continue;
      const lenBeats = Math.min(16, s.beats);
      riserEvents.push([tick(s.startBeat + s.beats - lenBeats - (s.fill === "cut" ? 0.5 : 0)), lenBeats]);
    }
    if (riserEvents.length) {
      lay("riser", `${song.bpm}|${riserEvents.map((r) => r.join("/")).join(",")}`, () => {
        // Each riser its own voice, its envelope set here once rather than mutated inside the callback,
        // so two risers that overlap never share (or rewrite) one envelope.
        const lens = riserEvents.map(([, lenBeats]) => lenBeats * beatSec);
        const voices = lens.map((len, i) => { const v = this.board.riser(i); v.synth.envelope.attack = Math.max(0.1, len - 0.15); v.synth.envelope.decay = 0.1; v.synth.envelope.sustain = 0; return v; });
        return new Tone.Part((time, i: number) => {
          const { synth, hp } = voices[i]; const len = lens[i];
          hp.frequency.setValueAtTime(500, time); hp.frequency.exponentialRampToValueAtTime(7000, time + len);
          synth.triggerAttackRelease(len, time, 0.85);
        }, riserEvents.map(([at], i) => [at, i] as [string, number]));
      });
    }

    // The pump: duck the bus at every kick. Depth and release are master params (records: 5-7 dB, 100-120 ms).
    const m = song.master ?? {};
    const duckFloor = Math.pow(10, -Math.max(0, Math.min(14, m.sidechainDb ?? 6)) / 20);
    const duckRelease = Math.min(beatSec * 0.8, Math.max(0.06, (m.sidechainReleaseMs ?? 120) / 1000));
    const duck = this.board.duck;
    lay("duck", `${duckFloor.toFixed(3)}|${duckRelease.toFixed(3)}|${hashBeats(schedule.kickBeats)}`, () =>
      new Tone.Part((time) => {
        duck.gain.cancelScheduledValues(time);
        duck.gain.setValueAtTime(1, time);
        duck.gain.linearRampToValueAtTime(duckFloor, time + 0.012);
        duck.gain.linearRampToValueAtTime(1, time + 0.012 + duckRelease);
      }, schedule.kickBeats.map((b) => [tick(b), b] as [string, number])));

    // Whatever this record no longer has: its schedule comes down.
    for (const [key, p] of [...this.parts]) if (!kept.has(key)) { try { p.part.stop(); p.part.dispose(); } catch {} this.parts.delete(key); }

    // Tempo rides rather than jumps, so a tempo move is a push and not a stutter.
    if (this.laid && this.transport.bpm.value !== song.bpm) this.transport.bpm.rampTo(song.bpm, 0.05);
    else this.transport.bpm.value = song.bpm;
    this.laid = true;
  }

  /** One track's voice, built ahead of `apply` (which then finds it in place and only tunes it), so an
   *  offline render can build its voices one at a time and give the thread back between them. */
  prepareVoice(tr: Track, song: Song, clips: Clips = new Map(), kit?: Kit, kitId = "") {
    if (this.entries.has(tr.id)) return;
    const buf = clipBuffer(clips, tr.clip);
    this.entries.set(tr.id, this.build(tr, song, buf, kit, this.sigOf(tr, song, buf, kitId)));
  }

  private sigOf(tr: Track, song: Song, buf: AudioBuffer | undefined, kitId: string) { return `${voiceSignature(tr, { kitId, bpm: song.bpm })}|${buf ? "b" : "-"}`; }

  private build(tr: Track, song: Song, buf: AudioBuffer | undefined, kit: Kit | undefined, sig: string): Entry {
    const voice = makeVoice(tr, this.board.buses, buf, kit, this.live);
    const meter = new Tone.Meter({ smoothing: 0.75 });
    if (this.live) { voice.out.connect(meter); this.board.analysis.tracks.set(tr.id, meter); }
    // Warped audio loops: a GrainPlayer stretched to the song tempo, living with its voice.
    let grain: Tone.GrainPlayer | undefined;
    const c = tr.clip;
    if (c && buf && tr.role === "audio" && !c.oneShot) {
      const rate = c.warp !== false && c.bpm ? song.bpm / c.bpm : 1;
      grain = new Tone.GrainPlayer({ url: buf, loop: true, playbackRate: rate, detune: (c.semitones ?? 0) * 100, grainSize: 0.12, overlap: 0.05, loopStart: c.startSec ?? 0 });
      grain.volume.value = c.gainDb ?? 0;
      // The loop is lengthBeats of the clip's own beats in its buffer (60 / song.bpm * rate = 60 / clip bpm), never past its end.
      if (c.lengthBeats) grain.loopEnd = Math.min(buf.duration, (c.startSec ?? 0) + c.lengthBeats * (60 / song.bpm) * rate);
      grain.connect(voice.gate);
    }
    return { voice, sig, meter, grain };
  }

  /** An instrument that is leaving: fade it out under the record, then let it go. */
  private retire(e: Entry) {
    try { e.voice.setVolume(-60); } catch { /* already gone */ }
    try { e.grain?.stop(); } catch { /* never started */ }
    const bury = () => { try { e.grain?.dispose(); } catch {} try { e.voice.dispose(); } catch {} try { e.meter.dispose(); } catch {} };
    if (typeof window === "undefined") bury();   // an offline render has no wall clock to wait on
    else window.setTimeout(bury, Math.ceil(FADE_SEC * 1000) + 60);
  }

  dispose() {
    for (const p of this.parts.values()) { try { p.part.stop(); p.part.dispose(); } catch {} }
    this.parts.clear();
    for (const e of this.entries.values()) { try { e.grain?.dispose(); } catch {} try { e.voice.dispose(); } catch {} try { e.meter.dispose(); } catch {} }
    this.entries.clear();
    this.board.analysis.tracks.clear();
    this.board.dispose();
  }
}
