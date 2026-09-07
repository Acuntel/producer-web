"use client";
// The music, visible: every track a lane, every note a block, the playhead sweeping each
// lane's own loop, a live level per lane, mute and solo on the lane. His eyes, the AI's hands.
import { useEffect, useMemo, useRef } from "react";
import type { Song, Track } from "@/lib/song/types";
import { isMelodic } from "@/lib/song/types";
import type { Levels } from "@/lib/engine";
import { patternFor, audibleTracks } from "@/lib/engine/schedule";
import { planLabel } from "@/lib/song/pattern";
import { colorOf } from "./colors";
import type { LaneMove } from "@/lib/song/moves";

const unit = (db: number, floor = -60) => Math.max(0, Math.min(1, (db - floor) / -floor));

export function TrackLanes({ song, beat, sectionIdx, getLevels, running, onToggle, moves = [] }: { song: Song; beat: number | null; sectionIdx: number; getLevels?: () => Levels | null; running?: boolean; onToggle?: (id: string, what: "mute" | "solo") => void; moves?: LaneMove[] }) {
  const starts = useMemo(() => {
    const byId = new Map(song.sections.map((s) => [s.id, s]));
    let c = 0;
    return song.arrangement.map((id) => { const s = byId.get(id); const r = { id, sec: s, startBeat: c, beats: (s?.bars ?? 0) * 4 }; c += r.beats; return r; });
  }, [song]);
  const cur = sectionIdx >= 0 && sectionIdx < starts.length ? starts[sectionIdx] : null;
  const audible = useMemo(() => audibleTracks(song), [song]);
  const meters = useRef(new Map<string, HTMLSpanElement>());
  const smooth = useRef(new Map<string, number>());
  useEffect(() => {
    if (!getLevels) return;
    let raf = 0;
    const draw = () => {
      const lv = running ? getLevels() : null;
      for (const [id, el] of meters.current) {
        const raw = lv ? unit(lv.tracks[id] ?? -100) : 0;
        const prev = smooth.current.get(id) ?? 0; const v = raw > prev ? raw : prev * 0.88;
        smooth.current.set(id, v); el.style.width = `${Math.round(v * 100)}%`;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [getLevels, running]);

  return (
    <div className="space-y-1">
      {song.tracks.map((tr: Track) => {
        const activeNow = cur?.sec ? cur.sec.active.includes(tr.id) && audible.has(tr.id) : audible.has(tr.id);
        const color = colorOf(tr.role);
        const barNow = beat !== null && cur ? Math.max(0, Math.floor((beat - cur.startBeat) / 4)) : 0;
        const notes = cur?.sec ? patternFor(tr, cur.sec, barNow, song.humanize.seed) : tr.notes;
        const plan = cur?.sec?.variants?.[tr.id];
        const variant = plan && typeof plan !== "string" ? planLabel(plan) : "";
        const melodic = isMelodic(tr.role);
        const pitches = melodic ? notes.map((n) => n[0]) : [];
        const pMin = pitches.length ? Math.min(...pitches) : 0, pMax = pitches.length ? Math.max(...pitches) : 1;
        const span = Math.max(1, pMax - pMin);
        const loop = Math.max(0.25, tr.loopBeats);
        const local = beat !== null && cur && activeNow ? ((beat - cur.startBeat) % loop + loop) % loop : null;
        const autos = cur?.sec?.automation?.filter((a) => a.track === tr.id) ?? [];
        const move = moves.find((m) => m.trackId === tr.id && Date.now() - m.at < 4000);

        return (
          <div key={tr.id} className="flex items-center gap-2 transition-opacity duration-300" style={{ opacity: activeNow ? 1 : 0.35 }}>
            <div className="flex w-[124px] shrink-0 items-center gap-1 sm:w-[150px]">
              <span className="h-6 w-[3px] shrink-0 rounded-full" style={{ background: color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold uppercase tracking-[0.03em] text-ink-2" title={tr.name}>{tr.name}</span>
                <span className="mt-0.5 block h-[3px] w-full overflow-hidden rounded-full bg-s3/80"><span ref={(el) => { if (el) meters.current.set(tr.id, el); else meters.current.delete(tr.id); }} className="block h-full rounded-full" style={{ width: "0%", background: color }} /></span>
              </span>
              {onToggle && (
                <span className="flex shrink-0 gap-0.5">
                  <button onClick={() => onToggle(tr.id, "mute")} aria-pressed={!!tr.mute} aria-label={`Mute ${tr.name}`} className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold leading-none transition-colors ${tr.mute ? "bg-accent text-accent-ink" : "bg-s2 text-ink-3 hover:text-ink"}`}>M</button>
                  <button onClick={() => onToggle(tr.id, "solo")} aria-pressed={!!tr.solo} aria-label={`Solo ${tr.name}`} className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold leading-none transition-colors ${tr.solo ? "bg-cool text-accent-ink" : "bg-s2 text-ink-3 hover:text-ink"}`}>S</button>
                </span>
              )}
            </div>

            <div key={move ? move.at : "lane"} className={`relative h-8 flex-1 overflow-hidden rounded-lg border border-line/35 bg-base/70 ${move ? "lane-land" : ""}`}>
              {Array.from({ length: Math.min(64, Math.ceil(loop)) }, (_, b) => (
                <div key={b} className={`absolute top-0 h-full w-px ${b % 4 === 0 ? "bg-line/70" : "bg-line/30"}`} style={{ left: `${(b / loop) * 100}%` }} />
              ))}
              {tr.role === "audio" && !tr.clip?.oneShot && (
                <div className="absolute inset-y-1 left-0 right-0 rounded" style={{ background: `${color}44` }}>
                  <span className="pl-1.5 text-[10px] leading-6 text-ink">{tr.clip?.name ?? "audio"}{tr.clip?.bpm ? ` · warped ${Math.round(tr.clip.bpm)} to ${song.bpm}` : ""}</span>
                </div>
              )}
              {notes.map((n, i) => {
                const lit = local !== null && local >= n[1] && local < n[1] + Math.max(0.24, n[2]);
                return (
                  <div key={i} className="absolute rounded-[2px] transition-[opacity,box-shadow] duration-75" style={{
                    left: `${(n[1] / loop) * 100}%`, width: `${Math.max((n[2] / loop) * 100, 1.6)}%`,
                    top: melodic ? `${(1 - (n[0] - pMin) / span) * 68 + 10}%` : `${86 - (n[3] / 127) * 72}%`,
                    height: melodic ? "15%" : `${(n[3] / 127) * 72}%`,
                    background: color, opacity: lit ? 1 : 0.32 + (n[3] / 127) * 0.3,
                    boxShadow: lit ? `0 0 8px ${color}, 0 0 2px ${color}` : "none", outline: "1px solid rgb(var(--c-base))",
                  }} />
                );
              })}
              {autos.map((a, i) => (
                <div key={`a${i}`} className="pointer-events-none absolute inset-0" title={`${a.param} ${a.from} to ${a.to}`} style={{ background: `linear-gradient(to ${a.to > a.from ? "right" : "left"}, transparent, ${color}30)` }} />
              ))}
              {variant && <span className="absolute right-1 top-1 rounded bg-base/85 px-1 text-[10px] font-medium leading-4 text-ink-3">{variant}</span>}
              {tr.clip && tr.role !== "audio" && !move && <span className="absolute left-1 top-1 rounded bg-base/85 px-1 text-[10px] font-medium leading-4 text-ink-3" title={tr.clip.name}>sample</span>}
              {move && <span className="absolute left-1 top-1 animate-fade-up rounded bg-accent px-1.5 text-[10px] font-semibold leading-4 text-accent-ink">{move.label}</span>}
              {local !== null && <div className="absolute top-0 h-full w-px bg-ink shadow-[0_0_6px_rgba(255,255,255,0.8)]" style={{ left: `${(local / loop) * 100}%` }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
