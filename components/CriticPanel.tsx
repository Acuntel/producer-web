"use client";
// Producer's notes: recommendations from the background critic. Every one waits for the user.
import type { CriticNote } from "@/lib/critic";
import { Button, Empty } from "./ui";

const AREA: Record<CriticNote["area"], string> = {
  mix: "mix", arrangement: "arrangement", groove: "groove", harmony: "harmony", sound: "sound", reference: "reference",
};

const SEVERITY = [
  { dot: "bg-ink-3", label: "worth a look" },
  { dot: "bg-ink-3", label: "worth a look" },
  { dot: "bg-warn", label: "should fix" },
  { dot: "bg-accent", label: "fix this" },
] as const;

export function CriticPanel({
  notes, headline, thinking, onApply, onDismiss,
}: {
  notes: CriticNote[]; headline: string; thinking: boolean;
  onApply: (n: CriticNote) => void; onDismiss: (n: CriticNote) => void;
}) {
  if (thinking && notes.length === 0) {
    return (
      <div className="space-y-2 pt-1">
        <div className="skeleton h-4 w-2/3 rounded" />
        <div className="skeleton h-16 rounded-xl" />
        <p className="text-center text-xs text-ink-3">Listening back and writing notes…</p>
      </div>
    );
  }
  if (notes.length === 0) {
    return <Empty icon="notes" title="Nothing to flag right now" hint="Notes appear here after every change. You decide what happens with each one." />;
  }
  return (
    <div className="space-y-2 pt-1">
      {thinking && <p className="text-xs text-accent animate-breathe">Listening back…</p>}
      {headline && <p className="text-sm text-ink-2">{headline}</p>}
      <ul className="space-y-2">
        {notes.map((n) => {
          const sev = SEVERITY[Math.min(3, Math.max(0, n.severity))];
          return (
            <li key={n.id} className="animate-fade-up rounded-xl border border-line/45 bg-s2/60 p-3">
              <div className="flex items-start gap-2.5">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sev.dot}`} title={sev.label} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{n.what}</p>
                  <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-ink-3">
                    {AREA[n.area]}{n.section ? ` · ${n.section}` : ""} · {sev.label}
                  </p>
                  <p className="mt-1.5 text-sm text-ink-2">{n.why}</p>
                  <p className="mt-1.5 text-sm text-ink">
                    <span className="eyebrow mr-1.5 !inline">Fix</span> {n.fix}
                  </p>
                </div>
              </div>
              <div className="mt-2.5 flex gap-2 pl-[18px]">
                <Button tone="accent" icon="check" onClick={() => onApply(n)}>Do it</Button>
                <Button tone="ghost" onClick={() => onDismiss(n)}>Not that</Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
