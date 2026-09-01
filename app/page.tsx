"use client";
// The Producer: one orb, a mixer, lanes, the ears, and a conversation.
import { useEffect, useRef, useState } from "react";
import { useStudio } from "@/hooks/useStudio";
import { useVoiceLoop } from "@/hooks/useVoiceLoop";
import { useHum } from "@/hooks/useHum";
import { TrackLanes } from "@/components/TrackLanes";
import { Mixer } from "@/components/Mixer";
import { SectionStrip } from "@/components/SectionStrip";
import { EarsPanel } from "@/components/EarsPanel";
import { SongsSheet } from "@/components/SongsSheet";

export default function Studio() {
  const sendRef = useRef<(t: string) => void>(() => {});
  const voice = useVoiceLoop((t) => sendRef.current(t));
  const hum = useHum();
  const studio = useStudio(voice.say, (bpm, beats) => hum.record(bpm, beats));
  useEffect(() => { sendRef.current = (t) => void studio.send(t); }, [studio]);

  const [input, setInput] = useState("");
  const [showSongs, setShowSongs] = useState(false);
  const [showLanes, setShowLanes] = useState(true);
  const [showMixer, setShowMixer] = useState(true);
  const [showEars, setShowEars] = useState(true);
  const refInput = useRef<HTMLInputElement>(null);
  const clipInput = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [studio.messages, studio.busy, voice.interim]);

  const { song, started, paused, starting } = studio;
  const beatSec = 60 / song.bpm;

  async function orb() {
    const wasStarted = started;
    await studio.boot();
    if (!wasStarted) voice.begin();
  }

  const status = studio.hearing ? "hearing" : voice.speaking ? "speaking" : studio.busy ? "thinking" : voice.listening ? "listening" : started ? "ready" : "";

  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col p-4">
      <header className="flex items-center justify-between pb-2">
        <h1 className="text-lg font-extrabold tracking-tight">🎚 The Producer</h1>
        <div className="flex items-center gap-1.5">
          <button onClick={() => refInput.current?.click()} className="rounded-full bg-zinc-800 px-3 py-2 text-xs font-semibold" title="Upload a reference track for the producer to hear">🎧 Reference</button>
          <button onClick={() => clipInput.current?.click()} className="rounded-full bg-zinc-800 px-3 py-2 text-xs font-semibold" title="Add a sample or vocal as an audio track">🎤 Sample</button>
          <button onClick={() => setShowSongs(true)} className="rounded-full bg-zinc-800 px-3 py-2 text-xs font-semibold">Songs</button>
          <button onClick={() => void studio.download()} disabled={studio.rendering} className="rounded-full bg-zinc-800 px-3 py-2 text-xs font-semibold disabled:opacity-50">{studio.rendering ? "…" : "⬇"}</button>
        </div>
        <input ref={refInput} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void studio.addReference(f); e.target.value = ""; }} />
        <input ref={clipInput} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void studio.addClip(f); e.target.value = ""; }} />
      </header>

      <section className="rounded-3xl bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-bold">{song.title}</div>
            <div className="text-xs text-zinc-500">{song.bpm} BPM · {song.key} · {song.tracks.length} tracks{song.loop ? " · looping" : ""}{status ? ` · ${status}` : ""}</div>
            {studio.listenHint && <div className="mt-0.5 text-[11px] text-amber-300">👂 {studio.listenHint}</div>}
          </div>
          <button onClick={orb} disabled={starting} aria-label={!started ? "Start" : paused ? "Play" : "Pause"}
            className={`grid h-20 w-20 place-items-center rounded-full text-3xl font-black text-black shadow-xl transition-transform active:scale-95 ${!started || paused ? "bg-amber-500" : "bg-emerald-500"}`}
            style={!started || paused ? {} : { animation: `pulse-beat ${beatSec}s ease-out infinite` }}>
            {starting ? "…" : !started ? "▶" : paused ? "▶" : "❚❚"}
          </button>
        </div>
        <SectionStrip song={song} nowSection={studio.nowSection} playing={started && !paused} onJump={(id) => void studio.jump(id)} />
        <div className="mt-1 flex gap-3 text-[11px] font-semibold text-zinc-500">
          <button onClick={() => setShowLanes(!showLanes)}>{showLanes ? "▾ the music" : "▸ the music"}</button>
          <button onClick={() => setShowMixer(!showMixer)}>{showMixer ? "▾ mixer" : "▸ mixer"}</button>
          <button onClick={() => setShowEars(!showEars)}>{showEars ? "▾ ears" : "▸ ears"}</button>
        </div>
        {showLanes && <TrackLanes song={song} beat={started && !paused ? studio.beat : null} sectionIdx={studio.nowSection} />}
        {showMixer && <Mixer song={song} />}
        {showEars && <EarsPanel facts={studio.facts} reference={studio.reference} deltaText={studio.deltaText} hearing={studio.hearing} />}
      </section>

      <section className="mt-3 flex-1 space-y-2 overflow-y-auto rounded-3xl bg-zinc-900 p-4">
        {!started && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="max-w-xs text-[15px] leading-relaxed text-zinc-400">Tap the big button. The music starts, the mic opens, and you just talk. It answers out loud, hears its own work, and changes the song while you listen.</p>
            <p className="text-xs text-zinc-600">Chrome + headphones = best experience</p>
          </div>
        )}
        {started && studio.messages.slice(-30).map((m, i) => (
          <div key={i} className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] ${m.role === "user" ? "ml-auto bg-blue-600/80" : "bg-zinc-800"}`}>{m.content}</div>
        ))}
        {started && voice.interim && <div className="ml-auto max-w-[85%] rounded-2xl border border-blue-400/40 bg-blue-600/25 px-3.5 py-2 text-[15px] italic text-blue-100">{voice.interim}…</div>}
        {started && hum.recording && <div className="rounded-2xl bg-rose-900/60 px-3.5 py-2 text-[15px] text-rose-100">{hum.countIn > 0 ? `Hum in ${hum.countIn}…` : "🎙 Humming… keep going"}</div>}
        {started && studio.busy && (
          <div className="flex max-w-[85%] items-center gap-1.5 rounded-2xl bg-zinc-800 px-3.5 py-3">
            {[0, 120, 240].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: `${d}ms` }} />)}
          </div>
        )}
        {started && studio.lastMoveId && !studio.busy && (
          <div className="flex gap-2 pl-1 text-xs">
            <button onClick={() => studio.verdict("liked")} className="rounded-full bg-zinc-800 px-3 py-1 text-zinc-300">👍 keep</button>
            <button onClick={() => studio.verdict("killed")} className="rounded-full bg-zinc-800 px-3 py-1 text-zinc-300">👎 kill</button>
            {voice.speaking && <button onClick={voice.hush} className="rounded-full bg-zinc-800 px-3 py-1 text-zinc-300">shh</button>}
          </div>
        )}
        <div ref={chatEndRef} />
      </section>

      <footer className="pt-3">
        {started && (
          <div className="flex items-center gap-2">
            <span className={`shrink-0 text-lg ${voice.listening ? "" : "opacity-30"}`} title={voice.listening ? "listening" : "mic idle"}>🎙</span>
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) { void studio.send(input); setInput(""); } }}
              placeholder={voice.listening ? "talk, or type here…" : "type here…"}
              className="w-full rounded-full bg-zinc-900 px-5 py-3 text-[15px] outline-none ring-1 ring-zinc-800 focus:ring-zinc-600" />
          </div>
        )}
      </footer>

      {showSongs && <SongsSheet library={studio.library} clips={studio.clips} onOpen={(s) => { setShowSongs(false); void studio.loadSaved(s); }} onDownload={(s) => void studio.download(s)} onClose={() => setShowSongs(false)} />}
      {studio.toast && <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-800 px-5 py-2.5 text-sm font-semibold shadow-xl">{studio.toast}</div>}
      <style>{`@keyframes pulse-beat { 0% { transform: scale(1.06); } 35% { transform: scale(1); } 100% { transform: scale(1); } }`}</style>
    </main>
  );
}
