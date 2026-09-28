"use client";
// The bottom progress bar, on the real state of the work: queued, working, "It lands on bar 17", or "I am waiting
// for your call." while a question is open. A named refine shows its steps: the bar fills for the steps done, and the
// running one breathes, so it never reads as finished while it is still thinking.
import { useEffect, useState } from "react";
import { studioJobs, jobLine, type Job } from "@/lib/jobs/queue";
import type { RolloutState } from "@/hooks/useRollout";

const FILL: Record<string, number> = { queued: 0.08, running: 0.45, landing: 0.85, landed: 1, failed: 1, cancelled: 1 };

export function JobBar({ waiting, rollout }: { waiting: boolean; rollout: RolloutState }) {
  const [jobs, setJobs] = useState<Job[]>(() => studioJobs.snapshot());
  useEffect(() => studioJobs.onChange(setJobs), []);
  const live = jobs.find((j) => j.state === "running" || j.state === "landing") ?? jobs.find((j) => j.state === "queued") ?? null;
  const behind = jobs.filter((j) => j.state === "queued" && j !== live).length;
  if (!live && !waiting && !rollout) return null;
  const title = rollout ? rollout.title : live ? live.text : "Your call";
  const status = rollout ? rollout.status : live ? jobLine(live) : "I am waiting for your call.";
  const done = rollout ? rollout.index / Math.max(1, rollout.total) : live ? FILL[live.state] ?? 0 : 1;
  const step = rollout ? 1 / Math.max(1, rollout.total) : 0;
  return (
    <div className="panel rounded-2xl px-3.5 py-2.5" data-role={rollout ? "rollout" : "jobbar"} data-state={live?.state ?? (waiting ? "waiting" : "rollout")} data-bar={live?.landsAtBar ?? ""}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-live">{title}</span>
        {rollout ? <span className="tnum shrink-0 text-xs text-ink-3">{rollout.index + 1} of {rollout.total}</span> : behind > 0 ? <span className="tnum shrink-0 text-xs text-ink-3">{behind} waiting</span> : null}
      </div>
      <div className="mt-1.5 flex h-1 overflow-hidden rounded-full bg-s3">
        <div className="h-full bg-live transition-[width] duration-500" style={{ width: `${Math.round(done * 100)}%` }} />
        {step > 0 && <div className="h-full animate-breathe bg-live/50" style={{ width: `${Math.round(step * 100)}%` }} />}
      </div>
      <p className="mt-1 truncate text-xs text-ink-3">{status}</p>
    </div>
  );
}
