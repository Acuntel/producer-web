"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { SEED_SONG, type Song, type Track } from "@/lib/song";

const ROLE_COLOR: Record<string, string> = {
  kick: "#f59e0b", clap: "#f87171", snare: "#fb923c", hat: "#a1a1aa", openhat: "#d4d4d8",
  bass: "#34d399", sub: "#2dd4bf", chords: "#818cf8", stab: "#c084fc", pad: "#60a5fa",
  lead: "#f472b6", pluck: "#e879f9",
};

// The music, visible: every track a lane, every note a block, the playhead
// sweeping each lane's own loop. Read-only — his eyes, the AI's hands.
function TrackLanes({ song, beat, sectionIdx }: { song: Song; beat: number | null; sectionIdx: number }) {
  const starts = useMemo(() => {
    const byId = new Map(song.sections.map((s) => [s.id, s]));
    let c = 0;
    return song.arrangement.map((id) => {
      const s = byId.get(id);
      const r = { id, active: s?.active ?? [], startBeat: c, beats: (s?.bars ?? 0) * 4 };
      c += r.beats;
      return r;
    });
  }, [song]);
  const cur = sectionIdx >= 0 && sectionIdx < starts.length ? starts[sectionIdx] : null;

  return (
    <div className="mt-3 space-y-1.5">
      {song.tracks.map((tr: Track) => {
        const activeNow = cur ? cur.active.includes(tr.id) : true;
        const color = ROLE_COLOR[tr.role] ?? "#a1a1aa";
        const melodic = ["bass", "sub", "chords", "stab", "pad", "lead", "pluck"].includes(tr.role);
        const pitches = melodic ? tr.notes.map((n) => n[0]) : [];
        const pMin = pitches.length ? Math.min(...pitches) : 0;
        const pMax = pitches.length ? Math.max(...pitches) : 1;
        const span = Math.max(1, pMax - pMin);
        const local = beat !== null && cur && activeNow ? ((beat - cur.startBeat) % tr.loopBeats + tr.loopBeats) % tr.loopBeats : null;
        return (
          <div key={tr.id} className="flex items-center gap-2" style={{ opacity: activeNow ? 1 : 0.28 }}>
            <span className="w-16 shrink-0 truncate text-[10px] font-bold uppercase tracking-wide" style={{ color }}>{tr.name}</span>
            <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-zinc-950/70">
              {Array.from({ length: tr.loopBeats }, (_, b) => (
                <div key={b} className="absolute top-0 h-full w-px bg-zinc-800" style={{ left: `${(b / tr.loopBeats) * 100}%` }} />
              ))}
              {tr.notes.map((n, i) => {
                const lit = local !== null && local >= n[1] && local < n[1] + Math.max(0.24, n[2]);
                return (
                  <div key={i} className="absolute rounded-[2px]" style={{
                    left: `${(n[1] / tr.loopBeats) * 100}%`,
                    width: `${Math.max((n[2] / tr.loopBeats) * 100, 1.4)}%`,
                    top: melodic ? `${(1 - (n[0] - pMin) / span) * 70 + 8}%` : `${86 - (n[3] / 127) * 74}%`,
                    height: melodic ? "22%" : `${(n[3] / 127) * 74}%`,
                    background: color,
                    opacity: lit ? 1 : 0.35 + (n[3] / 127) * 0.35,
                    boxShadow: lit ? `0 0 6px ${color}` : "none",
                  }} />
                );
              })}
              {local !== null && (
                <div className="absolute top-0 h-full w-[2px] bg-white/80" style={{ left: `${(local / tr.loopBeats) * 100}%` }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Msg = { role: "user" | "assistant"; content: string };
type SavedSong = { song: Song; savedAt: number };

function loadLibrary(): SavedSong[] {
  try { return JSON.parse(localStorage.getItem("producer.library.v1") ?? "[]"); } catch { return []; }
}
function persistLibrary(lib: SavedSong[]) {
  try { localStorage.setItem("producer.library.v1", JSON.stringify(lib.slice(0, 20))); } catch {}
}

export default function Studio() {
  const [song, setSong] = useState<Song>(SEED_SONG);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [listening, setListening] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [nowSection, setNowSection] = useState<number>(-1);
  const [interim, setInterim] = useState("");
  const [library, setLibrary] = useState<SavedSong[]>([]);
  const [showSongs, setShowSongs] = useState(false);
  const [toast, setToast] = useState("");
  const [beat, setBeat] = useState<number | null>(null);
  const [showLanes, setShowLanes] = useState(true);

  const engineRef = useRef<import("@/lib/engine").Engine | null>(null);
  const earsRef = useRef<import("@/lib/engine").Ears | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const sessionRef = useRef(false);
  const speakingRef = useRef(false);
  const busyRef = useRef(false);
  const pendingRef = useRef<string | null>(null);
  const songRef = useRef(song);
  const messagesRef = useRef(messages);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { songRef.current = song; }, [song]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => {
    try {
      const s = localStorage.getItem("producer.song.v3");
      const m = localStorage.getItem("producer.chat.v2");
      if (s) { const p = JSON.parse(s); if (p?.sections && p?.arrangement) setSong(p); }
      if (m) setMessages(JSON.parse(m));
    } catch {}
    setLibrary(loadLibrary());
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("producer.song.v3", JSON.stringify(song));
      localStorage.setItem("producer.chat.v2", JSON.stringify(messages.slice(-40)));
    } catch {}
  }, [song, messages]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy, interim]);

  // Drive the visible playhead.
  useEffect(() => {
    if (!started) return;
    const t = window.setInterval(() => {
      setBeat(engineRef.current?.getBeat() ?? null);
    }, 90);
    return () => window.clearInterval(t);
  }, [started]);

  function flash(t: string) {
    setToast(t);
    setTimeout(() => setToast(""), 1800);
  }

  async function getEngine() {
    if (!engineRef.current) {
      const { Engine } = await import("@/lib/engine");
      engineRef.current = new Engine();
      engineRef.current.onSection = (_n: string, idx: number) => setNowSection(idx);
    }
    return engineRef.current;
  }

  // ---- Voice loop ----
  function startRecognition() {
    if (!sessionRef.current || speakingRef.current) return;
    const W = window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike; SpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) return;
    try { recRef.current?.abort?.(); } catch {}
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (ev) => {
      const results = ev.results as unknown as { isFinal: boolean; 0: { transcript: string } }[] & { length: number };
      let interimText = "";
      for (let i = 0; i < results.length; i++) if (!results[i].isFinal) interimText += results[i][0].transcript;
      setInterim(interimText.trim());
      const lastR = results[results.length - 1];
      if (lastR?.isFinal) {
        setInterim("");
        const said = lastR[0]?.transcript?.trim();
        if (said) handleUtterance(said);
      }
    };
    rec.onend = () => {
      setListening(false);
      if (sessionRef.current && !speakingRef.current) setTimeout(startRecognition, 300);
    };
    rec.onerror = () => {};
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch {}
  }

  function stopRecognition() {
    try { recRef.current?.abort?.(); recRef.current?.stop(); } catch {}
    setListening(false);
  }

  function speak(text: string) {
    if (typeof speechSynthesis === "undefined") { startRecognition(); return; }
    speakingRef.current = true;
    stopRecognition();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.06;
    u.onend = () => { speakingRef.current = false; startRecognition(); };
    u.onerror = () => { speakingRef.current = false; startRecognition(); };
    speechSynthesis.speak(u);
  }

  function handleUtterance(said: string) {
    if (busyRef.current) { pendingRef.current = said; return; }
    void send(said);
  }

  async function refreshEars(s: Song) {
    try {
      const { analyzeSong } = await import("@/lib/engine");
      earsRef.current = await analyzeSong(s);
    } catch {}
  }

  function autoSave(s: Song) {
    const lib = [{ song: s, savedAt: Date.now() }, ...loadLibrary().filter((x) => x.song.title !== s.title)];
    persistLibrary(lib);
    setLibrary(lib.slice(0, 20));
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t) return;
    setInput("");
    busyRef.current = true;
    const nowPlaying = engineRef.current?.getPosition() ?? null;
    const next: Msg[] = [...messagesRef.current, { role: "user", content: t }];
    setMessages(next);
    setBusy(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, song: songRef.current, ears: earsRef.current, nowPlaying }),
      });
      const data = await r.json();
      setMessages((m) => [...m, { role: "assistant", content: data.say }]);
      const eng = await getEngine();
      if (data.song) {
        setSong(data.song);
        eng.update(data.song);
        autoSave(data.song);
        void refreshEars(data.song);
      }
      if (data.action === "pause") { eng.pause(); setPaused(true); }
      if (data.action === "play") { eng.resume(); setPaused(false); }
      speak(data.say);
    } catch {
      const line = "Connection wobbled — say that again?";
      setMessages((m) => [...m, { role: "assistant", content: line }]);
      speak(line);
    } finally {
      busyRef.current = false;
      setBusy(false);
      const p = pendingRef.current;
      pendingRef.current = null;
      if (p) void send(p);
    }
  }

  // ---- THE orb: one control. First tap boots everything; then play/pause. ----
  async function orb() {
    if (starting) return;
    if (!started) {
      setStarting(true);
      try {
        const eng = await getEngine();
        sessionRef.current = true;
        await eng.start(songRef.current);
        setStarted(true);
        setPaused(false);
        const hasChat = messagesRef.current.length > 0;
        const greeting = hasChat
          ? "We're back. Tell me what you're hearing."
          : "We're live. That's our groove. Name a vibe, or just say surprise me.";
        setMessages((m) => [...m, { role: "assistant", content: greeting }]);
        speak(greeting);
        void refreshEars(songRef.current);
      } finally {
        setStarting(false);
      }
      return;
    }
    const eng = await getEngine();
    if (paused) { eng.resume(); setPaused(false); }
    else { eng.pause(); setPaused(true); }
  }

  function saveNow() {
    autoSave(songRef.current);
    flash(`Saved “${songRef.current.title}”`);
  }

  async function loadSaved(item: SavedSong) {
    autoSave(songRef.current);
    setSong(item.song);
    earsRef.current = null;
    setShowSongs(false);
    if (started) {
      (await getEngine()).update(item.song);
      const g = `Loaded ${item.song.title}. Where were we?`;
      setMessages((m) => [...m, { role: "assistant", content: g }]);
      speak(g);
      void refreshEars(item.song);
    }
    flash(`Loaded “${item.song.title}”`);
  }

  async function download(s?: Song) {
    setRendering(true);
    try {
      const target = s ?? songRef.current;
      const { renderWav } = await import("@/lib/engine");
      const blob = await renderWav(target);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${target.title.replace(/\s+/g, "-")}.wav`;
      a.click();
      URL.revokeObjectURL(url);
      flash("Downloading your song");
    } finally {
      setRendering(false);
    }
  }

  const beatSec = 60 / song.bpm;

  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col p-4">
      <header className="flex items-center justify-between pb-2">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight">🎚 The Producer</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSongs(true)} className="rounded-full bg-zinc-800 px-4 py-2 text-sm font-semibold">My songs</button>
          <button onClick={saveNow} className="rounded-full bg-zinc-800 px-4 py-2 text-sm font-semibold">Save</button>
          <button onClick={() => void download()} disabled={rendering}
            className="rounded-full bg-zinc-800 px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {rendering ? "…" : "Download"}
          </button>
        </div>
      </header>

      <section className="rounded-3xl bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-bold">{song.title}</div>
            <div className="text-xs text-zinc-500">{song.bpm} BPM · {song.key}</div>
          </div>
          <button onClick={orb} disabled={starting} aria-label={!started ? "Start" : paused ? "Play" : "Pause"}
            className={`grid h-20 w-20 place-items-center rounded-full text-3xl font-black text-black shadow-xl transition-transform active:scale-95 ${!started || paused ? "bg-amber-500" : "bg-emerald-500"}`}
            style={!started || paused ? {} : { animation: `pulse-beat ${beatSec}s ease-out infinite` }}>
            {starting ? "…" : !started ? "▶" : paused ? "▶" : "❚❚"}
          </button>
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
          {song.arrangement.map((sid, i) => {
            const sec = song.sections.find((s) => s.id === sid);
            if (!sec) return null;
            return (
              <div key={i}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide ${i === nowSection && started && !paused ? "bg-amber-500 text-black" : "bg-zinc-800 text-zinc-500"}`}
                style={{ minWidth: `${sec.bars * 7}px` }}>
                {sec.name}
              </div>
            );
          })}
        </div>
        <button onClick={() => setShowLanes(!showLanes)} className="mt-1 text-[11px] font-semibold text-zinc-500">
          {showLanes ? "▾ the music" : "▸ show the music"}
        </button>
        {showLanes && <TrackLanes song={song} beat={started && !paused ? beat : null} sectionIdx={nowSection} />}
      </section>

      <section className="mt-3 flex-1 space-y-2 overflow-y-auto rounded-3xl bg-zinc-900 p-4">
        {!started && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="max-w-xs text-[15px] leading-relaxed text-zinc-400">
              Tap the big button. The music starts, the mic opens, and you just talk —
              it answers out loud and changes the song while you listen.
            </p>
            <p className="text-xs text-zinc-600">Chrome + headphones = best experience</p>
          </div>
        )}
        {started && messages.slice(-30).map((m, i) => (
          <div key={i} className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] ${m.role === "user" ? "ml-auto bg-blue-600/80" : "bg-zinc-800"}`}>
            {m.content}
          </div>
        ))}
        {started && interim && (
          <div className="ml-auto max-w-[85%] rounded-2xl border border-blue-400/40 bg-blue-600/25 px-3.5 py-2 text-[15px] italic text-blue-100">
            {interim}…
          </div>
        )}
        {started && busy && (
          <div className="flex max-w-[85%] items-center gap-1.5 rounded-2xl bg-zinc-800 px-3.5 py-3">
            <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: "0ms" }} />
            <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: "120ms" }} />
            <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: "240ms" }} />
          </div>
        )}
        <div ref={chatEndRef} />
      </section>

      <footer className="pt-3">
        {started && (
          <div className="flex items-center gap-2">
            <span className={`shrink-0 text-lg ${listening ? "" : "opacity-30"}`} title={listening ? "listening" : "mic idle"}>🎙</span>
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder={listening ? "talk, or type here…" : "type here…"}
              className="w-full rounded-full bg-zinc-900 px-5 py-3 text-[15px] outline-none ring-1 ring-zinc-800 focus:ring-zinc-600" />
          </div>
        )}
      </footer>

      {showSongs && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4" onClick={() => setShowSongs(false)}>
          <div className="max-h-[70vh] w-full max-w-md overflow-y-auto rounded-3xl bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold">My songs</h2>
              <button onClick={() => setShowSongs(false)} className="rounded-full bg-zinc-800 px-3 py-1 text-sm">✕</button>
            </div>
            {library.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">Nothing saved yet — your songs save automatically as you work.</p>}
            {library.map((item, i) => (
              <div key={i} className="mb-2 flex items-center justify-between rounded-2xl bg-zinc-800 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">{item.song.title}</div>
                  <div className="text-xs text-zinc-500">{item.song.bpm} BPM · {new Date(item.savedAt).toLocaleDateString()}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => void loadSaved(item)} className="rounded-full bg-amber-500 px-4 py-1.5 text-sm font-bold text-black">Open</button>
                  <button onClick={() => void download(item.song)} className="rounded-full bg-zinc-700 px-3 py-1.5 text-sm">⬇</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-800 px-5 py-2.5 text-sm font-semibold shadow-xl">
          {toast}
        </div>
      )}

      <style>{`@keyframes pulse-beat { 0% { transform: scale(1.06); } 35% { transform: scale(1); } 100% { transform: scale(1); } }`}</style>
    </main>
  );
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { results: { [i: number]: { [j: number]: { transcript: string } }; length: number } }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};
