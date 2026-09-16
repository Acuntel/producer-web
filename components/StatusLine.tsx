"use client";
// One quiet line in three groups: the record, its tempo and key and lane, and the state with the spend.
// The phone keeps the title, the state dot and the spend.
import type { Song } from "@/lib/song/types";
import { laneInfo } from "@/lib/brain/laneNames";

export function StatusLine({ song, cost, measured, paused, started }: { song: Song; cost: number; measured?: string | null; paused: boolean; started: boolean }) {
  const lane = laneInfo(song.lane);
  return (
    <div className="tnum flex min-w-0 items-center justify-end gap-2 text-xs sm:gap-3" data-role="status">
      <span className="min-w-0 truncate text-sm font-semibold text-ink">{song.title}</span>
      <span className="hidden shrink-0 text-ink-3 sm:inline">{song.bpm} BPM · {song.key}{lane ? ` · ${lane.name}` : ""}</span>
      {measured && <span className="hidden shrink-0 text-ink-3 lg:inline">{measured}</span>}
      {started && (
        <span className="pill shrink-0" aria-label={paused ? "Paused" : "Playing"}>
          <span className={`dot ${paused ? "bg-ink-3" : "bg-live shadow-[0_0_8px_rgb(57_255_136/0.9)]"}`} />
          <span className="hidden sm:inline">{paused ? "paused" : "playing"}</span>
        </span>
      )}
      <span className="pill shrink-0" data-role="cost" title="Brain spend on this record at list prices">${cost.toFixed(2)}</span>
    </div>
  );
}
