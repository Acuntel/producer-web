"use client";
// The studio, two thirds of the screen: the record's name and its live picture (meter,
// spectrum), the transport, the arrangement timeline with the playhead, then the lanes,
// the mixer, the ears and the producer's notes.
import { useEffect, useRef, useState } from "react";
import type { Song } from "@/lib/song/types";
import type { MusicFacts } from "@/lib/ears";
import type { Levels } from "@/lib/engine";
import type { CriticNote } from "@/lib/critic";
import type { LaneMove } from "@/lib/song/moves";
import { Timeline } from "./Timeline";
import { TrackLanes } from "./TrackLanes";
import { Mixer } from "./Mixer";
import { MasterMeter, Spectrum } from "./Meters";
import { EarsPanel, type Reference } from "./EarsPanel";
import { CriticPanel } from "./CriticPanel";
import { Disclosure, Chip, IconButton } from "./ui";
import { Icon } from "./Icon";
import { laneInfo } from "@/lib/brain/laneNames";

export type Rollout = { title: string; index: number; total: number; status: string };
export type Ab = { playing: string };

export function StudioPanel({
  song, started, playing, starting, onPlayPause, nowSection, beat, onJump, getLevels, onVolume, onToggle,
  listenHint, rollout, onCancelRollout, ab, onPickAb, score,
  facts, reference, deltaText, hearing, notes, headline, criticThinking, onApply, onDismiss, moves,
}: {
  song: Song; started: boolean; playing: boolean; starting: boolean; onPlayPause: () => void;
  nowSection: number; beat: number | null; onJump: (id: string) => void;
  getLevels: () => Levels | null; onVolume: (id: string, db: number, commit: boolean) => void; onToggle: (id: string, what: "mute" | "solo") => void;
  listenHint: string | null; rollout: Rollout | null; onCancelRollout: () => void;
  ab: Ab | null; onPickAb: (k: string) => void; score: string | null;
  facts: MusicFacts | null; reference: Reference | null; deltaText: string | null; hearing: boolean;
  notes: CriticNote[]; headline: string; criticThinking: boolean; onApply: (n: CriticNote) => void; onDismiss: (n: CriticNote) => void; moves?: LaneMove[];
}) {
  const [open, setOpen] = useState({ music: true, mixer: true, ears: false, notes: false });
  const toggle = (k: keyof typeof open) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const revealedNotes = useRef(false);
  useEffect(() => { if (notes.length > 0 && !revealedNotes.current) { revealedNotes.current = true; setOpen((o) => ({ ...o, notes: true })); } }, [notes.length]);

  const sec = nowSection >= 0 ? song.sections.find((s) => s.id === song.arrangement[nowSection]) : null;
  const barInSong = beat !== null ? Math.floor(beat / 4) + 1 : null;
  const lane = laneInfo(song.lane);
  const lufs = facts?.loudness.integrated ?? null;
  const lufsTone = lufs === null ? "quiet" : lufs > -6 ? "warn" : lufs < -12 ? "warn" : "live";

  return (
    <div className="flex flex-col gap-3">
      <section className="panel rounded-3xl p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Now producing</div>
            <h2 className="mt-0.5 truncate text-2xl font-semibold text-ink sm:text-3xl">{song.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Chip>{song.bpm} BPM</Chip>
              <Chip>{song.key}</Chip>
              {lane && <Chip>{lane.name}</Chip>}
              <Chip>{song.tracks.length} tracks</Chip>
              {lufs !== null && <Chip tone={lufsTone === "warn" ? "accent" : "cool"}>{lufs.toFixed(1)} LUFS</Chip>}
              {facts && <Chip>{Math.round(facts.tempo.bpm)} measured</Chip>}
              {hearing && <Chip tone="accent">listening back</Chip>}
            </div>
            {listenHint && (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1.5 text-sm text-accent">
                <Icon name="ear" size={15} className="mt-0.5 shrink-0" /><span>{listenHint}</span>
              </p>
            )}
            {rollout && (
              <div className="mt-3 rounded-lg bg-cool/10 px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-cool">{rollout.title}</span>
                  <span className="tnum shrink-0 text-xs text-cool/80">{rollout.index + 1}/{rollout.total}</span>
                  <button onClick={onCancelRollout} className="shrink-0 rounded-md bg-s3 px-2 py-0.5 text-xs text-ink-2 transition-colors hover:text-ink">Stop</button>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-s3"><div className="h-full rounded-full bg-cool transition-[width] duration-500 ease-snap" style={{ width: `${((rollout.index + 1) / Math.max(1, rollout.total)) * 100}%` }} /></div>
                <p className="mt-1 truncate text-xs text-cool/80">{rollout.status}</p>
              </div>
            )}
            {ab && (
              <div className="mt-3 flex items-center gap-1.5">
                <span className="eyebrow">Compare</span>
                {(["a", "b"] as const).map((k) => (
                  <button key={k} onClick={() => onPickAb(k)} className={`h-7 w-8 rounded-md text-xs font-bold transition-colors ${ab.playing === k ? "bg-accent text-accent-ink" : "bg-s2 text-ink-2 hover:bg-s3"}`}>{k.toUpperCase()}</button>
                ))}
                <button onClick={() => onPickAb(ab.playing === "a" ? "keepA" : "keepB")} className="h-7 rounded-md bg-s2 px-2.5 text-xs font-medium text-ink-2 transition-colors hover:bg-s3 hover:text-ink">Keep {ab.playing.toUpperCase()}</button>
              </div>
            )}
          </div>
          <div className="hidden shrink-0 items-end gap-3 sm:flex">
            <div className="rounded-xl bg-base/60 p-2"><Spectrum getLevels={getLevels} running={playing} width={200} height={72} /></div>
            <div className="rounded-xl bg-base/60 p-2"><MasterMeter getLevels={getLevels} running={playing} height={72} /></div>
          </div>
        </div>

        {/* Transport */}
        <div className="mt-4 flex items-center gap-3">
          <IconButton name={playing ? "pause" : "play"} label={playing ? "Pause the music" : started ? "Play the music" : "Start the music"} tone={playing ? "live" : "accent"} size={40} onClick={onPlayPause} disabled={starting} />
          <div className="min-w-0 flex-1">
            <div className="tnum flex items-baseline gap-2 text-sm">
              <span className="font-semibold text-ink">{barInSong !== null ? `Bar ${barInSong}` : started ? "Paused" : "Not started"}</span>
              {sec && <span className="truncate text-ink-3">{sec.name}{song.loop ? " · looping" : ""}</span>}
            </div>
          </div>
          {score && <span className="tnum hidden truncate text-xs text-ink-3 md:inline">{score}</span>}
        </div>

        <div className="mt-3">
          <Timeline song={song} beat={playing ? beat : null} nowSection={nowSection} playing={playing} onJump={onJump} />
        </div>
      </section>

      <Disclosure title="The music" icon="waveform" open={open.music} onToggle={() => toggle("music")}>
        <TrackLanes song={song} beat={beat} sectionIdx={nowSection} getLevels={getLevels} running={playing} onToggle={onToggle} moves={moves} />
      </Disclosure>

      <Disclosure title="Mixer" icon="sliders" open={open.mixer} onToggle={() => toggle("mixer")}>
        <Mixer song={song} getLevels={getLevels} running={playing} onVolume={onVolume} onToggle={onToggle} />
      </Disclosure>

      <Disclosure title="What I hear" icon="ear" open={open.ears} onToggle={() => toggle("ears")} right={hearing ? <Chip tone="accent">listening</Chip> : undefined}>
        <EarsPanel facts={facts} reference={reference} deltaText={deltaText} hearing={hearing} />
      </Disclosure>

      {started && (
        <Disclosure title="Producer's notes" icon="notes" open={open.notes} onToggle={() => toggle("notes")} badge={notes.length || undefined}>
          <CriticPanel notes={notes} headline={headline} thinking={criticThinking} onApply={onApply} onDismiss={onDismiss} />
        </Disclosure>
      )}
    </div>
  );
}
