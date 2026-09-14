"use client";
// What the producer is doing behind the conversation, visible: pulling an artist,
// building the drums, listening back, playing an audition. Cards slide in when work
// starts and out when it lands. Nothing here is tappable.
import { Icon, type IconName } from "./Icon";

export type WorkKind = "research" | "hands" | "rollout" | "audition" | "hear" | "record";
export type Work = { id: string; kind: WorkKind; title: string; detail?: string; progress?: number | null; at: number; done?: boolean; result?: string };

const ICON: Record<WorkKind, IconName> = { research: "search", hands: "sliders", rollout: "spark", audition: "play", hear: "ear", record: "scissors" };
const TONE: Record<WorkKind, string> = { research: "text-cool", hands: "text-live", rollout: "text-live", audition: "text-accent", hear: "text-cool", record: "text-cool" };

export function WorkCards({ work }: { work: Work[] }) {
  const shown = work.filter((w) => !w.done || Date.now() - w.at < 6000).slice(-4);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" aria-label="In progress">
      {shown.map((w) => (
        <div key={w.id} className={`panel flex items-center gap-3 rounded-2xl px-3.5 py-2.5 animate-slide-up ${w.done ? "opacity-70" : ""}`} data-role="work-card" data-kind={w.kind}>
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-s2 ${TONE[w.kind]}`}>
            {w.done ? <Icon name="check" size={16} /> : <Icon name={ICON[w.kind]} size={16} className={w.kind === "audition" ? "" : "animate-breathe"} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{w.title}</span>
            {(w.result ?? w.detail) && <span className="block truncate text-xs text-ink-3">{w.result ?? w.detail}</span>}
            {typeof w.progress === "number" && !w.done && (
              <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-s3"><span className={`block h-full rounded-full transition-[width] duration-500 ${w.kind === "audition" ? "bg-accent" : "bg-live"}`} style={{ width: `${Math.round(Math.max(0, Math.min(1, w.progress)) * 100)}%` }} /></span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
