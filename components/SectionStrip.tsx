"use client";
// The arrangement: sections as blocks sized by bars, height by energy, loop region marked.
import type { Song } from "@/lib/song/types";

export function SectionStrip({ song, nowSection, playing, onJump }: { song: Song; nowSection: number; playing: boolean; onJump?: (id: string) => void }) {
  const loopId = song.loop?.section;
  return (
    <div className="mt-3 flex items-end gap-1 overflow-x-auto pb-1">
      {song.arrangement.map((sid, i) => {
        const sec = song.sections.find((s) => s.id === sid);
        if (!sec) return null;
        const energy = sec.energy ?? 0.6;
        const isNow = i === nowSection && playing;
        const looped = loopId === sec.id || loopId === sec.name;
        return (
          <button key={i} onClick={() => onJump?.(sec.id)} title={`${sec.name} · ${sec.bars} bars${sec.fill && sec.fill !== "none" ? ` · ${sec.fill}` : ""}${sec.automation?.length ? " · automation" : ""}`}
            className={`shrink-0 rounded-lg px-2.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${isNow ? "bg-amber-500 text-black" : looped ? "bg-sky-900 text-sky-200 ring-1 ring-sky-400" : "bg-zinc-800 text-zinc-500"}`}
            style={{ minWidth: `${sec.bars * 7}px`, height: `${22 + energy * 18}px` }}>
            {sec.name}{looped ? " ↻" : ""}
          </button>
        );
      })}
    </div>
  );
}
