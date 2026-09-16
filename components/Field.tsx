"use client";
// The music, visible and untouchable. Sections along the top with the playhead; below,
// every track a lane whose hits light up as they fire. No mute, no solo, no faders:
// the producer moves things here, you watch them move.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Song, Track } from "@/lib/song/types";
import { isMelodic } from "@/lib/song/types";
import type { Levels } from "@/lib/engine";
import { patternFor, audibleTracks } from "@/lib/engine/schedule";
import { colorOf } from "./colors";
import type { LaneMove } from "@/lib/song/moves";

const unit = (db: number, floor = -60) => Math.max(0, Math.min(1, (db - floor) / -floor));

export function Field({ song, beat, sectionIdx, playing, getLevels, moves = [] }: { song: Song; beat: number | null; sectionIdx: number; playing: boolean; getLevels?: () => Levels | null; moves?: LaneMove[] }) {
  const starts = useMemo(() => {
    const byId = new Map(song.sections.map((s) => [s.id, s]));
    let c = 0;
    return song.arrangement.map((id) => { const s = byId.get(id); const r = { id, sec: s, startBeat: c, beats: (s?.bars ?? 0) * 4 }; c += r.beats; return r; });
  }, [song]);
  const total = starts.reduce((a, s) => a + s.beats, 0) || 1;
  const cur = sectionIdx >= 0 && sectionIdx < starts.length ? starts[sectionIdx] : null;
  const audible = useMemo(() => audibleTracks(song), [song]);
  const head = useRef<HTMLDivElement>(null);
  // The strip's width decides which sections can carry their name; a label never truncates, it steps aside.
  const strip = useRef<HTMLDivElement>(null);
  const [stripW, setStripW] = useState(0);
  useEffect(() => {
    const el = strip.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setStripW(e.contentRect.width)); ro.observe(el); setStripW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const meters = useRef(new Map<string, HTMLSpanElement>());
  const smooth = useRef(new Map<string, number>());

  useEffect(() => {
    if (!head.current) return;
    const pct = beat === null ? 0 : Math.max(0, Math.min(100, (beat / total) * 100));
    head.current.style.left = `${pct}%`; head.current.style.opacity = beat === null ? "0" : "1";
  }, [beat, total]);
  useEffect(() => {
    if (!getLevels) return;
    let raf = 0;
    const draw = () => {
      const lv = playing ? getLevels() : null;
      for (const [id, el] of meters.current) {
        const raw = lv ? unit(lv.tracks[id] ?? -100) : 0;
        const prev = smooth.current.get(id) ?? 0; const v = raw > prev ? raw : prev * 0.88;
        smooth.current.set(id, v); el.style.opacity = `${0.25 + v * 0.75}`;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [getLevels, playing]);

  if (song.tracks.length === 0) return null;
  const barNowInSection = beat !== null && cur ? Math.max(0, Math.floor((beat - cur.startBeat) / 4)) + 1 : null;
  const next = cur && sectionIdx + 1 < starts.length ? starts[sectionIdx + 1] : null;
  const caption = cur?.sec
    ? `${cur.sec.name}${barNowInSection ? ` · bar ${Math.min(barNowInSection, cur.sec.bars)} of ${cur.sec.bars}` : ""}${next?.sec ? ` · then ${next.sec.name}` : ""}`
    : `${starts.length} sections · ${Math.round(total / 4)} bars`;

  return (
    <div className="select-none" data-role="field">
      {/* The arrangement: a strip of sections sized by length and shaded by energy, the playhead over it, and a caption
          that always reads in full. Labels live in the strip only where a section is wide enough to carry one. */}
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-xs font-medium text-ink-2" data-role="arrangement-caption">{caption}</span>
        <span className="tnum shrink-0 text-xs text-ink-3">{song.bpm} BPM</span>
      </div>
      <div className="relative">
        <div ref={strip} className="flex h-8 gap-[3px] overflow-hidden rounded-lg" aria-label="Arrangement">
          {starts.map((s, i) => {
            if (!s.sec) return null;
            const isNow = i === sectionIdx && playing;
            const energy = s.sec.energy ?? 0.6;
            const px = stripW ? (s.beats / total) * stripW : 0;
            const fits = px >= s.sec.name.length * 7.6 + 18;   // 12px caps at 0.08em tracking, plus the padding
            return (
              <div key={`${s.id}-${i}`} style={{ flexGrow: s.beats, flexBasis: 0 }} aria-current={isNow ? "true" : undefined} title={`${s.sec.name} · ${s.sec.bars} bars`}
                className={`relative min-w-[6px] overflow-hidden rounded-md transition-colors duration-300 ${isNow ? "bg-live text-accent-ink" : "bg-s2 text-ink-3"}`}>
                <span aria-hidden className={`absolute inset-x-0 bottom-0 ${isNow ? "bg-accent-ink/20" : "bg-ink/[0.07]"}`} style={{ height: `${Math.round(energy * 100)}%` }} />
                {fits && <span className="relative block whitespace-nowrap px-2 text-xs font-semibold uppercase leading-8 tracking-[0.08em]">{s.sec.name}</span>}
              </div>
            );
          })}
        </div>
        <div ref={head} aria-hidden className="pointer-events-none absolute -top-1 bottom-[-3px] w-px bg-ink shadow-[0_0_10px_rgba(255,255,255,0.9)] transition-opacity" style={{ left: 0, opacity: 0 }} />
      </div>

      <div className="mt-2 space-y-1">
        {song.tracks.slice(0, 14).map((tr: Track) => {
          const activeNow = cur?.sec ? cur.sec.active.includes(tr.id) && audible.has(tr.id) : audible.has(tr.id);
          const color = colorOf(tr.role);
          const barNow = beat !== null && cur ? Math.max(0, Math.floor((beat - cur.startBeat) / 4)) : 0;
          const notes = cur?.sec ? patternFor(tr, cur.sec, barNow, song.humanize.seed) : tr.notes;
          const melodic = isMelodic(tr.role);
          const pitches = melodic ? notes.map((n) => n[0]) : [];
          const pMin = pitches.length ? Math.min(...pitches) : 0, pMax = pitches.length ? Math.max(...pitches) : 1;
          const span = Math.max(1, pMax - pMin);
          const loop = Math.max(0.25, tr.loopBeats);
          const local = beat !== null && cur && activeNow ? ((beat - cur.startBeat) % loop + loop) % loop : null;
          const move = moves.find((m) => m.trackId === tr.id && Date.now() - m.at < 4000);
          return (
            <div key={tr.id} className="flex items-center gap-2.5 transition-opacity duration-300" style={{ opacity: activeNow ? 1 : 0.32 }}>
              <div className="flex w-[96px] shrink-0 items-center gap-2 sm:w-[124px]">
                <span ref={(el) => { if (el) meters.current.set(tr.id, el); else meters.current.delete(tr.id); }} className="h-2 w-2 shrink-0 rounded-full" style={{ background: color, opacity: 0.25, boxShadow: `0 0 8px ${color}` }} />
                <span className="truncate text-xs font-medium text-ink-2 sm:text-[13px]" title={tr.name}>{tr.name}</span>
              </div>
              <div key={move ? move.at : "lane"} className={`relative h-7 flex-1 overflow-hidden rounded-md bg-s1/70 ring-1 ring-inset ring-line/30 ${move ? "lane-land" : ""}`}>
                {Array.from({ length: Math.min(32, Math.ceil(loop)) }, (_, b) => (
                  b % 4 === 0 && b > 0 ? <div key={b} className="absolute top-0 h-full w-px bg-line/40" style={{ left: `${(b / loop) * 100}%` }} /> : null
                ))}
                {tr.role === "audio" && !tr.clip?.oneShot && (
                  <div className="absolute inset-y-1 left-0 right-0 rounded" style={{ background: `${color}44` }}><span className="pl-1.5 text-xs leading-5 text-ink">{tr.clip?.name ?? "audio"}</span></div>
                )}
                {notes.map((n, i) => {
                  const lit = local !== null && local >= n[1] && local < n[1] + Math.max(0.24, n[2]);
                  return (
                    <div key={i} className="absolute rounded-[2px] transition-[opacity,box-shadow] duration-75" style={{
                      left: `${(n[1] / loop) * 100}%`, width: `${Math.max((n[2] / loop) * 100, 1.8)}%`,
                      top: melodic ? `${(1 - (n[0] - pMin) / span) * 66 + 12}%` : `${88 - (n[3] / 127) * 74}%`,
                      height: melodic ? "16%" : `${(n[3] / 127) * 74}%`,
                      background: color, opacity: lit ? 1 : 0.3 + (n[3] / 127) * 0.3,
                      boxShadow: lit ? `0 0 10px ${color}, 0 0 2px ${color}` : "none",
                    }} />
                  );
                })}
                {move && <span className="absolute left-1 top-1 animate-fade-up rounded bg-live px-1.5 text-xs font-semibold leading-4 text-accent-ink">{move.label}</span>}
                {local !== null && <div className="absolute top-0 h-full w-px bg-ink shadow-[0_0_6px_rgba(255,255,255,0.8)]" style={{ left: `${(local / loop) * 100}%` }} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
