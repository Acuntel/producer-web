// The rig: one desk, one voice per track, and a schedule laid down over them.
//
// This is what makes a change audible without a glitch. The desk and the voices
// survive; only the schedule is rebuilt, and a Part makes no sound of its own, so
// tearing one down and laying a new one is silent. A track whose instrument really
// changed gets a new voice under a short fade while the rest of the record plays on.
// The offline render drives the same rig once, so the ears hear exactly what plays.
import * as Tone from "tone";
import type { Song, Track } from "../song/types";
import { scheduleEvents, loopBounds, type Ev, type Schedule } from "./schedule";
import { makeVoice, voiceSignature, type Voice } from "./voices";
import { makeBoard, type Board, type Analysis } from "./board";
import { clipBuffer } from "./clips";
import type { Kit } from "./kits";
import { hitsAddress } from "./steady";
import { sampleKey } from "../samples/manifest";
import { assetHeard } from "./ledger";
import { ownedAt } from "./automation";
import { layRiser, layPump, layGap, layResync, EDGE, type DeskCtx } from "./deskParts";

export type Clips = Map<string, AudioBuffer>;
// The rig's own health: how many note events fired, how many fired late (their time already past when the
// callback ran, which the ear hears as a flam or a dropout), and the thinnest margin seen in milliseconds.
export type Health = { events: number; late: number; minMarginMs: number };

type Transport = ReturnType<typeof Tone.getTransport>;
type Entry = { voice: Voice; sig: string; meter: Tone.Meter; grain?: Tone.GrainPlayer; sound: string | null; heard: boolean };
/** What one apply changed: the parts laid anew and the voices built anew. The ledger's landing row. */
export type Applied = { partsChanged: string[]; voicesRebuilt: string[] };
/** Work that has to wait for the audio clock (a voice leaving after its fade). Live: a wall timer.
 *  The offline replica (replica.ts) replaces it with its own clock so it runs at the same audio time. */
export type Defer = (delaySec: number, fn: () => void) => void;

const wallDefer: Defer = (delaySec, fn) => { if (typeof window === "undefined") fn(); else window.setTimeout(fn, Math.ceil(delaySec * 1000)); };

const FADE_SEC = 0.015;   // a swapped instrument crosses over in fifteen milliseconds
const GATE_FLOOR = 0.02;

export class Rig {
  readonly board: Board;
  readonly health: Health = { events: 0, late: 0, minMarginMs: Infinity };
  schedule: Schedule = { perTrack: new Map(), kickBeats: [], totalBeats: 0, sectionStarts: [], automation: [], clipSpans: [], audible: new Set<string>() };
  private entries = new Map<string, Entry>();
  private parts = new Map<string, { part: Tone.Part; hash: string }>();
  private laid = false;
  defer: Defer = wallDefer;

  constructor(private transport: Transport, destination?: Tone.ToneAudioNode, private live = true) {
    this.board = makeBoard(destination, live);
  }

  get analysis(): Analysis { return this.board.analysis; }
  get voiceById(): Map<string, Voice> { const m = new Map<string, Voice>(); for (const [id, e] of this.entries) m.set(id, e.voice); return m; }

  /** Put this song on the rig: diff the voices, relay the schedule, ramp the desk. Never rebuilds what still fits. */
  apply(song: Song, clips: Clips = new Map(), kit?: Kit, kitId = ""): Applied {
    const applied: Applied = { partsChanged: [], voicesRebuilt: [] };
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
      applied.partsChanged.push(key);
      const part = make(); part.start(0);
      this.parts.set(key, { part, hash });
    };

    // Every change is made at one explicit audio time: now() (the clock plus the lookahead), where the
    // parts laid below start to sound. A parameter a running automation owns at that moment is skipped.
    const at = this.transport.context.now();
    const beatAt = (this.transport.state === "started" ? this.transport.getTicksAtTime(at) : this.transport.ticks) / ppq;
    const owned = this.laid ? ownedAt(schedule.automation, schedule.sectionStarts, beatAt) : new Map();
    this.board.applyMaster(song.master ?? {}, this.laid, at, owned.get("master"));

    // Voices: every track in the song keeps one, playing or muted, so a mute is a schedule and not a rebuild.
    const wanted = new Set(song.tracks.map((t) => t.id));
    for (const [id, e] of [...this.entries]) if (!wanted.has(id)) { this.retire(e, at); this.entries.delete(id); this.board.analysis.tracks.delete(id); }
    for (const tr of song.tracks) {
      const buf = clipBuffer(clips, tr.clip);
      const sig = this.sigOf(tr, song, buf, kitId);
      const have = this.entries.get(tr.id);
      if (have && have.sig === sig) { have.voice.tune(tr, at, owned.get(tr.id)); continue; }
      if (have) this.retire(have, at);
      this.entries.set(tr.id, this.build(tr, song, buf, kit, sig, kitId));
      applied.voicesRebuilt.push(tr.id);
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
            if (!e.heard) this.heard(e, t);
          }, evs.map((x) => [tick(x.beat), x] as [string, Ev]));
        });
      }
      const spans = schedule.clipSpans.filter((c) => c.trackId === tr.id);
      if (spans.length && e.grain && tr.clip) {
        const c = tr.clip; const gp = e.grain;
        lay(`span:${tr.id}`, `${e.sig}|${song.bpm}|${spans.map((s) => `${s.startBeat}/${s.beats}`).join(",")}`, () =>
          new Tone.Part((time, s: { beats: number }) => { try { gp.start(time, c.startSec ?? 0, s.beats * beatSec); if (!e.heard) this.heard(e, time); } catch { /* not loaded */ } }, spans.map((s) => [tick(s.startBeat), s] as [string, { beats: number }])));
      }
      // Trance gate: chop the track at N sixteenths.
      if (tr.fx?.gate && tr.fx.gate > 0) {
        const step = tr.fx.gate / 4;
        lay(`gate:${tr.id}`, `${e.sig}|${song.bpm}|${step}|${schedule.totalBeats}`, () => {
          const gateEvs: [string, number][] = [];
          for (let b = 0; b < schedule.totalBeats; b += step) gateEvs.push([tick(b), b]);
          // Open and close are edges of a few milliseconds from wherever the gate is: a stepped gain is a click.
          const g = e.voice.gate.gain; const open = step * beatSec * 0.55;
          return new Tone.Part((time) => {
            g.cancelAndHoldAtTime(time);
            g.linearRampToValueAtTime(1, time + EDGE);
            g.setValueAtTime(1, time + open);
            g.linearRampToValueAtTime(GATE_FLOOR, time + open + EDGE);
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

    // The desk's own parts: the riser, the pump, the silent gap before a drop, and automation back to base.
    const desk: DeskCtx = { lay, tick, beatSec, song, schedule, board: this.board, voice: (id) => this.entries.get(id)?.voice, loopStart: loopBounds(song, schedule.sectionStarts, schedule.totalBeats).start };
    layRiser(desk); layPump(desk); layGap(desk); layResync(desk);

    // Whatever this record no longer has: its schedule comes down.
    for (const [key, p] of [...this.parts]) if (!kept.has(key)) { try { p.part.stop(); p.part.dispose(); } catch {} this.parts.delete(key); }

    // Tempo rides rather than jumps, so a tempo move is a push and not a stutter.
    if (this.laid && this.transport.bpm.value !== song.bpm) this.transport.bpm.rampTo(song.bpm, 0.05);
    else this.transport.bpm.value = song.bpm;
    this.laid = true;
    return applied;
  }

  // The first hit of a voice that plays a loaded sound, at the moment it is heard. Live rigs only:
  // an offline listen is not the room.
  private heard(e: Entry, t: number) {
    e.heard = true;
    if (!this.live || !e.sound || typeof performance === "undefined") return;
    assetHeard(e.sound, performance.now() + (t - this.transport.context.currentTime) * 1000);
  }

  /** One track's voice, built ahead of `apply` (which then finds it in place and only tunes it), so an
   *  offline render can build its voices one at a time and give the thread back between them. */
  prepareVoice(tr: Track, song: Song, clips: Clips = new Map(), kit?: Kit, kitId = "") {
    if (this.entries.has(tr.id)) return;
    const buf = clipBuffer(clips, tr.clip);
    this.entries.set(tr.id, this.build(tr, song, buf, kit, this.sigOf(tr, song, buf, kitId), kitId));
  }

  private sigOf(tr: Track, song: Song, buf: AudioBuffer | undefined, kitId: string) { return `${voiceSignature(tr, { kitId, bpm: song.bpm })}|${buf ? "b" : "-"}`; }

  private build(tr: Track, song: Song, buf: AudioBuffer | undefined, kit: Kit | undefined, sig: string, kitId = ""): Entry {
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
    // The sound this voice plays, by its ledger key: its own clip, else the kit for a drum.
    const sound = c && buf ? (c.sampleId ? sampleKey(c.sampleId) : c.clipId ?? null) : (["kick", "clap", "snare", "hat", "openhat", "perc"].includes(tr.role) && kit && kitId ? `kit:${kitId}` : null);
    return { voice, sig, meter, grain, sound, heard: false };
  }

  /** An instrument that is leaving: faded out from the audio time the change lands at, and let go only
   *  once that fade has played. It was disposed on a 75 ms wall timer, before its fade had even started. */
  private retire(e: Entry, at: number) {
    try { e.voice.release(at, FADE_SEC); } catch { /* already gone */ }
    try { e.grain?.stop(at + FADE_SEC); } catch { /* never started */ }
    const bury = () => { try { e.grain?.dispose(); } catch {} try { e.voice.dispose(); } catch {} try { e.meter.dispose(); } catch {} };
    this.defer(Math.max(0, at + FADE_SEC - this.transport.context.currentTime) + 0.05, bury);
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
