"use client";
// The listen side. Not a chat: no text box, no send button, no bubbles. The orb, the mic
// you can see working, what it heard you say, what the producer is saying, the verdict
// and A/B controls when they apply, a quiet transcript, and the two ways to bring sound in.
import { useEffect, useRef } from "react";
import { Orb, type Phase } from "./Orb";
import { MicMeter } from "./Meters";
import { Icon } from "./Icon";
import { Button, IconButton } from "./ui";
import type { MicStatus } from "@/hooks/useMicLevel";
import type { VoiceStatus } from "@/hooks/useVoiceLoop";

export type Msg = { role: string; content: string };

export function ListenPanel({
  started, starting, phase, running, beatSec, onOrb,
  micLevel, micPeak, micStatus, voiceStatus, heardSomething, onRetryMic, muted, onMute,
  interim, lastHeard, messages, speaking, busy, onHush,
  humming, humCountIn, canVerdict, onVerdict, ab, onPickAb,
  onAnalyze, onReference, onSample, typed, onSend,
}: {
  started: boolean; starting: boolean; phase: Phase; running: boolean; beatSec: number; onOrb: () => void;
  micLevel: number; micPeak: number; micStatus: MicStatus; voiceStatus: VoiceStatus; heardSomething: boolean; onRetryMic: () => void; muted: boolean; onMute: (m: boolean) => void;
  interim: string; lastHeard: string; messages: Msg[]; speaking: boolean; busy: boolean; onHush: () => void;
  humming: boolean; humCountIn: number; canVerdict: boolean; onVerdict: (v: "liked" | "killed") => void;
  ab: { playing: string } | null; onPickAb: (k: string) => void;
  onAnalyze?: () => void; onReference: (f: File) => void; onSample: (f: File) => void; typed?: boolean; onSend?: (t: string) => void;
}) {
  const refInput = useRef<HTMLInputElement>(null);
  const clipInput = useRef<HTMLInputElement>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { logEnd.current?.scrollIntoView({ block: "end" }); }, [messages.length]);
  const lastProducer = [...messages].reverse().find((m) => m.role === "assistant")?.content ?? "";
  const mic = micLine(micStatus, voiceStatus, micLevel, heardSomething, muted);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The orb and the mic. */}
      <div className="flex flex-col items-center px-4 pb-3 pt-5">
        <Orb phase={phase} running={running} beatSec={beatSec} onClick={onOrb} disabled={starting} size={112} />
        {started ? (
          <div className="mt-3 w-full max-w-[300px]">
            <MicMeter level={micLevel} peak={micPeak} status={micStatus} />
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <p className={`min-w-0 flex-1 truncate text-xs ${mic.tone === "warn" ? "text-warn" : mic.tone === "live" ? "text-live" : "text-ink-3"}`}>{mic.text}</p>
              {mic.retry ? (
                <button onClick={onRetryMic} className="shrink-0 text-xs font-medium text-accent hover:underline">Retry</button>
              ) : (
                <button onClick={() => onMute(!muted)} aria-pressed={muted} className={`shrink-0 text-xs font-medium ${muted ? "text-accent" : "text-ink-3"} hover:text-ink`}>{muted ? "Unmute" : "Mute"}</button>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-3 max-w-[280px] text-center">
            <h2 className="text-lg font-semibold text-ink">Talk a song into existence</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">Press the orb. The music starts and the mic opens. Say what you want and the producer changes the track while you listen.</p>
            <p className="mt-2 text-xs text-ink-3">Chrome, headphones on. Allow the microphone when asked.</p>
          </div>
        )}
      </div>

      {started && (
        <>
          {/* You, then the producer. Large, live. */}
          <div className="space-y-3 px-5">
            <div>
              <div className="eyebrow flex items-center gap-1.5"><Icon name="mic" size={12} /> You</div>
              {interim ? (
                <p data-role="you-line" className="mt-1 text-lg leading-snug text-cool">{interim}<span className="animate-breathe">…</span></p>
              ) : lastHeard ? (
                <p data-role="you-line" className="mt-1 text-lg leading-snug text-ink">{lastHeard}</p>
              ) : humming ? (
                <p className="mt-1 text-lg leading-snug text-accent">{humCountIn > 0 ? `Hum it in ${humCountIn}` : "Humming. Keep going."}</p>
              ) : (
                <p className="mt-1 text-lg leading-snug text-ink-3">{micStatus === "live" ? "Say what you want to hear." : "Waiting for the microphone."}</p>
              )}
            </div>
            <div>
              <div className="eyebrow flex items-center gap-1.5"><Icon name="logo" size={12} /> Producer {speaking && <span className="ml-1 inline-flex gap-[3px]" aria-hidden>{[0, 140, 280].map((d) => <span key={d} className="h-1 w-1 rounded-full bg-accent animate-breathe" style={{ animationDelay: `${d}ms` }} />)}</span>}</div>
              <p data-role="producer-line" className={`mt-1 text-base leading-relaxed ${busy && !speaking ? "text-ink-3" : "text-ink-2"}`}>{busy && !lastProducer ? "Working on it." : lastProducer || "Ready when you are."}</p>
              {busy && lastProducer && <p className="mt-1 text-xs text-ink-3 animate-breathe">Working on it.</p>}
            </div>
            {(canVerdict || ab || speaking) && !busy && (
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {ab && (["a", "b"] as const).map((k) => (
                  <button key={k} onClick={() => onPickAb(k)} className={`h-8 w-9 rounded-full text-xs font-bold transition-colors ${ab.playing === k ? "bg-accent text-accent-ink" : "bg-s2 text-ink-2 hover:bg-s3"}`}>{k.toUpperCase()}</button>
                ))}
                {ab && <Button tone="ghost" onClick={() => onPickAb(ab.playing === "a" ? "keepA" : "keepB")}>Keep {ab.playing.toUpperCase()}</Button>}
                {canVerdict && !ab && <Button tone="quiet" icon="up" onClick={() => onVerdict("liked")}>Keep it</Button>}
                {canVerdict && !ab && <Button tone="quiet" icon="down" onClick={() => onVerdict("killed")}>Lose it</Button>}
                {speaking && <Button tone="quiet" icon="stop" onClick={onHush}>Stop talking</Button>}
              </div>
            )}
          </div>

          {/* The transcript, quiet. */}
          <div className="scroll-y mt-4 min-h-0 flex-1 border-t border-line/40 px-5 py-3">
            {messages.length === 0 ? (
              <p className="text-xs text-ink-3">The conversation shows up here.</p>
            ) : (
              <ol className="space-y-2">
                {messages.slice(-24).map((m, i) => (
                  <li key={i} className="grid grid-cols-[14px_1fr] gap-2 text-xs leading-relaxed">
                    <Icon name={m.role === "user" ? "mic" : "logo"} size={12} className={`mt-0.5 ${m.role === "user" ? "text-cool" : "text-accent"}`} />
                    <span className={m.role === "user" ? "text-ink-2" : "text-ink-3"}>{m.content}</span>
                  </li>
                ))}
              </ol>
            )}
            <div ref={logEnd} />
          </div>

          {/* Bring sound in. */}
          <div className="flex items-center gap-1 border-t border-line/40 px-3 py-2">
            {onAnalyze && <IconButton name="scissors" label="Analyze a record" onClick={onAnalyze} />}
            <IconButton name="headphones" label="Reference track" onClick={() => refInput.current?.click()} />
            <IconButton name="waveform" label="Sample or vocal" onClick={() => clipInput.current?.click()} />
            <span className="ml-auto text-[11px] text-ink-3">Voice only. Nothing to type.</span>
            {typed && onSend && (
              <input aria-label="Message the producer" placeholder="typed (test)" className="ml-2 w-32 rounded-md border border-line/60 bg-base px-2 py-1 text-xs text-ink"
                onKeyDown={(e) => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); if (v) { onSend(v); (e.target as HTMLInputElement).value = ""; } } }} />
            )}
          </div>
          <input ref={refInput} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onReference(f); e.target.value = ""; }} />
          <input ref={clipInput} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onSample(f); e.target.value = ""; }} />
        </>
      )}
    </div>
  );
}

function micLine(mic: MicStatus, voice: VoiceStatus, level: number, heard: boolean, muted: boolean): { text: string; tone: "warn" | "live" | "quiet"; retry?: boolean } {
  if (mic === "blocked" || voice === "blocked") return { text: "Microphone blocked. Click the lock icon in the address bar, allow the mic, then retry.", tone: "warn", retry: true };
  if (mic === "nodevice" || voice === "nodevice") return { text: "No microphone found. Plug one in, then retry.", tone: "warn", retry: true };
  if (voice === "unsupported") return { text: "This browser cannot do live speech. Use Chrome.", tone: "warn" };
  if (muted) return { text: "Mic muted.", tone: "quiet" };
  if (mic === "opening") return { text: "Opening the microphone.", tone: "quiet" };
  if (voice === "network") return { text: "Speech service reconnecting.", tone: "warn" };
  if (mic === "error" || voice === "error") return { text: "Mic trouble. Retry, or reload.", tone: "warn", retry: true };
  if (level > 0.12) return { text: "Hearing you.", tone: "live" };
  if (heard) return { text: "Listening.", tone: "quiet" };
  return { text: "Mic is live. Say something.", tone: "quiet" };
}
