"use client";
// What the producer hears, shown: tempo, key, loudness, chords, structure, the reference and the deltas.
import type { MusicFacts } from "@/lib/ears";

export type Reference = { name: string; facts: MusicFacts };

function fmtTime(s: number) { const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s - m * 60)).padStart(2, "0")}`; }

export function EarsPanel({ facts, reference, deltaText, hearing }: { facts: MusicFacts | null; reference: Reference | null; deltaText: string | null; hearing: boolean }) {
  return (
    <div className="mt-2 rounded-2xl bg-zinc-950/60 p-3 text-[12px] text-zinc-300">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">What I hear</span>
        {hearing && <span className="text-[10px] text-amber-400">listening to the render…</span>}
      </div>
      {!facts && !hearing && <p className="mt-1 text-zinc-500">Nothing measured yet. The ears run after every change.</p>}
      {facts && <Facts f={facts} />}
      {reference && (
        <div className="mt-2 border-t border-zinc-800 pt-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-sky-400">Reference: {reference.name}</div>
          <div className="text-zinc-400">{Math.round(reference.facts.tempo.bpm)} BPM · {reference.facts.key.name} · {reference.facts.loudness.integrated.toFixed(1)} LUFS · drop {reference.facts.structure.dropAt !== null ? fmtTime(reference.facts.structure.dropAt) : "none"}</div>
          {deltaText && <div className="mt-1 text-zinc-300">{deltaText}</div>}
        </div>
      )}
    </div>
  );
}

function Facts({ f }: { f: MusicFacts }) {
  const b = f.spectrum.bands;
  const bars = [["sub", b.sub], ["low", b.low], ["lowMid", b.lowMid], ["mid", b.mid], ["highMid", b.highMid], ["air", b.air]] as [string, number][];
  const energy = f.structure.energy;
  return (
    <div className="mt-1 space-y-1.5">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span><b className="text-white">{Math.round(f.tempo.bpm)}</b> BPM</span>
        <span><b className="text-white">{f.key.name}</b> <span className="text-zinc-500">({Math.round(f.key.confidence * 100)}%)</span></span>
        <span><b className="text-white">{f.loudness.integrated.toFixed(1)}</b> LUFS</span>
        <span>swing <b className="text-white">{Math.round(f.groove.swing * 100)}%</b></span>
        <span>pump <b className="text-white">{f.groove.pump.toFixed(2)}</b></span>
        {f.structure.dropAt !== null && <span>drop at <b className="text-white">{fmtTime(f.structure.dropAt)}</b></span>}
      </div>
      {f.chords.progression.length > 0 && <div className="text-zinc-400">chords: {f.chords.progression.join(" · ")}</div>}
      <div className="flex items-end gap-1" title="spectrum balance">
        {bars.map(([n, v]) => (
          <div key={n} className="flex flex-col items-center" style={{ width: 34 }}>
            <div className="w-full rounded-t bg-zinc-800" style={{ height: 26 }}><div className="w-full rounded-t bg-emerald-400/80" style={{ height: `${Math.min(1, v * 2) * 100}%`, marginTop: `${(1 - Math.min(1, v * 2)) * 100}%` }} /></div>
            <span className="text-[9px] text-zinc-500">{n}</span>
          </div>
        ))}
        <div className="ml-2 text-[10px] text-zinc-500">mud {f.spectrum.mud.toFixed(2)} · harsh {f.spectrum.harshness.toFixed(2)} · width {f.spectrum.width.toFixed(2)}</div>
      </div>
      {energy.length > 0 && (
        <div className="flex h-6 items-end gap-px" title="energy per bar">
          {energy.slice(0, 160).map((e, i) => <div key={i} className="flex-1 rounded-t bg-amber-400/70" style={{ height: `${Math.max(4, e * 100)}%` }} />)}
        </div>
      )}
      <div className="text-zinc-400">{f.read}</div>
    </div>
  );
}
