"use client";
// Ableton's mixer, read-only: level, pan, sends, inserts, mute/solo. The AI moves it.
// Channels are a fixed width in a faded scroller, so one never gets sliced in half.
import type { Song } from "@/lib/song/types";
import { colorOf } from "./colors";
import { ScrollX } from "./ui";

export function Mixer({ song }: { song: Song }) {
  const anySolo = song.tracks.some((t) => t.solo);
  return (
    <ScrollX label="Mixer">
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
          t.fx?.gate ? "gate" : null,
          t.fx?.eq ? "eq" : null,
          typeof t.fx?.width === "number" ? `w ${Math.round(t.fx.width * 100)}` : null,
          t.synth?.wave ? t.synth.wave.replace("fat", "fat ") : null,
          t.transpose ? `${t.transpose > 0 ? "+" : ""}${t.transpose}st` : null,
        ].filter(Boolean) as string[];

        return (
          <div
            key={t.id}
            className="flex w-[100px] shrink-0 flex-col items-center rounded-xl border border-line/40 bg-base/60 px-2 py-2.5 transition-opacity"
            style={{ opacity: silent ? 0.4 : 1 }}
          >
            <div className="w-full truncate text-center text-xs font-bold uppercase tracking-wide" style={{ color }} title={t.name}>
              {t.name}
            </div>

            <div className="mt-2 h-20 w-2.5 overflow-hidden rounded-full bg-s3">
              <div className="w-full rounded-full transition-[height] duration-300 ease-snap" style={{ height: `${level * 100}%`, marginTop: `${(1 - level) * 100}%`, background: color }} />
            </div>

            <div className="tnum mt-1.5 text-xs font-medium text-ink-2">
              {t.volume > 0 ? "+" : ""}{Math.round(t.volume)} dB
            </div>

            <div className="relative mt-2 h-1 w-full rounded-full bg-s3" title={`pan ${Math.round((t.fx?.pan ?? 0) * 100)}`}>
              <span className="absolute -top-[3px] h-[7px] w-[7px] rounded-full bg-ink-2 ring-2 ring-base" style={{ left: `calc(${((t.fx?.pan ?? 0) + 1) * 50}% - 3.5px)` }} />
            </div>

            <div className="mt-2.5 flex w-full justify-center gap-1">
              <Flag on={!!t.mute} tone="accent" label="Mute">M</Flag>
              <Flag on={!!t.solo} tone="cool" label="Solo">S</Flag>
              <Flag on={!!t.duck} tone="dim" label="Sidechain">SC</Flag>
            </div>

            {chips.length > 0 && (
              <div className="mt-2 flex w-full flex-wrap justify-center gap-1">
                {chips.slice(0, 3).map((c) => (
                  <span key={c} className="rounded bg-s3 px-1 py-px text-[10px] font-medium leading-4 text-ink-3">{c}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </ScrollX>
  );
}

function Flag({ on, tone, label, children }: { on: boolean; tone: "accent" | "cool" | "dim"; label: string; children: string }) {
  const active = tone === "accent" ? "bg-accent text-accent-ink" : tone === "cool" ? "bg-cool text-accent-ink" : "bg-s3 text-ink";
  return (
    <span
      title={`${label}${on ? " on" : " off"}`}
      className={`grid h-5 min-w-[22px] place-items-center rounded px-1 text-[10px] font-bold leading-none ${on ? active : "bg-s2 text-ink-3"}`}
    >
      {children}
    </span>
  );
}
