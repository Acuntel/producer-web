"use client";
// The music, visible: every track a lane, every note a block, the playhead
// sweeping each lane's own loop, automation drawn as a ramp. His eyes, the AI's hands.
import { useMemo } from "react";
import type { Song, Track } from "@/lib/song/types";
import { isMelodic } from "@/lib/song/types";
import { patternFor, audibleTracks } from "@/lib/engine/schedule";
import { planLabel } from "@/lib/song/pattern";
import { colorOf } from "./colors";

export function TrackLanes({ song, beat, sectionIdx }: { song: Song; beat: number | null; sectionIdx: number }) {
  const starts = useMemo(() => {
    const byId = new Map(song.sections.map((s) => [s.id, s]));
    let c = 0;
    return song.arrangement.map((id) => {
      const s = byId.get(id);
      const r = { id, sec: s, startBeat: c, beats: (s?.bars ?? 0) * 4 };
      c += r.beats;
      return r;
    });
  }, [song]);
  const cur = sectionIdx >= 0 && sectionIdx < starts.length ? starts[sectionIdx] : null;
  const audible = useMemo(() => audibleTracks(song), [song]);

  return (
    <div className="space-y-1">
      {song.tracks.map((tr: Track) => {
        const activeNow = cur?.sec ? cur.sec.active.includes(tr.id) && audible.has(tr.id) : audible.has(tr.id);
        const color = colorOf(tr.role);
        const barNow = beat !== null && cur ? Math.max(0, Math.floor((beat - cur.startBeat) / 4)) : 0;
        const notes = cur?.sec ? patternFor(tr, cur.sec, barNow, song.humanize.seed) : tr.notes;
        // Only real playlists earn a chip ("A B A C", "fill every 8"); a single named pattern is already visible as its notes.
        const plan = cur?.sec?.variants?.[tr.id];
        const variant = plan && typeof plan !== "string" ? planLabel(plan) : "";
        const melodic = isMelodic(tr.role);
        const pitches = melodic ? notes.map((n) => n[0]) : [];
        const pMin = pitches.length ? Math.min(...pitches) : 0;
        const pMax = pitches.length ? Math.max(...pitches) : 1;
        const span = Math.max(1, pMax - pMin);
        const loop = Math.max(0.25, tr.loopBeats);
        const local = beat !== null && cur && activeNow ? ((beat - cur.startBeat) % loop + loop) % loop : null;
        const autos = cur?.sec?.automation?.filter((a) => a.track === tr.id) ?? [];

        return (
          <div key={tr.id} className="flex items-center gap-2.5 transition-opacity duration-300" style={{ opacity: activeNow ? 1 : 0.3 }}>
            <span className="flex w-[92px] shrink-0 items-center gap-1.5 sm:w-[112px]" title={tr.name}>
              <span className="h-2.5 w-[3px] shrink-0 rounded-full" style={{ background: color }} />
              <span className="truncate text-xs font-semibold uppercase tracking-[0.03em] text-ink-2">{tr.name}</span>
              {tr.solo && <span className="shrink-0 text-[10px] font-bold text-cool">S</span>}
              {tr.mute && <span className="shrink-0 text-[10px] font-bold text-accent">M</span>}
            </span>

            <div className="relative h-8 flex-1 overflow-hidden rounded-lg border border-line/35 bg-base/70">
              {Array.from({ length: Math.min(64, Math.ceil(loop)) }, (_, b) => (
                <div key={b} className={`absolute top-0 h-full w-px ${b % 4 === 0 ? "bg-line/70" : "bg-line/30"}`} style={{ left: `${(b / loop) * 100}%` }} />
              ))}

              {tr.role === "audio" && !tr.clip?.oneShot && (
                <div className="absolute inset-y-1 left-0 right-0 rounded" style={{ background: `${color}44` }}>
                  <span className="pl-1.5 text-[10px] leading-6 text-ink">{tr.clip?.name ?? "audio"}{tr.clip?.bpm ? ` · warped ${tr.clip.bpm} to ${song.bpm}` : ""}</span>
                </div>
              )}

              {notes.map((n, i) => {
                const lit = local !== null && local >= n[1] && local < n[1] + Math.max(0.24, n[2]);
                return (
                  <div
                    key={i}
                    className="absolute rounded-[2px] transition-[opacity,box-shadow] duration-75"
                    style={{
                      left: `${(n[1] / loop) * 100}%`,
                      width: `${Math.max((n[2] / loop) * 100, 1.6)}%`,
                      top: melodic ? `${(1 - (n[0] - pMin) / span) * 68 + 10}%` : `${86 - (n[3] / 127) * 72}%`,
                      height: melodic ? "15%" : `${(n[3] / 127) * 72}%`,
                      background: color,
                      opacity: lit ? 1 : 0.32 + (n[3] / 127) * 0.3,
                      boxShadow: lit ? `0 0 8px ${color}, 0 0 2px ${color}` : "none",
                      outline: "1px solid rgb(var(--c-base))",
                    }}
                  />
                );
              })}

              {autos.map((a, i) => {
                const up = a.to > a.from;
                return (
                  <div
                    key={`a${i}`}
                    className="pointer-events-none absolute inset-0"
                    title={`${a.param} ${a.from} to ${a.to}`}
                    style={{ background: `linear-gradient(to ${up ? "right" : "left"}, transparent, ${color}30)` }}
                  />
                );
              })}

              {variant && (
                <span className="absolute right-1 top-1 rounded bg-base/85 px-1 text-[10px] font-medium leading-4 text-ink-3">{variant}</span>
              )}

              {local !== null && (
                <div className="absolute top-0 h-full w-px bg-ink shadow-[0_0_6px_rgba(255,255,255,0.8)]" style={{ left: `${(local / loop) * 100}%` }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
