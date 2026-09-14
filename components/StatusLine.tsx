"use client";
// One quiet line: the record, its tempo and key, and what this record has cost so far.
import type { Song } from "@/lib/song/types";
import { laneInfo } from "@/lib/brain/laneNames";

export function StatusLine({ song, cost, measured, paused, started }: { song: Song; cost: number; measured?: string | null; paused: boolean; started: boolean }) {
  const lane = laneInfo(song.lane);
  const parts = [song.title, `${song.bpm} BPM`, song.key];
  if (lane) parts.push(lane.name);
  return (
    <div className="tnum flex min-w-0 items-center justify-end gap-x-2.5 text-xs text-ink-3 sm:gap-x-3" data-role="status">
      <span className="min-w-0 truncate">{parts.join(" · ")}</span>
      {measured && <span className="hidden shrink-0 lg:inline">{measured}</span>}
      {started && <span className={`shrink-0 ${paused ? "text-ink-3" : "text-live"}`}>{paused ? "paused" : "playing"}</span>}
      <span className="shrink-0" data-role="cost" title="Brain spend on this record at list prices">${cost.toFixed(2)}</span>
    </div>
  );
}
