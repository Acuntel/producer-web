"use client";
// Ableton's mixer, read-only: level, pan, sends, inserts, mute/solo. The AI moves it.
import type { Song } from "@/lib/song/types";
import { colorOf } from "./colors";

export function Mixer({ song }: { song: Song }) {
  const anySolo = song.tracks.some((t) => t.solo);
  return (
    <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
      {song.tracks.map((t) => {
        const color = colorOf(t.role);
        const level = Math.max(0, Math.min(1, (t.volume + 30) / 36));
        const silent = t.mute || (anySolo && !t.solo);
        const chips = [
          t.fx?.filter ? `${t.fx.filter.type === "highpass" ? "HP" : t.fx.filter.type === "bandpass" ? "BP" : "LP"} ${Math.round(t.fx.filter.cutoff)}` : null,
          t.fx?.drive ? `drive ${Math.round(t.fx.drive * 100)}` : null,
          t.fx?.delay?.wet ? `dly ${t.fx.delay.time}` : null,
          typeof t.fx?.reverb === "number" ? `rev ${Math.round(t.fx.reverb * 100)}` : null,
          t.fx?.crush ? `crush ${t.fx.crush}b` : null,
          t.fx?.gate ? `gate` : null,
          t.fx?.eq ? `eq` : null,
          typeof t.fx?.width === "number" ? `w ${Math.round(t.fx.width * 100)}` : null,
          t.synth?.wave ? t.synth.wave.replace("fat", "fat ") : null,
          t.transpose ? `${t.transpose > 0 ? "+" : ""}${t.transpose}st` : null,
        ].filter(Boolean) as string[];
        return (
          <div key={t.id} className="flex w-[74px] shrink-0 flex-col items-center rounded-xl bg-zinc-950/70 px-1.5 py-2" style={{ opacity: silent ? 0.35 : 1 }}>
            <div className="truncate text-[10px] font-bold uppercase" style={{ color }} title={t.name}>{t.name}</div>
            <div className="mt-1 flex h-16 w-full items-end justify-center gap-1">
              <div className="h-full w-2 rounded bg-zinc-800"><div className="w-full rounded" style={{ height: `${level * 100}%`, marginTop: `${(1 - level) * 100}%`, background: color }} /></div>
              <div className="flex h-full flex-col justify-between text-[8px] text-zinc-500"><span>0</span><span>-18</span></div>
            </div>
            <div className="mt-1 text-[10px] text-zinc-300">{t.volume > 0 ? "+" : ""}{Math.round(t.volume)} dB</div>
            <div className="relative mt-1 h-1 w-full rounded bg-zinc-800"><div className="absolute top-[-2px] h-2 w-2 rounded-full bg-zinc-300" style={{ left: `calc(${((t.fx?.pan ?? 0) + 1) * 50}% - 4px)` }} /></div>
            <div className="mt-1 flex gap-1 text-[9px] font-bold">
              <span className={`rounded px-1 ${t.mute ? "bg-amber-500 text-black" : "bg-zinc-800 text-zinc-500"}`}>M</span>
              <span className={`rounded px-1 ${t.solo ? "bg-sky-400 text-black" : "bg-zinc-800 text-zinc-500"}`}>S</span>
              <span className={`rounded px-1 ${t.duck ? "bg-zinc-700 text-zinc-200" : "bg-zinc-800 text-zinc-600"}`} title="sidechain">SC</span>
            </div>
            <div className="mt-1 flex flex-wrap justify-center gap-0.5">
              {chips.slice(0, 4).map((c) => <span key={c} className="rounded bg-zinc-800 px-1 text-[8px] text-zinc-400">{c}</span>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
