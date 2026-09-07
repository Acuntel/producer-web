"use client";
// The one control. Everything the studio is doing right now is legible from here:
// whether it is running, and which of listen / think / speak / hear it is in.
import { Icon } from "./Icon";

export type Phase = "idle" | "starting" | "listening" | "thinking" | "speaking" | "hearing" | "playing" | "paused";

const COPY: Record<Phase, string> = {
  idle: "Tap to start",
  starting: "Warming up the studio",
  listening: "Listening",
  thinking: "Working on it",
  speaking: "Talking",
  hearing: "Listening back to the mix",
  playing: "Playing",
  paused: "Paused",
};

export function Orb({
  phase, running, beatSec, onClick, disabled, size = 104,
}: { phase: Phase; running: boolean; beatSec: number; onClick: () => void; disabled?: boolean; size?: number }) {
  // `running` is whether audio is actually moving; `phase` is what the studio is
  // doing. They are independent: the mic is open while the track plays.
  const live = running || phase === "thinking" || phase === "hearing";
  const busy = phase === "starting" || phase === "thinking" || phase === "hearing";
  const label = phase === "idle" ? "Start the session" : running ? "Pause" : "Play";

  return (
    <div className="flex flex-col items-center gap-2.5 p-1.5">
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        {/* Beat-synced ring. Only while actually running, so it never lies. */}
        {running && (
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-live/60"
            style={{ animation: `orb-ring ${beatSec}s ease-out infinite` }}
          />
        )}
        {busy && (
          <span
            aria-hidden
            className="absolute inset-[-6px] rounded-full border-2 border-accent/25 border-t-accent"
            style={{ animation: "spin 1.1s linear infinite" }}
          />
        )}
        <button
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={`relative grid h-full w-full place-items-center rounded-full text-accent-ink
            transition-[transform,box-shadow,background-color] duration-200 ease-snap
            active:scale-[0.96] disabled:opacity-70
            ${live ? "bg-live shadow-orb-live" : "bg-accent shadow-orb"}`}
          style={{
            backgroundImage: "linear-gradient(180deg, rgb(255 255 255 / 0.10), transparent 60%)",
            animation: running ? `orb-beat ${beatSec}s ease-out infinite` : undefined,
          }}
        >
          <Icon name={running ? "pause" : "play"} size={Math.round(size * 0.33)} className={running ? "" : "translate-x-[3px]"} />
        </button>
      </div>

      <div className="flex h-5 items-center gap-1.5" aria-live="polite">
        {busy && (
          <span className="flex gap-[3px]" aria-hidden>
            {[0, 140, 280].map((d) => (
              <span key={d} className="h-1.5 w-1.5 rounded-full bg-accent animate-breathe" style={{ animationDelay: `${d}ms` }} />
            ))}
          </span>
        )}
        <span className="text-xs font-medium text-ink-3">{COPY[phase]}</span>
      </div>
    </div>
  );
}
