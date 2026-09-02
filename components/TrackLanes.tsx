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
    <div className="mt-3 space-y-1.5">
      {song.tracks.map((tr: Track) => {
        const activeNow = cur?.sec ? cur.sec.active.includes(tr.id) && audible.has(tr.id) : audible.has(tr.id);
        const color = colorOf(tr.role);
        const barNow = beat !== null && cur ? Math.max(0, Math.floor((beat - cur.startBeat) / 4)) : 0;
        const notes = cur?.sec ? patternFor(tr, cur.sec, barNow, song.humanize.seed) : tr.notes;
        const variant = planLabel(cur?.sec?.variants?.[tr.id]);
        const melodic = isMelodic(tr.role);
        const pitches = melodic ? notes.map((n) => n[0]) : [];
        const pMin = pitches.length ? Math.min(...pitches) : 0;
        const pMax = pitches.length ? Math.max(...pitches) : 1;
        const span = Math.max(1, pMax - pMin);
        const loop = Math.max(0.25, tr.loopBeats);
        const local = beat !== null && cur && activeNow ? ((beat - cur.startBeat) % loop + loop) % loop : null;
        const autos = cur?.sec?.automation?.filter((a) => a.track === tr.id) ?? [];
        return (
          <div key={tr.id} className="flex items-center gap-2" style={{ opacity: activeNow ? 1 : 0.28 }}>
            <span className="w-16 shrink-0 truncate text-[10px] font-bold uppercase tracking-wide" style={{ color }} title={tr.name}>
              {tr.name}{tr.solo ? " S" : ""}{tr.mute ? " M" : ""}
            </span>
            <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-zinc-950/70">
              {Array.from({ length: Math.min(64, Math.ceil(loop)) }, (_, b) => (
                <div key={b} className="absolute top-0 h-full w-px bg-zinc-800" style={{ left: `${(b / loop) * 100}%` }} />
              ))}
              {tr.role === "audio" && !tr.clip?.oneShot && (
                <div className="absolute inset-y-1 left-0 right-0 rounded-sm" style={{ background: `${color}55` }}>
                  <span className="pl-1 text-[9px] text-white/80">{tr.clip?.name ?? "audio"}{tr.clip?.bpm ? ` · warped ${tr.clip.bpm}→${song.bpm}` : ""}</span>
                </div>
              )}
              {notes.map((n, i) => {
                const lit = local !== null && local >= n[1] && local < n[1] + Math.max(0.24, n[2]);
                return (
                  <div key={i} className="absolute rounded-[2px]" style={{
                    left: `${(n[1] / loop) * 100}%`,
                    width: `${Math.max((n[2] / loop) * 100, 1.4)}%`,
                    top: melodic ? `${(1 - (n[0] - pMin) / span) * 70 + 8}%` : `${86 - (n[3] / 127) * 74}%`,
                    height: melodic ? "22%" : `${(n[3] / 127) * 74}%`,
                    background: color,
                    opacity: lit ? 1 : 0.35 + (n[3] / 127) * 0.35,
                    boxShadow: lit ? `0 0 6px ${color}` : "none",
                  }} />
                );
              })}
              {autos.map((a, i) => {
                const up = a.to > a.from;
                return <div key={`a${i}`} className="pointer-events-none absolute inset-x-0 bottom-0 h-full" title={`${a.param} ${a.from} → ${a.to}`}
                  style={{ background: `linear-gradient(to ${up ? "right" : "left"}, transparent, ${color}33)` }} />;
              })}
              {variant && <span className="absolute right-1 top-0.5 rounded bg-black/50 px-1 text-[9px] text-zinc-300">{variant}</span>}
              {local !== null && <div className="absolute top-0 h-full w-[2px] bg-white/80" style={{ left: `${(local / loop) * 100}%` }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
