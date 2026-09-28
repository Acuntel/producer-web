"use client";
// The ledger on screen, under ?trace=1 only: every sound on a timeline from asked to ready to
// heard, every landing with where in the bar it fell, and the counters that say whether the
// threads keep up. It re-renders itself twice a second and nothing else.
import { useEffect, useState } from "react";
import { ledgerSnapshot, type LedgerSnapshot } from "@/lib/engine/ledger";

const WINDOW_MS = 30000;
const COLOR: Record<string, string> = { memory: "#7dd3fc", idb: "#a78bfa", http: "#fbbf24", render: "#34d399" };

export function TraceOverlay() {
  const [snap, setSnap] = useState<LedgerSnapshot | null>(null);
  useEffect(() => { const id = window.setInterval(() => setSnap(ledgerSnapshot()), 500); return () => window.clearInterval(id); }, []);
  if (!snap) return null;
  const t1 = snap.at, t0 = t1 - WINDOW_MS;
  const x = (t: number) => `${Math.max(0, Math.min(100, ((t - t0) / WINDOW_MS) * 100))}%`;
  const last = Math.floor(t1 / 1000) - 1;
  const rows = snap.assets.filter((r) => (r.readyAt ?? t1) >= t0).slice(-14);
  const lands = snap.landings.filter((l) => l.landedAt >= t0);
  const c = snap.counters;
  return (
    <div className="pointer-events-none fixed bottom-2 left-2 z-[60] w-[min(560px,calc(100vw-16px))] rounded-lg bg-black/85 p-2 font-mono text-[10px] leading-tight text-white/85" data-role="trace">
      <p>
        idb/s {snap.perSec.idbOpens[last] ?? 0} · commits/s {snap.perSec.appCommits[last] ?? 0} · late {c.late ?? "?"} · rigs {c.graphsAlive ?? "?"}
        {c.playback?.underrunEvents !== undefined ? ` · underruns ${c.playback.underrunEvents}` : ""} · decodes/key max {snap.maxDecodesPerKey} · due before ready {snap.dueBeforeReady.length}
      </p>
      <div className="relative mt-1 h-3 border-b border-white/20">
        {lands.map((l, i) => (
          <span key={i} className="absolute top-0 h-3 w-px bg-rose-400" style={{ left: x(l.landedAt) }} title={`${l.jobId} bar ${l.landsAtBar} beat ${l.beatInBar}`} />
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.key} className="relative mt-0.5 h-3">
          <span className="absolute top-1 h-1 rounded" style={{ left: x(r.requestedAt), right: `calc(100% - ${x(r.readyAt ?? t1)})`, background: COLOR[r.source ?? ""] ?? "#f87171" }} />
          {r.dueAt !== null && <span className="absolute top-0 h-3 w-0.5 bg-white" style={{ left: x(r.dueAt) }} />}
          {r.firstHeardAt !== null && <span className="absolute top-0.5 h-2 w-2 rounded-full bg-emerald-300" style={{ left: x(r.firstHeardAt) }} />}
          <span className="absolute right-0 top-0 max-w-[45%] truncate text-white/60">{r.key} {r.decodes > 1 ? `x${r.decodes}` : ""}</span>
        </div>
      ))}
    </div>
  );
}
