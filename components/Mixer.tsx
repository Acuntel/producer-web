"use client";
// Ableton's mixer, live: a moving level meter per channel, faders you can drag, mute
// and solo you can press. Every move goes through the song ops so the brain stays in sync.
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { Song } from "@/lib/song/types";
import type { Levels } from "@/lib/engine";
import { colorOf } from "./colors";
import { ScrollX } from "./ui";

const MIN = -40, MAX = 6;
const dbToPos = (db: number) => Math.max(0, Math.min(1, (db - MIN) / (MAX - MIN)));
const posToDb = (p: number) => Math.round((MIN + Math.max(0, Math.min(1, p)) * (MAX - MIN)) * 2) / 2;
const unit = (db: number, floor = -60) => Math.max(0, Math.min(1, (db - floor) / -floor));

export function Mixer({ song, getLevels, running, onVolume, onToggle }: { song: Song; getLevels: () => Levels | null; running: boolean; onVolume: (id: string, db: number, commit: boolean) => void; onToggle: (id: string, what: "mute" | "solo") => void }) {
  const anySolo = song.tracks.some((t) => t.solo);
  const meters = useRef(new Map<string, HTMLDivElement>());
  const smooth = useRef(new Map<string, number>());
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const lv = running ? getLevels() : null;
      for (const [id, el] of meters.current) {
        const raw = lv ? unit(lv.tracks[id] ?? -100) : 0;
        const prev = smooth.current.get(id) ?? 0;
        const v = raw > prev ? raw : prev * 0.9;
        smooth.current.set(id, v);
        el.style.height = `${Math.round(v * 100)}%`;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [getLevels, running]);

  return (
    <ScrollX label="Mixer">
      {song.tracks.map((t) => {
        const color = colorOf(t.role);
        const silent = t.mute || (anySolo && !t.solo);
        return (
          <Channel key={t.id} id={t.id} name={t.name} color={color} volume={t.volume} pan={t.fx?.pan ?? 0} mute={!!t.mute} solo={!!t.solo} duck={!!t.duck} silent={silent}
            meterRef={(el) => { if (el) meters.current.set(t.id, el); else meters.current.delete(t.id); }}
            onVolume={onVolume} onToggle={onToggle} chips={chipsOf(t)} />
        );
      })}
    </ScrollX>
  );
}

function chipsOf(t: Song["tracks"][number]): string[] {
  return [
    t.clip ? "sample" : t.synth?.wave ? t.synth.wave.replace("fat", "fat ") : null,
    t.fx?.filter ? `${t.fx.filter.type === "highpass" ? "HP" : t.fx.filter.type === "bandpass" ? "BP" : "LP"} ${Math.round(t.fx.filter.cutoff)}` : null,
    t.fx?.drive ? `drive ${Math.round(t.fx.drive * 100)}` : null,
    t.fx?.delay?.wet ? `dly ${t.fx.delay.time}` : null,
    typeof t.fx?.reverb === "number" ? `rev ${Math.round(t.fx.reverb * 100)}` : null,
    t.transpose ? `${t.transpose > 0 ? "+" : ""}${t.transpose}st` : null,
  ].filter(Boolean) as string[];
}

function Channel({ id, name, color, volume, pan, mute, solo, duck, silent, meterRef, onVolume, onToggle, chips }: {
  id: string; name: string; color: string; volume: number; pan: number; mute: boolean; solo: boolean; duck: boolean; silent: boolean;
  meterRef: (el: HTMLDivElement | null) => void; onVolume: (id: string, db: number, commit: boolean) => void; onToggle: (id: string, what: "mute" | "solo") => void; chips: string[];
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const shown = drag ?? volume;
  const posFrom = (e: RPointerEvent) => { const r = track.current!.getBoundingClientRect(); return 1 - (e.clientY - r.top) / r.height; };
  return (
    <div className="flex w-[92px] shrink-0 flex-col items-center rounded-xl border border-line/40 bg-base/60 px-2 pb-2 pt-2.5 transition-opacity" style={{ opacity: silent ? 0.45 : 1 }}>
      <div className="w-full truncate text-center text-xs font-bold uppercase tracking-wide" style={{ color }} title={name}>{name}</div>
      <div className="mt-2 flex h-[104px] items-stretch gap-1.5">
        {/* Meter */}
        <div className="flex w-2 flex-col justify-end overflow-hidden rounded-full bg-s3"><div ref={meterRef} className="w-full rounded-full" style={{ height: "0%", background: color }} /></div>
        {/* Fader */}
        <div
          ref={track}
          role="slider" aria-label={`${name} volume`} aria-valuemin={MIN} aria-valuemax={MAX} aria-valuenow={shown} tabIndex={0}
          onKeyDown={(e) => { if (e.key === "ArrowUp") onVolume(id, Math.min(MAX, volume + 1), true); if (e.key === "ArrowDown") onVolume(id, Math.max(MIN, volume - 1), true); }}
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); const db = posToDb(posFrom(e)); setDrag(db); onVolume(id, db, false); }}
          onPointerMove={(e) => { if (drag === null) return; const db = posToDb(posFrom(e)); if (db !== drag) { setDrag(db); onVolume(id, db, false); } }}
          onPointerUp={(e) => { if (drag === null) return; const db = posToDb(posFrom(e)); setDrag(null); onVolume(id, db, true); }}
          onPointerCancel={() => setDrag(null)}
          className="relative w-7 cursor-ns-resize touch-none rounded-md bg-s2/80 focus-visible:outline-none"
        >
          <span aria-hidden className="absolute inset-x-[11px] inset-y-1 rounded-full bg-s3" />
          <span aria-hidden className="absolute left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full bg-ink/25" style={{ bottom: `calc(${dbToPos(0) * 100}% - 1px)` }} title="0 dB" />
          <span aria-hidden className="absolute left-1 right-1 h-4 -translate-y-1/2 rounded-[4px] border border-line/70 bg-s3 shadow-lift" style={{ top: `${(1 - dbToPos(shown)) * 100}%`, boxShadow: drag !== null ? `0 0 0 2px ${color}66` : undefined }}>
            <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-ink/50" />
          </span>
        </div>
      </div>
      <div className={`tnum mt-1.5 text-xs font-medium ${drag !== null ? "text-ink" : "text-ink-2"}`}>{shown > 0 ? "+" : ""}{shown} dB</div>
      <div className="relative mt-2 h-1 w-full rounded-full bg-s3" title={`pan ${Math.round(pan * 100)}`}>
        <span className="absolute -top-[3px] h-[7px] w-[7px] rounded-full bg-ink-2 ring-2 ring-base" style={{ left: `calc(${(pan + 1) * 50}% - 3.5px)` }} />
      </div>
      <div className="mt-2.5 flex w-full justify-center gap-1">
        <button onClick={() => onToggle(id, "mute")} aria-pressed={mute} aria-label={`Mute ${name}`} className={`grid h-6 min-w-[24px] place-items-center rounded px-1 text-[10px] font-bold leading-none transition-colors ${mute ? "bg-accent text-accent-ink" : "bg-s2 text-ink-3 hover:text-ink"}`}>M</button>
        <button onClick={() => onToggle(id, "solo")} aria-pressed={solo} aria-label={`Solo ${name}`} className={`grid h-6 min-w-[24px] place-items-center rounded px-1 text-[10px] font-bold leading-none transition-colors ${solo ? "bg-cool text-accent-ink" : "bg-s2 text-ink-3 hover:text-ink"}`}>S</button>
        <span title={duck ? "Sidechained to the kick" : "Not sidechained"} className={`grid h-6 min-w-[24px] place-items-center rounded px-1 text-[10px] font-bold leading-none ${duck ? "bg-s3 text-ink-2" : "bg-s2 text-ink-3/60"}`}>SC</span>
      </div>
      {chips.length > 0 && (
        <div className="mt-2 flex w-full flex-wrap justify-center gap-1">
          {chips.slice(0, 3).map((c) => <span key={c} className="rounded bg-s3 px-1 py-px text-[10px] font-medium leading-4 text-ink-3">{c}</span>)}
        </div>
      )}
    </div>
  );
}
