"use client";
// The song side: what is playing, where it is, and the four depth panels.
// Only "the music" opens by default — all four open at once was the wall of
// dense numbers that made this read as a debug tool instead of a product.
import { useEffect, useRef, useState } from "react";
import type { Song } from "@/lib/song/types";
import type { MusicFacts } from "@/lib/ears";
import type { CriticNote } from "@/lib/critic";
import { Orb, type Phase } from "./Orb";
import { SectionStrip } from "./SectionStrip";
import { TrackLanes } from "./TrackLanes";
import { Mixer } from "./Mixer";
import { EarsPanel, type Reference } from "./EarsPanel";
import { CriticPanel } from "./CriticPanel";
import { Disclosure, Chip } from "./ui";
import { Icon } from "./Icon";

export type Rollout = { title: string; index: number; total: number; status: string };
export type Ab = { playing: string };

export function StudioPanel({
  song, phase, beatSec, onOrb, starting, playing, nowSection, beat, onJump,
  listenHint, rollout, onCancelRollout, ab, onPickAb, score,
  facts, reference, deltaText, hearing, notes, headline, criticThinking, onApply, onDismiss, started,
}: {
  song: Song; phase: Phase; beatSec: number; onOrb: () => void; starting: boolean; playing: boolean;
  nowSection: number; beat: number | null; onJump: (id: string) => void;
  listenHint: string | null; rollout: Rollout | null; onCancelRollout: () => void;
  ab: Ab | null; onPickAb: (k: string) => void; score: string | null;
  facts: MusicFacts | null; reference: Reference | null; deltaText: string | null; hearing: boolean;
  notes: CriticNote[]; headline: string; criticThinking: boolean;
  onApply: (n: CriticNote) => void; onDismiss: (n: CriticNote) => void; started: boolean;
}) {
  const [open, setOpen] = useState({ music: true, mixer: false, ears: false, notes: false });
  const toggle = (k: keyof typeof open) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  // The first time the producer has something to say about the track, show it.
  // After that the badge is enough and the user's own choice is respected.
  const revealedNotes = useRef(false);
  useEffect(() => {
    if (notes.length > 0 && !revealedNotes.current) {
      revealedNotes.current = true;
      setOpen((o) => ({ ...o, notes: true }));
    }
  }, [notes.length]);

  return (
    <div className="flex flex-col gap-3">
      <section className="panel rounded-3xl p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-2xl font-semibold text-ink">{song.title}</h2>
            {/* Plain text, not flex items: flex children are blockified and innerText
                then breaks this into one line each, which reads wrong to any reader
                (and to the harness) that scans the line. */}
            <p className="tnum mt-1 text-sm text-ink-2">
              {song.bpm} BPM · {song.key} · {song.tracks.length} tracks
              {song.loop ? " · looping" : ""}
            </p>

            {facts && (
              <p className="tnum mt-1.5 text-xs text-ink-3">
                Measured {Math.round(facts.tempo.bpm)} BPM · {facts.key.name} · {facts.loudness.integrated.toFixed(1)} LUFS · peak {facts.loudness.peak.toFixed(1)} dBFS
              </p>
            )}

            {listenHint && (
              <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1.5 text-sm text-accent">
                <Icon name="ear" size={15} className="mt-0.5 shrink-0" />
                <span>{listenHint}</span>
              </p>
            )}

            {rollout && (
              <div className="mt-2.5 rounded-lg bg-cool/10 px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-cool">{rollout.title}</span>
                  <span className="tnum shrink-0 text-xs text-cool/80">{rollout.index + 1}/{rollout.total}</span>
                  <button onClick={onCancelRollout} className="shrink-0 rounded-md bg-s3 px-2 py-0.5 text-xs text-ink-2 transition-colors hover:text-ink">Stop</button>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-s3">
                  <div className="h-full rounded-full bg-cool transition-[width] duration-500 ease-snap" style={{ width: `${((rollout.index + 1) / Math.max(1, rollout.total)) * 100}%` }} />
                </div>
                <p className="mt-1 truncate text-xs text-cool/80">{rollout.status}</p>
              </div>
            )}

            {ab && (
              <div className="mt-2.5 flex items-center gap-1.5">
                <span className="eyebrow">Compare</span>
                {(["a", "b"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => onPickAb(k)}
                    className={`h-7 w-8 rounded-md text-xs font-bold transition-colors ${ab.playing === k ? "bg-accent text-accent-ink" : "bg-s2 text-ink-2 hover:bg-s3"}`}
                  >
                    {k.toUpperCase()}
                  </button>
                ))}
                <button
                  onClick={() => onPickAb(ab.playing === "a" ? "keepA" : "keepB")}
                  className="h-7 rounded-md bg-s2 px-2.5 text-xs font-medium text-ink-2 transition-colors hover:bg-s3 hover:text-ink"
                >
                  Keep {ab.playing.toUpperCase()}
                </button>
              </div>
            )}
          </div>

          <Orb phase={phase} running={playing} beatSec={beatSec} onClick={onOrb} disabled={starting} size={96} />
        </div>

        <div className="mt-3.5">
          <SectionStrip song={song} nowSection={nowSection} playing={playing} onJump={onJump} />
        </div>

        {score && <p className="tnum mt-1 truncate text-xs text-ink-3">{score}</p>}
      </section>

      <Disclosure title="The music" icon="waveform" open={open.music} onToggle={() => toggle("music")}>
        <TrackLanes song={song} beat={beat} sectionIdx={nowSection} />
      </Disclosure>

      <Disclosure title="Mixer" icon="sliders" open={open.mixer} onToggle={() => toggle("mixer")}>
        <Mixer song={song} />
      </Disclosure>

      <Disclosure
        title="What I hear" icon="ear" open={open.ears} onToggle={() => toggle("ears")}
        right={hearing ? <Chip tone="accent">listening</Chip> : undefined}
      >
        <EarsPanel facts={facts} reference={reference} deltaText={deltaText} hearing={hearing} />
      </Disclosure>

      {started && (
        <Disclosure
          title="Producer's notes" icon="notes" open={open.notes} onToggle={() => toggle("notes")}
          badge={notes.length || undefined}
        >
          <CriticPanel notes={notes} headline={headline} thinking={criticThinking} onApply={onApply} onDismiss={onDismiss} />
        </Disclosure>
      )}
    </div>
  );
}

