"use client";
// The conversation, large and live. You in pink, the producer in green. The line being
// spoken right now is the biggest thing on the screen; older lines fade up the page and
// dissolve at the top instead of being cut in half.
import { useEffect, useRef } from "react";

export type Line = { role: "user" | "assistant"; content: string };

export function Ribbon({ lines, interim, speakingText, thinking, tall }: { lines: Line[]; interim: string; speakingText: string | null; thinking: boolean; tall?: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [lines.length, interim, speakingText]);
  const shown = lines.slice(tall ? -8 : -4);
  const lastIsProducer = shown.length > 0 && shown[shown.length - 1].role === "assistant";

  return (
    <div className={`scroll-y fade-top flex min-h-0 flex-col justify-end gap-4 px-1 pb-1 pt-8 ${tall ? "max-h-[46dvh] lg:max-h-none lg:flex-1" : "max-h-[32dvh]"}`} aria-live="polite">
      {shown.map((l, i) => {
        const last = i === shown.length - 1;
        const you = l.role === "user";
        return (
          <div key={`${i}-${l.content.slice(0, 12)}`} data-role={you ? "you-line" : "producer-line"} className={`animate-fade-up ${last ? "" : "opacity-55"} ${i < shown.length - 3 ? "hidden sm:block" : ""}`}>
            <span className={`eyebrow ${you ? "!text-accent" : "!text-live"}`}>{you ? "You" : "Producer"}</span>
            <p className={`mt-1 text-ink ${last ? (l.content.length > 140 ? "text-base leading-snug sm:text-lg" : "text-xl leading-tight tracking-[-0.01em] sm:text-2xl") : "text-sm leading-snug sm:text-base"}`}>{l.content}</p>
          </div>
        );
      })}
      {interim && (
        <div data-role="interim" className="animate-fade-up">
          <span className="eyebrow !text-accent">You</span>
          <p className="mt-1 text-xl leading-tight text-accent sm:text-2xl">{interim}<span className="animate-breathe">…</span></p>
        </div>
      )}
      {!interim && thinking && !speakingText && (
        <div className="flex items-center gap-2 text-sm text-cool">
          <span className="flex gap-[3px]" aria-hidden>{[0, 140, 280].map((d) => <span key={d} className="h-1.5 w-1.5 rounded-full bg-cool animate-breathe" style={{ animationDelay: `${d}ms` }} />)}</span>
          {lastIsProducer ? "Working" : "Thinking"}
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
