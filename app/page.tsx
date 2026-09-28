"use client";
// The Producer, V11. A landing with two choices, then the stage: black, an edge glow that
// shows what the producer is doing, the record moving in front of you, the conversation
// in large type, and one control at the bottom. Everything else is voice.
import { useEffect, useMemo, useRef, useState } from "react";
import { useStudio } from "@/hooks/useStudio";
import { useHum } from "@/hooks/useHum";
import { useCritic } from "@/hooks/useCritic";
import { useAccount } from "@/hooks/useAccount";
import { useProjects, type SnapshotMeta } from "@/hooks/useProjects";
import { useStems } from "@/hooks/useStems";
import { useVault } from "@/hooks/useVault";
import { vaultKeysOf } from "@/lib/account/clips";
import { useVoiceOut } from "@/hooks/useVoiceOut";
import { useSpeak } from "@/hooks/useSpeak";
import { useStopWords } from "@/hooks/useStopWords";
import { useConversation } from "@/hooks/useConversation";
import { useRitual } from "@/hooks/useRitual";
import { useDraft } from "@/hooks/useDraft";
import { useQuestions } from "@/hooks/useQuestions";
import { JobBar } from "@/components/JobBar";
import { Glow, type GlowState } from "@/components/Glow";
import { Landing } from "@/components/Landing";
import { Library } from "@/components/Library";
import { SpeakButton, type SpeakState } from "@/components/SpeakButton";
import { Ribbon } from "@/components/Ribbon";
import { Board } from "@/components/Board";
import { WorkCards } from "@/components/WorkCards";
import { StatusLine } from "@/components/StatusLine";
import { AccountSheet } from "@/components/AccountSheet";
import { AnalyzeSheet } from "@/components/AnalyzeSheet";
import { Icon } from "@/components/Icon";
import { TraceOverlay } from "@/components/TraceOverlay";
import { countAppCommit, traceOn } from "@/lib/engine/ledger";
import type { Song } from "@/lib/song/types";
import type { BrainAction } from "@/lib/brain/parse";

const harnessMode = () => typeof window !== "undefined" && /[?&](e2e|typed)=1/.test(window.location.search);
type Actions = { analyze: (i: { url?: string; query?: string; from?: "local" | "web" }) => Promise<void>; vocal: (p: string, l?: string, ms?: number) => Promise<void>; findSound: (beats: number) => Promise<void>; hear: (sectionId?: string) => Promise<string | null>; identify: () => Promise<string | null>; tracklist: (i: { url?: string; query?: string }) => Promise<void>; ritual: (a: BrainAction) => Promise<unknown>; draft: (name: string | null) => unknown };

export default function App() {
  // Server and client must render the same first frame: the harness flag is read after mount.
  const [view, setView] = useState<"landing" | "library" | "stage">("landing");
  const [typed, setTyped] = useState(false);
  useEffect(() => { if (harnessMode()) { setTyped(true); if (/[?&]library=1/.test(window.location.search)) setView("library"); else if (!/[?&]landing=1/.test(window.location.search)) setView("stage"); } }, []);
  // No paid voice configured: the free voice starts downloading now, so it is ready by the first reply.
  useEffect(() => { fetch("/api/health").then((r) => r.json()).then((h: { voice?: boolean }) => { if (h && h.voice === false) void import("@/lib/voice/kokoro").then((m) => m.loadKokoro()); }).catch(() => {}); }, []);
  // The ledger counts every commit of the page, so "nothing re-renders in a loop" is a number.
  useEffect(() => { countAppCommit(); });
  const [trace, setTrace] = useState(false);
  useEffect(() => { setTrace(traceOn()); }, []);
  const [showAccount, setShowAccount] = useState(false);
  const [showAnalyze, setShowAnalyze] = useState(false);
  const snapshotRef = useRef<(s: Song, m: SnapshotMeta) => void>(() => {});
  const actionsRef = useRef<Actions>({ analyze: async () => {}, vocal: async () => {}, findSound: async () => {}, hear: async () => null, identify: async () => null, tracklist: async () => {}, ritual: async () => null, draft: () => null });
  const duckRef = useRef<(on: boolean) => void>(() => {});
  const landingRef = useRef<(c: { open?: string; new?: boolean; library?: boolean; account?: boolean }) => void>(() => {});

  const playingRef = useRef<() => boolean>(() => false);
  const voiceOut = useVoiceOut({ duck: (on) => duckRef.current(on), playing: () => playingRef.current() });
  const hum = useHum();
  const account = useAccount();
  const studio = useStudio(voiceOut.speak, (bpm, beats) => hum.record(bpm, beats), (s, m) => snapshotRef.current(s, m), {
    prefetchVoice: voiceOut.prefetch,
    analyze: (i) => actionsRef.current.analyze(i), vocal: (p, l, ms) => actionsRef.current.vocal(p, l, ms), findSound: (b) => actionsRef.current.findSound(b),
    hear: (sec) => actionsRef.current.hear(sec), identify: () => actionsRef.current.identify(), tracklist: (i) => actionsRef.current.tracklist(i), ritual: (a) => actionsRef.current.ritual(a),
    draft: (name) => { actionsRef.current.draft(name); },
  });
  duckRef.current = studio.duck;
  playingRef.current = () => (studio.started && !studio.paused) || studio.starting;   // the greeting runs while the record starts
  const projects = useProjects({ user: account.user, loadSong: studio.loadSong, loadChat: studio.loadChat, getSong: studio.getSong, localLibrary: studio.library, flash: studio.flash });
  snapshotRef.current = projects.snapshot;
  const vault = useVault({ user: account.user, projectId: projects.current?.id ?? null, flash: studio.flash });
  const stems = useStems({ user: account.user, projectId: projects.current?.id ?? null, flash: studio.flash, edit: studio.edit, send: studio.send, registerClip: studio.registerClip, getSong: studio.getSong, setReference: studio.setReferenceBuffer, setReferenceFacts: studio.setReferenceFacts, recordSound: (bpm, beats) => hum.record(bpm, beats), previewClip: studio.previewClip, noteClip: vault.note });
  // A record names its audio; this browser may never have seen it. Whenever that list changes,
  // whatever is missing is fetched back from the account before anyone notices silence.
  // It runs when the list or the account changes, never because the page re-rendered: the hooks'
  // objects are new every render, and depending on them was a render loop that opened IndexedDB each time.
  const clipKeys = useMemo(() => vaultKeysOf(studio.song).join("|"), [studio.song]);
  const uid = account.user?.id ?? null;
  const restoreRef = useRef(vault.restore); restoreRef.current = vault.restore;
  const getSongRef = useRef(studio.getSong); getSongRef.current = studio.getSong;
  useEffect(() => { if (clipKeys) void restoreRef.current(getSongRef.current()); }, [clipKeys, uid]);
  const ritual = useRitual({ studio, stems, speak: voiceOut.speak, speaking: voiceOut.speaking, signedIn: !!account.user });
  const draft = useDraft({ studio, speak: voiceOut.speak, findAndAnalyze: (q) => stems.findAndAnalyze(q, null), job: stems.job, signedIn: !!account.user });
  actionsRef.current = {
    analyze: async (i) => { setShowAnalyze(true); if (i.url) await stems.start({ url: i.url }); else await stems.findAndAnalyze(i.query ?? "", i.from ?? null); },
    vocal: async (p, l, ms) => { setShowAnalyze(true); await stems.renderVocal(p, l, ms); },
    findSound: async (b) => { await stems.findSound(b); },
    hear: async (sec) => stems.hearOurRender(sec),
    identify: async () => { setShowAnalyze(true); return stems.identifyPlaying(); },
    tracklist: async (i) => { setShowAnalyze(true); await stems.startTracklist(i); },
    ritual: (a) => ritual.act(a),
    draft: (name) => draft.run(name),
  };
  useCritic({ song: studio.song, facts: studio.facts, reference: studio.reference, paused: !!studio.rollout, send: studio.send, started: studio.started });
  // The harness can hand the studio a vocal stem it made itself and watch where the phrase lands.
  useEffect(() => { if (harnessMode()) (window as unknown as { __vocal?: unknown }).__vocal = (said: string | null, where: string | null, job: unknown) => stems.dropVocal(said, where, job as never); }, [stems]);
  // The sentence-hole probe says a line through the producer's voice and reads where each sentence landed.
  const speakRef = useRef(voiceOut.speak); speakRef.current = voiceOut.speak;
  useEffect(() => { if (harnessMode()) (window as unknown as { __say?: unknown }).__say = (t: string) => speakRef.current(t); }, []);

  const titles = useMemo(() => [...projects.projects.map((p) => p.title), ...studio.library.map((s) => s.song.title)], [projects.projects, studio.library]);
  // The stage warms the name resolver's store, so the first name said is not the one that loads it.
  useEffect(() => { if (view === "stage") void fetch("/api/draft").catch(() => {}); }, [view]);
  const holdingRef = useRef(false);
  const questions = useQuestions({ studio, speak: voiceOut.speak, talking: voiceOut.speaking || holdingRef.current, draftNow: draft.current, next: (st, why) => draft.next(st, why), vocal: (from) => void stems.vocalFrom(null, null, from) });
  const convo = useConversation({ studio, voice: voiceOut, screen: view === "stage" ? "stage" : view, projects: titles, onLanding: (c) => landingRef.current(c), grab: stems.grab, vocal: stems.vocalFrom, ritual, draft, questions });
  const speak = useSpeak({ onFinal: (t, ms) => void convo.hear(t, ms), onPress: () => convo.interrupt() });
  holdingRef.current = speak.holding;
  useStopWords(convo.auditioning, () => convo.interrupt(true));

  const { song, started, paused } = studio;
  const playing = started && !paused;
  // Harness mode opens on the stage with the seed record and starts the session itself
  // (headless Chrome runs with autoplay allowed, so no gesture is needed).
  const bootedRef = useRef(false);
  // It presses once the stage is ready (armed, greeting fetched), the way a person presses after the page is up.
  useEffect(() => { if (typed && view === "stage" && !started && !studio.starting && !bootedRef.current) { bootedRef.current = true; void studio.whenArmed().then(() => studio.boot()); } }, [typed, view, started, studio]);
  const gate = account.ready && account.enabled && !account.user && !account.guest;
  const device = useMemo(() => { const cloud = new Set(projects.projects.map((p) => p.title)); return account.user ? studio.library.filter((s) => !cloud.has(s.song.title)) : studio.library; }, [account.user, projects.projects, studio.library]);

  // Entering the stage never waits on anything that can hang: the screen switches first, the record loads behind it,
  // and a failure to start audio says so out loud instead of leaving someone on the landing with nothing playing.
  async function enter(load: () => Promise<void>) {
    setView("stage");
    try { voiceOut.warm(); } catch { /* warming the voice is a nicety, never a gate */ }
    try { await load(); } catch { studio.flash("That record did not load. Tell me what to build and I will start fresh."); }
    try {
      if (!started) await studio.boot();
      else if (paused) await studio.play();
    } catch { studio.flash("Press and hold the button once so the browser lets the sound through."); }
  }
  landingRef.current = ({ open, new: fresh, library, account: acct }) => {
    if (acct) { setShowAccount(true); return; }
    if (library) { if (playing) void studio.pause(); setView("library"); return; }
    if (fresh) { convo.reset(); void enter(async () => { projects.startFresh(); await studio.newSession(); }); return; }
    if (!open) return;
    convo.reset();
    const q = open.toLowerCase();
    const cloud = projects.projects.find((p) => p.title.toLowerCase().includes(q));
    if (cloud) { void enter(() => projects.open(cloud.id)); return; }
    const local = studio.library.find((s) => s.song.title.toLowerCase().includes(q));
    if (local) void enter(() => studio.loadSaved(local));
    else void voiceOut.speak(`I do not see a project called ${open}. Say new project, or name one from the list.`);
  };

  const glow: GlowState = speak.holding ? "listening" : convo.thinking ? "thinking" : voiceOut.speaking ? "speaking" : convo.auditioning ? "audition" : playing ? "playing" : "idle";
  const button: SpeakState = speak.status === "holding" ? "holding" : speak.status === "sending" ? "sending" : voiceOut.speaking ? "speaking" : "idle";
  const micHint = speak.status === "blocked" ? "Microphone blocked. Allow it in the address bar, then try again." : speak.status === "nodevice" ? "No microphone found." : speak.status === "unsupported" ? "This browser cannot do live speech. Use Chrome." : undefined;
  const measured = studio.facts ? `${Math.round(studio.facts.tempo.bpm)} measured · ${studio.facts.loudness.integrated.toFixed(1)} LUFS` : null;

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-stage" data-view={view} data-started={started ? "1" : "0"}>
      <Glow state={glow} level={speak.level} />

      {view === "landing" ? (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <Landing projects={projects.projects} device={device} signedIn={!!account.user} loading={projects.loading}
            onNew={() => landingRef.current({ new: true })} onLibrary={() => setView("library")} onOpen={(id) => void enter(() => projects.open(id))} onOpenLocal={(s) => void enter(() => studio.loadSaved(s))}
            onSignIn={account.enabled ? () => setShowAccount(true) : undefined} />
        </div>
      ) : view === "library" ? (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <Library projects={projects.projects} device={device} signedIn={!!account.user} loading={projects.loading}
            onOpen={(id) => void enter(() => projects.open(id))} onOpenLocal={(s) => void enter(() => studio.loadSaved(s))} onNew={() => landingRef.current({ new: true })}
            onBack={() => setView(started ? "stage" : "landing")} onRename={projects.rename} onDelete={projects.remove} onDuplicate={async (id) => { await projects.duplicate(id); }}
            versionsOf={projects.versions} onOpenVersion={(v) => void enter(() => projects.openVersion(v))} onSignIn={account.enabled ? () => setShowAccount(true) : undefined} />
        </div>
      ) : (
        <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-3 pt-4 sm:px-8 sm:pt-5">
          {/* Nothing on the stage is pressed. The library, a new record and the account all answer
              to the voice; the only control in the room is the one at the bottom. */}
          <header className="flex shrink-0 items-center justify-between gap-3">
            <span className="flex items-center gap-2.5 text-sm font-semibold text-ink-2">
              <span className="mark h-7 w-7" />
              <span className="hidden sm:inline">The Producer</span>
            </span>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
              <StatusLine song={song} cost={studio.cost} measured={measured} paused={paused} started={started} />
            </div>
          </header>

          <section className="mt-4 grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,40%)] lg:grid-rows-1">
            <div className="flex max-h-[46dvh] min-h-0 min-w-0 flex-col gap-3 lg:max-h-none">
              <Board song={song} playing={playing} facts={studio.facts} moves={studio.moves}
                getLevels={studio.getLevels} getPosition={studio.getPosition} getSchedule={studio.getSchedule} getHealth={studio.getHealth} setMetering={studio.setMetering} />
              <div className="scroll-y flex shrink-0 flex-col gap-3">
              {song.tracks.length === 0 && !convo.work.length && (
                <div className="rounded-3xl border border-line/50 bg-s1/50 px-5 py-6 text-center">
                  <p className="text-lg text-ink">Nothing on the record yet.</p>
                  <p className="mt-1 text-sm text-ink-2">Name an artist, a record, or a feeling. The producer starts pulling it up while you keep talking.</p>
                </div>
              )}
              <WorkCards work={convo.work} />
              <JobBar waiting={!!questions.open} rollout={studio.rollout} />
              {studio.listenHint && <p className="flex items-start gap-1.5 text-sm text-live"><Icon name="ear" size={15} className="mt-0.5 shrink-0" /><span>{studio.listenHint}</span></p>}
              {/* A record is never quietly incomplete: what is missing, and what did not save, are said. */}
              {vault.missing.length > 0 && (
                <p className="flex items-start gap-1.5 text-sm text-warn" data-role="missing-clips">
                  <Icon name="cloud" size={15} className="mt-0.5 shrink-0" />
                  <span>{vault.missing.length === 1 ? "One sound in this record is not on this device and could not be found in your account." : `${vault.missing.length} sounds in this record are not on this device and could not be found in your account.`} Everything else plays.</span>
                </p>
              )}
              {studio.notSaved && (
                <p className="flex items-start gap-1.5 text-sm text-warn" data-role="not-saved">
                  <Icon name="cloud" size={15} className="mt-0.5 shrink-0" />
                  <span>This browser is out of room, so the record is not being kept on this device. {account.user ? "Your account still has it." : "Sign in and it is kept in your account instead."}</span>
                </p>
              )}
              </div>
            </div>
            <div className="flex min-h-0 min-w-0 flex-col justify-end">
              <Ribbon lines={studio.messages} interim={speak.interim} speakingText={voiceOut.current} thinking={convo.thinking || studio.busy} tall />
            </div>
          </section>
        </div>
      )}

      {view === "stage" && (convo.brainDown ?? studio.brainDown) && (
        <div className="relative z-10 mx-4 flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl bg-s1/90 px-4 py-2 ring-1 ring-inset ring-warn/30 sm:mx-8" data-role="brain-down">
          <span className="dot bg-warn shadow-[0_0_8px_rgb(255_176_32/0.8)]" aria-hidden />
          <p className="text-sm font-semibold text-warn">{(convo.brainDown ?? studio.brainDown) === "cap" ? "Today's house allowance is used up." : (convo.brainDown ?? studio.brainDown) === "credits" ? "The producer's brain is out of credits." : "The producer's API key is not working."}</p>
          <p className="text-xs text-ink-2 sm:text-sm">{(convo.brainDown ?? studio.brainDown) === "cap" ? "The music keeps playing and every move is saved. Add your own key in Settings, or come back tomorrow." : (convo.brainDown ?? studio.brainDown) === "credits" ? "The music keeps playing and every move is saved. Add credits at console.anthropic.com, or use your own key from your account." : "Check the key in your account."}{account.enabled && <button onClick={() => setShowAccount(true)} className="ml-2 font-medium text-live hover:underline">Use my own API key</button>}</p>
        </div>
      )}
      <footer className="relative z-10 flex shrink-0 flex-col items-center gap-2 px-4 pb-6 pt-2">
        <SpeakButton state={button} level={speak.level} onPress={() => void speak.press()} onRelease={speak.release} hint={micHint} />
        {typed && (
          <input aria-label="Message the producer" placeholder="typed (harness)" className="mt-1 w-72 rounded-md border border-line/60 bg-s1 px-2 py-1 text-xs text-ink"
            onKeyDown={(e) => { if (e.key === "Enter") { const el = e.target as HTMLInputElement; const v = el.value.trim(); if (v) { void convo.hear(v, 0); el.value = ""; } } }} />
        )}
      </footer>

      {showAccount && <AccountSheet account={account} mode="sheet" onClose={() => setShowAccount(false)} />}
      {showAnalyze && <AnalyzeSheet stems={stems} signedIn={!!account.user} onSignIn={() => { setShowAnalyze(false); setShowAccount(true); }} onClose={() => setShowAnalyze(false)} />}
      {gate && <AccountSheet account={account} mode="gate" onClose={() => {}} />}
      {trace && <TraceOverlay />}
      {studio.toast && <div role="status" className="panel fixed bottom-36 left-1/2 z-50 -translate-x-1/2 animate-slide-up rounded-full px-5 py-2.5 text-sm font-medium">{studio.toast}</div>}
    </main>
  );
}
