"use client";
// The arrangement: sections as blocks sized by bars, height by energy, loop region marked.
// Scrolls with faded edges — it used to hard-clip the last chip and read as broken.
import { useEffect, useRef } from "react";
import type { Song } from "@/lib/song/types";
import { Icon } from "./Icon";
import { ScrollX } from "./ui";

export function SectionStrip({
  song, nowSection, playing, onJump,
}: { song: Song; nowSection: number; playing: boolean; onJump?: (id: string) => void }) {
  const loopId = song.loop?.section;
  const nowRef = useRef<HTMLButtonElement>(null);

  // Follow the song: the section that is playing is never left under the fade.
  useEffect(() => {
    if (playing) nowRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [nowSection, playing]);

  return (
    <ScrollX label="Arrangement" className="items-end">
      {song.arrangement.map((sid, i) => {
        const sec = song.sections.find((s) => s.id === sid);
        if (!sec) return null;
        const energy = sec.energy ?? 0.6;
        const isNow = i === nowSection && playing;
        const looped = loopId === sec.id || loopId === sec.name;
        return (
          <button
            key={`${sid}-${i}`}
            ref={isNow ? nowRef : undefined}
            onClick={() => onJump?.(sec.id)}
            aria-current={isNow ? "true" : undefined}
            title={`${sec.name} · ${sec.bars} bars${sec.fill && sec.fill !== "none" ? ` · ${sec.fill}` : ""}${sec.automation?.length ? " · automation" : ""}`}
            className={`group relative flex shrink-0 flex-col justify-end overflow-hidden rounded-lg px-2.5 pb-1.5 pt-2
              text-left transition-[background-color,color,transform] duration-150 ease-snap active:scale-[0.97]
              ${isNow ? "bg-accent text-accent-ink" : looped ? "bg-cool/15 text-cool ring-1 ring-cool/40" : "bg-s2 text-ink-2 hover:bg-s3 hover:text-ink"}`}
            style={{ minWidth: `${Math.max(66, sec.bars * 8)}px`, height: `${34 + energy * 22}px` }}
          >
            {/* Energy is drawn, not just implied by height. */}
            <span
              aria-hidden
              className={`absolute inset-x-0 bottom-0 ${isNow ? "bg-accent-ink/15" : "bg-ink/[0.07]"}`}
              style={{ height: `${Math.round(energy * 100)}%` }}
            />
            <span className="relative flex items-center gap-1 text-xs font-semibold uppercase tracking-wide">
              <span className="truncate">{sec.name}</span>
              {looped && <Icon name="loop" size={11} className="shrink-0" />}
            </span>
            <span className={`tnum relative text-xs ${isNow ? "text-accent-ink/75" : "text-ink-3"}`}>{sec.bars} bars</span>
          </button>
        );
      })}
    </ScrollX>
  );
}
