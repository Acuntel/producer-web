"use client";
// The conversation is the product. It owns its own scroll and a pinned composer,
// so it never renders as the empty black box that used to fill half the screen.
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Button, IconButton } from "./ui";

export type Msg = { role: string; content: string };

const OPENERS = [
  "Just make me a song",
  "Something dark and hypnotic",
  "KETTAMA style, surprise me",
  "Give me a bassline I can hum to",
];

export function Conversation({
  started, messages, busy, interim, humming, humCountIn, listening, speaking,
  canVerdict, onVerdict, onHush, onSend, onReference, onSample,
}: {
  started: boolean; messages: Msg[]; busy: boolean; interim: string; humming: boolean;
  humCountIn: number; listening: boolean; speaking: boolean; canVerdict: boolean;
  onVerdict: (v: "liked" | "killed") => void; onHush: () => void; onSend: (t: string) => void;
  onReference: (f: File) => void; onSample: (f: File) => void;
}) {
  const [input, setInput] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const refInput = useRef<HTMLInputElement>(null);
  const clipInput = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy, interim, humming]);

  function submit() {
    const v = input.trim();
    if (!v) return;
    onSend(v);
    setInput("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scroll-y flex min-h-0 flex-1 flex-col gap-2.5 px-4 py-4">
        {!started ? (
          <div className="m-auto flex max-w-sm flex-col items-center gap-4 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-s2 text-accent">
              <Icon name="waveform" size={24} />
            </span>
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold text-ink">Talk a song into existence</h2>
              <p className="text-sm leading-relaxed text-ink-2">
                Press play. The music starts and the mic opens. Say what you want and it changes the track while you listen.
              </p>
            </div>
            <p className="text-xs text-ink-3">Works best in Chrome with headphones on.</p>
          </div>
        ) : (
          <>
            {messages.slice(-40).map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] animate-fade-up rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed lg:max-w-[62ch] ${
                  m.role === "user" ? "ml-auto rounded-br-md bg-cool/20 text-ink" : "rounded-bl-md bg-s2 text-ink"
                }`}
              >
                {m.content}
              </div>
            ))}

            {interim && (
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md border border-cool/35 bg-cool/10 px-3.5 py-2.5 text-[15px] italic text-cool lg:max-w-[62ch]">
                {interim}…
              </div>
            )}

            {humming && (
              <div className="flex items-center gap-2 rounded-2xl bg-accent/15 px-3.5 py-2.5 text-[15px] text-accent">
                <Icon name="mic" size={16} />
                {humCountIn > 0 ? `Hum it in ${humCountIn}…` : "Humming. Keep going."}
              </div>
            )}

            {busy && (
              <div className="flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-md bg-s2 px-4 py-3.5" aria-label="Working">
                {[0, 140, 280].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 rounded-full bg-ink-3 animate-breathe" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            )}

            {canVerdict && !busy && (
              <div className="flex animate-fade-up gap-2 pt-0.5">
                <Button tone="quiet" icon="up" onClick={() => onVerdict("liked")}>Keep it</Button>
                <Button tone="quiet" icon="down" onClick={() => onVerdict("killed")}>Lose it</Button>
                {speaking && <Button tone="quiet" onClick={onHush}>Stop talking</Button>}
              </div>
            )}
          </>
        )}
        <div ref={endRef} />
      </div>

      {/* Openers turn a blank prompt into one tap. */}
      {started && messages.filter((m) => m.role === "user").length === 0 && !busy && (
        <div className="scroll-x flex gap-1.5 px-4 pb-1">
          {OPENERS.map((o) => (
            <button
              key={o}
              onClick={() => onSend(o)}
              className="shrink-0 rounded-full border border-line/60 bg-s2 px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-s3 hover:text-ink"
            >
              {o}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-line/50 bg-s1/80 px-3 py-3">
        <div className="flex items-end gap-2">
          <div className="relative">
            <IconButton name="plus" label="Add a reference or sample" onClick={() => setAttachOpen((v) => !v)} disabled={!started} />
            {attachOpen && started && (
              <>
                <button className="fixed inset-0 z-40 cursor-default" aria-hidden onClick={() => setAttachOpen(false)} />
                <div className="panel absolute bottom-11 left-0 z-50 w-56 animate-fade-up overflow-hidden rounded-xl p-1">
                  <MenuItem icon="headphones" title="Reference track" hint="It listens and compares" onClick={() => { setAttachOpen(false); refInput.current?.click(); }} />
                  <MenuItem icon="mic" title="Sample or vocal" hint="Adds it as a track" onClick={() => { setAttachOpen(false); clipInput.current?.click(); }} />
                </div>
              </>
            )}
          </div>

          <div className="flex flex-1 items-center gap-2 rounded-2xl border border-line/60 bg-base px-3 py-1.5 transition-colors focus-within:border-accent/60">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              disabled={!started}
              placeholder={!started ? "Press play to begin" : listening ? "Talk, or type here" : "Type here"}
              aria-label="Message the producer"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] text-ink placeholder:text-ink-3 focus:outline-none disabled:cursor-not-allowed"
            />
            {started && (
              <span
                title={listening ? "Mic is open" : "Mic idle"}
                className={`shrink-0 transition-colors ${listening ? "text-accent" : "text-ink-3 opacity-50"}`}
              >
                <Icon name="mic" size={16} />
              </span>
            )}
          </div>

          <IconButton name="send" label="Send" tone={input.trim() ? "accent" : "ghost"} onClick={submit} disabled={!started || !input.trim()} />
        </div>
      </div>

      <input ref={refInput} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onReference(f); e.target.value = ""; }} />
      <input ref={clipInput} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onSample(f); e.target.value = ""; }} />
    </div>
  );
}

function MenuItem({ icon, title, hint, onClick }: { icon: "headphones" | "mic"; title: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-s2">
      <Icon name={icon} size={16} className="shrink-0 text-ink-3" />
      <span className="min-w-0">
        <span className="block truncate text-sm text-ink">{title}</span>
        <span className="block truncate text-xs text-ink-3">{hint}</span>
      </span>
    </button>
  );
}
