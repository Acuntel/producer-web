"use client";
// Producer's notes: recommendations from the background critic. Every one waits for the user.
import type { CriticNote } from "@/lib/critic";

const AREA: Record<CriticNote["area"], string> = { mix: "mix", arrangement: "arrangement", groove: "groove", harmony: "harmony", sound: "sound", reference: "reference" };

export function CriticPanel({ notes, headline, thinking, onApply, onDismiss }: { notes: CriticNote[]; headline: string; thinking: boolean; onApply: (n: CriticNote) => void; onDismiss: (n: CriticNote) => void }) {
  return (
    <div className="mt-2 rounded-2xl bg-zinc-950/60 p-3 text-[12px] text-zinc-300">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Producer's notes</span>
        {thinking && <span className="text-[10px] text-amber-400">listening back…</span>}
      </div>
      {headline && <p className="mt-1 text-zinc-400">{headline}</p>}
      {notes.length === 0 && !thinking && <p className="mt-1 text-zinc-500">Nothing to flag right now. Notes appear here after every change. You decide what happens with them.</p>}
      <ul className="mt-1 space-y-1.5">
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl bg-zinc-900 px-3 py-2">
            <div className="flex items-start gap-2">
              <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${n.severity === 3 ? "bg-rose-400" : n.severity === 2 ? "bg-amber-400" : "bg-zinc-500"}`} title={`severity ${n.severity}`} />
              <div className="flex-1">
                <div className="text-zinc-100">{n.what}<span className="ml-1 text-[10px] text-zinc-500">{AREA[n.area]}{n.section ? ` · ${n.section}` : ""}</span></div>
                <div className="text-zinc-500">{n.why}</div>
                <div className="text-zinc-300">Suggested: {n.fix}</div>
              </div>
            </div>
            <div className="mt-1.5 flex gap-2">
              <button onClick={() => onApply(n)} className="rounded-full bg-amber-500 px-3 py-1 text-[11px] font-bold text-black">Do it</button>
              <button onClick={() => onDismiss(n)} className="rounded-full bg-zinc-800 px-3 py-1 text-[11px] text-zinc-300">Not that</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
