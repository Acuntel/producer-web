"use client";
// The arrangement as a timeline: sections sized by their bars, energy drawn as fill,
// bar ruler underneath, the playhead sweeping across, the loop region marked. Click a
// section to jump there. The playhead is moved imperatively so it never stutters.
import { useEffect, useRef } from "react";
import type { Song } from "@/lib/song/types";
import { Icon } from "./Icon";

export function Timeline({ song, beat, nowSection, playing, onJump }: { song: Song; beat: number | null; nowSection: number; playing: boolean; onJump?: (id: string) => void }) {
  const total = song.arrangement.reduce((a, id) => a + (song.sections.find((s) => s.id === id)?.bars ?? 0) * 4, 0) || 1;
  const head = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!head.current) return;
    const pct = beat === null ? 0 : Math.max(0, Math.min(100, (beat / total) * 100));
    head.current.style.left = `${pct}%`;
    head.current.style.opacity = beat === null ? "0" : "1";
  }, [beat, total]);
  const loopId = song.loop?.section;
  const bars = total / 4;
  const ticks: number[] = []; for (let b = 0; b <= bars; b += 8) ticks.push(b);

  return (
    <div className="select-none">
      <div className="relative">
        <div className="flex h-[58px] gap-px overflow-hidden rounded-xl bg-s3/40 p-px" role="group" aria-label="Arrangement">
          {song.arrangement.map((sid, i) => {
            const sec = song.sections.find((s) => s.id === sid);
            if (!sec) return null;
            const energy = sec.energy ?? 0.6;
            const isNow = i === nowSection && playing;
            const looped = loopId === sec.id || loopId === sec.name;
            return (
              <button
                key={`${sid}-${i}`}
                onClick={() => onJump?.(sec.id)}
                aria-current={isNow ? "true" : undefined}
                title={`${sec.name} · ${sec.bars} bars${sec.fill && sec.fill !== "none" ? ` · ${sec.fill}` : ""}${sec.automation?.length ? " · automation" : ""}`}
                style={{ flexGrow: sec.bars * 4, flexBasis: 0 }}
                className={`group relative min-w-0 overflow-hidden text-left transition-colors first:rounded-l-[11px] last:rounded-r-[11px]
                  ${isNow ? "bg-accent/90 text-accent-ink" : looped ? "bg-cool/20 text-cool" : "bg-s2 text-ink-2 hover:bg-s3 hover:text-ink"}`}
              >
                <span aria-hidden className={`absolute inset-x-0 bottom-0 ${isNow ? "bg-accent-ink/15" : looped ? "bg-cool/25" : "bg-ink/[0.07]"}`} style={{ height: `${Math.round(energy * 100)}%` }} />
                {sec.fill && sec.fill !== "none" && <span aria-hidden className={`absolute bottom-0 right-0 top-0 w-[3px] ${isNow ? "bg-accent-ink/40" : "bg-accent/60"}`} title={sec.fill} />}
                <span className="relative flex h-full flex-col justify-between px-2 py-1.5">
                  <span className="flex items-center gap-1 truncate text-xs font-semibold uppercase tracking-wide">
                    <span className="truncate">{sec.name}</span>
                    {looped && <Icon name="loop" size={11} className="shrink-0" />}
                  </span>
                  <span className={`tnum text-[11px] ${isNow ? "text-accent-ink/75" : "text-ink-3"}`}>{sec.bars}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div ref={head} aria-hidden className="pointer-events-none absolute -top-1 bottom-[-1px] w-px bg-ink shadow-[0_0_8px_rgba(255,255,255,0.9)] transition-opacity" style={{ left: 0, opacity: 0 }}>
          <span className="absolute -left-[4px] -top-[3px] h-[7px] w-[9px] rounded-b-sm bg-ink" />
        </div>
      </div>
      <div className="relative mt-1 h-4">
        {ticks.map((b) => (
          <span key={b} className="tnum absolute -translate-x-1/2 text-[10px] text-ink-3 first:translate-x-0 last:-translate-x-full" style={{ left: `${(b / bars) * 100}%` }}>{b + 1}</span>
        ))}
      </div>
    </div>
  );
}
