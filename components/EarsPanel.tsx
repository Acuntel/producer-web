"use client";
// What the producer hears, shown: tempo, key, loudness, chords, structure, the reference and the deltas.
// Two single-series charts, one hue each; labels wear text tokens, never the series color.
import type { MusicFacts } from "@/lib/ears";
import { Empty } from "./ui";

export type Reference = { name: string; facts: MusicFacts };

function fmtTime(s: number) { const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s - m * 60)).padStart(2, "0")}`; }

export function EarsPanel({
  facts, reference, deltaText, hearing,
}: { facts: MusicFacts | null; reference: Reference | null; deltaText: string | null; hearing: boolean }) {
  if (hearing && !facts) {
    return (
      <div className="space-y-2 pt-1">
        <div className="skeleton h-14 rounded-xl" />
        <div className="skeleton h-16 rounded-xl" />
        <p className="text-center text-xs text-ink-3">Rendering the song and listening back…</p>
      </div>
    );
  }
  if (!facts) {
    return <Empty icon="ear" title="Nothing measured yet" hint="After every change the producer renders the song and listens back. The numbers land here." />;
  }
  return (
    <div className="space-y-3 pt-1">
      {hearing && <p className="text-xs text-accent animate-breathe">Listening back to the new render…</p>}
      <Stats f={facts} />
      <Spectrum f={facts} />
      <Energy f={facts} />
      {facts.chords.progression.length > 0 && (
        <p className="text-xs text-ink-2">
          <span className="eyebrow mr-1.5 !inline">Chords</span>{" "}
          <span className="font-mono">{facts.chords.progression.join("  ")}</span>
        </p>
      )}
      <p className="text-sm leading-relaxed text-ink-2">{facts.read}</p>
      {reference && (
        <div className="border-t border-line/50 pt-2.5">
          <div className="eyebrow !text-cool">Reference · {reference.name}</div>
          <p className="tnum mt-1 text-xs text-ink-2">
            {Math.round(reference.facts.tempo.bpm)} BPM · {reference.facts.key.name} · {reference.facts.loudness.integrated.toFixed(1)} LUFS
            {reference.facts.structure.dropAt !== null ? ` · drop ${fmtTime(reference.facts.structure.dropAt)}` : ""}
          </p>
          {deltaText && <p className="mt-1.5 text-sm text-ink">{deltaText}</p>}
        </div>
      )}
    </div>
  );
}

function Stats({ f }: { f: MusicFacts }) {
  const items: [string, string][] = [
    ["Tempo", `${Math.round(f.tempo.bpm)}`],
    ["Key", f.key.name],
    ["Loudness", `${f.loudness.integrated.toFixed(1)}`],
    ["Swing", `${Math.round(f.groove.swing * 100)}%`],
    ["Pump", f.groove.pump.toFixed(2)],
    ...(f.structure.dropAt !== null ? ([["Drop", fmtTime(f.structure.dropAt)]] as [string, string][]) : []),
  ];
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-s2/70 px-2 py-1.5">
          <div className="tnum truncate text-[15px] font-semibold leading-5 text-ink">{value}</div>
          <div className="truncate text-[10px] font-medium uppercase tracking-wider text-ink-3">{label}</div>
        </div>
      ))}
    </div>
  );
}

/** Six ordered frequency bands, one series, one hue. Values labelled directly. */
function Spectrum({ f }: { f: MusicFacts }) {
  const b = f.spectrum.bands;
  const bands: [string, number][] = [["Sub", b.sub], ["Low", b.low], ["Lo-mid", b.lowMid], ["Mid", b.mid], ["Hi-mid", b.highMid], ["Air", b.air]];
  const max = Math.max(0.2, ...bands.map(([, v]) => v));
  return (
    <div>
      <div className="eyebrow mb-1.5">Spectrum balance</div>
      <div className="flex items-end gap-[2px]">
        {bands.map(([name, v]) => (
          <div key={name} className="flex flex-1 flex-col items-center gap-1">
            <span className="tnum text-[10px] font-medium text-ink-3">{v.toFixed(2)}</span>
            <div className="flex h-14 w-full items-end rounded-t bg-s2/60">
              <div className="w-full rounded-t-[4px] bg-cool transition-[height] duration-500 ease-snap" style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />
            </div>
            <span className="truncate text-[10px] text-ink-3">{name}</span>
          </div>
        ))}
      </div>
      <p className="tnum mt-1.5 text-[11px] text-ink-3">
        mud {f.spectrum.mud.toFixed(2)} · harsh {f.spectrum.harshness.toFixed(2)} · width {f.spectrum.width.toFixed(2)}
      </p>
    </div>
  );
}

/** Energy per bar over the arrangement: one series, change over time. */
function Energy({ f }: { f: MusicFacts }) {
  const e = f.structure.energy;
  if (!e.length) return null;
  return (
    <div>
      <div className="eyebrow mb-1.5">Energy across the song</div>
      <div className="flex h-9 items-end gap-px rounded-lg bg-s2/50 p-1">
        {e.slice(0, 160).map((v, i) => (
          <div key={i} className="flex-1 rounded-t-[2px] bg-accent/75" style={{ height: `${Math.max(6, v * 100)}%` }} />
        ))}
      </div>
    </div>
  );
}
