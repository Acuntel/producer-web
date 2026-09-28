"use client";
// The music, visible and untouchable. One canvas painted from the engine itself: the hits
// the transport will fire, the meters on the live output, the analyser on the master, and
// the loudness the ears measured. It never re-renders React; it reads the engine each frame.
import { useEffect, useMemo, useRef } from "react";
import type { Song } from "@/lib/song/types";
import { isMelodic } from "@/lib/song/types";
import type { Levels, Position, EngineHealth } from "@/lib/engine";
import type { Schedule } from "@/lib/engine/schedule";
import type { MusicFacts } from "@/lib/ears";
import type { LaneMove } from "@/lib/song/moves";
import { colorOf } from "./colors";
import { paint, type Frame, type LaneModel, type SectionModel } from "@/lib/board/paint";

type Reads = {
  getLevels?: () => Levels | null;
  getPosition?: () => Position | null;
  getSchedule?: () => Schedule | null;
  getHealth?: () => EngineHealth | null;
};

const HOLD_MS = 1400;

export function Board({ song, playing, facts, moves = [], ...reads }: { song: Song; playing: boolean; facts?: MusicFacts | null; moves?: LaneMove[] } & Reads) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const live = useRef({ song, playing, facts, moves, reads });
  live.current = { song, playing, facts, moves, reads };

  // The static half of the model: one pass per record, not per frame.
  const model = useMemo(() => {
    const lanes: LaneModel[] = song.tracks.slice(0, 16).map((t) => {
      const all = [...t.notes, ...Object.values(t.patterns ?? {}).flat()];
      const pitches = all.map((n) => n[0]);
      const melodic = isMelodic(t.role);
      return {
        id: t.id, name: t.name, role: t.role, color: colorOf(t.role), melodic,
        pMin: pitches.length ? Math.min(...pitches) : 0,
        pMax: pitches.length ? Math.max(...pitches) : 1,
        audio: t.role === "audio" && !t.clip?.oneShot,
        clipName: t.clip?.name,
      };
    });
    const byId = new Map(song.sections.map((s) => [s.id, s]));
    let cursor = 0;
    const sections: SectionModel[] = song.arrangement.map((id) => {
      const s = byId.get(id);
      const m = { id, name: s?.name ?? id, bars: s?.bars ?? 0, startBeat: cursor, beats: (s?.bars ?? 0) * 4, energy: s?.energy ?? 0.6, label: s?.name ?? id };
      cursor += m.beats;
      return m;
    });
    return { lanes, sections, totalBeats: cursor || 1 };
  }, [song]);
  const modelRef = useRef(model); modelRef.current = model;
  const shown = song.tracks.length > 0;

  useEffect(() => {
    const cv = canvas.current, wrap = box.current;
    if (!cv || !wrap) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let w = 0, h = 0, dpr = 1;
    const size = () => {
      const r = wrap.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(120, Math.round(r.width)); h = Math.max(120, Math.round(r.height));
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(wrap);

    const hold = { master: [-100, -100] as [number, number], at: [0, 0], tracks: {} as Record<string, number>, trackAt: {} as Record<string, number> };
    const rms: number[] = [];
    const slow = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, last = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (slow && now - last < 90) return;   // reduced motion: the numbers still move, the paint does not race
      last = now;
      const { song: sg, playing: on, facts: f, moves: mv, reads: r } = live.current;
      const m = modelRef.current;
      const lv = on ? r.getLevels?.() ?? null : null;
      const pos = on ? r.getPosition?.() ?? null : null;
      const sched = r.getSchedule?.() ?? null;
      const master: [number, number] = lv ? [lv.master[0], lv.master[1]] : [-100, -100];
      // The hold is on the real sample peak, so PEAK says what the loudest sample did, not a smoothed level.
      const sample: [number, number] = lv ? [lv.peak[0], lv.peak[1]] : [-100, -100];
      for (let i = 0; i < 2; i++) {
        if (sample[i] >= hold.master[i] || now - hold.at[i] > HOLD_MS) { hold.master[i] = sample[i]; hold.at[i] = now; }
      }
      const tracks = lv?.tracks ?? {};
      for (const [id, db] of Object.entries(tracks)) {
        if (db >= (hold.tracks[id] ?? -100) || now - (hold.trackAt[id] ?? 0) > HOLD_MS) { hold.tracks[id] = db; hold.trackAt[id] = now; }
      }
      // Three seconds of level, averaged as power (decibels do not average), so a quiet bar does not drag it down.
      const lvl = Math.max(master[0], master[1]);
      if (Number.isFinite(lvl)) { rms.push(Math.pow(10, lvl / 10)); if (rms.length > 180) rms.shift(); }
      const mean = rms.length ? 10 * Math.log10(rms.reduce((a, b) => a + b, 0) / rms.length + 1e-12) : -100;

      const fr: Frame = {
        lanes: m.lanes, sections: m.sections, totalBeats: m.totalBeats,
        bpm: sg.bpm, key: sg.key,
        beat: pos?.beat ?? null,
        sectionIdx: pos?.index ?? -1,
        events: sched?.perTrack ?? new Map(),
        audible: sched?.audible ?? new Set(sg.tracks.filter((t) => !t.mute).map((t) => t.id)),
        master, peakHold: [hold.master[0], hold.master[1]], rms3s: mean,
        tracks, trackHold: hold.tracks,
        spectrum: lv?.spectrum ?? null,
        lufs: f?.loudness.integrated ?? null,
        measuredBpm: f?.tempo.bpm ?? null,
        energyCurve: f?.structure.energy ?? null,
        dropAtBeat: f?.structure.dropAt != null ? (f.structure.dropAt * sg.bpm) / 60 : null,
        late: r.getHealth?.()?.late ?? 0,
        cacheMb: 0,
        moves: mv,
        now: Date.now(),
      };
      paint(ctx, w, h, fr);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  // Mounted once for as long as the canvas is on screen: a move changes what the frame reads (the refs),
  // never the loop. Tearing it down on every move dropped the meter holds and a frame each time.
  }, [shown]);

  if (!shown) return null;
  const summary = `${song.tracks.length} tracks, ${song.sections.length} sections, ${song.bpm} BPM, ${song.key}. ${model.lanes.map((l) => l.name).join(", ")}.`;
  return (
    // The canvas is taken out of the flow: sized from its box, it can never push the page wider than the screen.
    <div ref={box} className="relative min-h-[240px] w-full min-w-0 flex-1 select-none overflow-hidden rounded-2xl bg-s1/40 ring-1 ring-inset ring-line/30" data-role="field">
      <canvas ref={canvas} role="img" aria-label={`The record: ${summary}`} className="absolute inset-0 block h-full w-full" />
    </div>
  );
}
