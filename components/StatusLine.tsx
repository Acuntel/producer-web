"use client";
// One quiet line: the record, its tempo and key, and what this record has cost so far.
import type { Song } from "@/lib/song/types";
import { laneInfo } from "@/lib/brain/laneNames";

export function StatusLine({ song, cost, measured, paused, started }: { song: Song; cost: number; measured?: string | null; paused: boolean; started: boolean }) {
  const lane = laneInfo(song.lane);
  const parts = [song.title, `${song.bpm} BPM`, song.key];
  if (lane) parts.push(lane.name);
  if (measured) parts.push(measured);
  return (
    <div className="tnum flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-ink-3" data-role="status">
      <span className="truncate">{parts.join(" · ")}</span>
      {started && <span className={paused ? "text-ink-3" : "text-live"}>{paused ? "paused" : "playing"}</span>}
      <span data-role="cost" title="Brain spend on this record at list prices">${cost.toFixed(2)}</span>
    </div>
  );
}
