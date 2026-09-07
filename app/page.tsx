"use client";
// The Producer. Home is your records; a session is the studio. The studio takes two
// thirds of the screen; the listen side takes the rest. No chat, no keyboard: you
// talk, the producer answers, the music changes in front of you.
import { useEffect, useRef, useState } from "react";
import { useStudio } from "@/hooks/useStudio";
import { useVoiceLoop } from "@/hooks/useVoiceLoop";
import { useHum } from "@/hooks/useHum";
import { useCritic } from "@/hooks/useCritic";
import { useAccount } from "@/hooks/useAccount";
import { useProjects, type SnapshotMeta } from "@/hooks/useProjects";
import { useStems } from "@/hooks/useStems";
import { useMicLevel } from "@/hooks/useMicLevel";
import { StudioPanel } from "@/components/StudioPanel";
import { ListenPanel } from "@/components/ListenPanel";
import { Home } from "@/components/Home";
import { ProjectsSheet } from "@/components/ProjectsSheet";
import { AccountSheet } from "@/components/AccountSheet";
import { AnalyzeSheet } from "@/components/AnalyzeSheet";
import { IconButton } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { Phase } from "@/components/Orb";
import type { Song } from "@/lib/song/types";
import { SEED_SONG } from "@/lib/song";

const harnessMode = () => typeof window !== "undefined" && /[?&](e2e|typed)=1/.test(window.location.search);

export default function Studio() {
  const sendRef = useRef<(t: string) => void>(() => {});
  const snapshotRef = useRef<(s: Song, m: SnapshotMeta) => void>(() => {});
  const actionsRef = useRef<{ analyze: (i: { url?: string; query?: string; from?: "local" | "web" }) => Promise<void>; vocal: (p: string, l?: string, ms?: number) => Promise<void>; findSound: (beats: number) => Promise<void>; hear: (sectionId?: string) => Promise<string | null>; identify: () => Promise<string | null>; tracklist: (i: { url?: string; query?: string }) => Promise<void> }>({ analyze: async () => {}, vocal: async () => {}, findSound: async () => {}, hear: async () => null, identify: async () => null, tracklist: async () => {} });
  const [typed] = useState(harnessMode);
  const [view, setView] = useState<"home" | "studio">(() => (harnessMode() ? "studio" : "home"));
  const voice = useVoiceLoop((t) => sendRef.current(t));
  const hum = useHum();
  const account = useAccount();
  const studio = useStudio(voice.say, (bpm, beats) => hum.record(bpm, beats), (s, m) => snapshotRef.current(s, m), { analyze: (i) => actionsRef.current.analyze(i), vocal: (p, l, ms) => actionsRef.current.vocal(p, l, ms), findSound: (b) => actionsRef.current.findSound(b), hear: (sec) => actionsRef.current.hear(sec), identify: () => actionsRef.current.identify(), tracklist: (i) => actionsRef.current.tracklist(i) });
  const projects = useProjects({ user: account.user, loadSong: studio.loadSong, loadChat: studio.loadChat, getSong: studio.getSong, localLibrary: studio.library, flash: studio.flash });
  snapshotRef.current = projects.snapshot;
  const stems = useStems({ user: account.user, projectId: projects.current?.id ?? null, flash: studio.flash, edit: studio.edit, send: studio.send, registerClip: studio.registerClip, getSong: studio.getSong, setReference: studio.setReferenceBuffer, recordSound: (bpm, beats) => hum.record(bpm, beats), previewClip: studio.previewClip });
  actionsRef.current = { analyze: async (i) => { setShowAnalyze(true); if (i.url) await stems.start({ url: i.url }); else await stems.findAndAnalyze(i.query ?? "", i.from ?? null); }, vocal: async (p, l, ms) => { setShowAnalyze(true); await stems.renderVocal(p, l, ms); }, findSound: async (b) => { await stems.findSound(b); }, hear: async (sec) => stems.hearOurRender(sec), identify: async () => { setShowAnalyze(true); return stems.identifyPlaying(); }, tracklist: async (i) => { setShowAnalyze(true); await stems.startTracklist(i); } };
  useEffect(() => { sendRef.current = (t) => void studio.sendVoice(t); }, [studio]);
  useEffect(() => { if (voice.interim) stems.prefetch(voice.interim); }, [voice.interim, stems]);
  const critic = useCritic({ song: studio.song, facts: studio.facts, reference: studio.reference, paused: !!studio.rollout, send: studio.send, started: studio.started });
  const mic = useMicLevel(studio.started && view === "studio");
  const [muted, setMuted] = useState(false);

  const [showProjects, setShowProjects] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showAnalyze, setShowAnalyze] = useState(false);
  const { song, started, paused, starting } = studio;
  const beatSec = 60 / song.bpm;
  const playing = started && !paused;
  const gate = account.ready && account.enabled && !account.user && !account.guest;

  async function orb() {
    const wasStarted = started;
    await studio.boot();
    // Harness mode types its asks; a fake microphone would flood the brain with transcribed static.
    if (!wasStarted && !typed) voice.begin();
  }
  // From Home, one tap opens the studio and starts the session (the tap is the audio gesture).
  async function enter(load: () => Promise<void>) {
    await load();
    setView("studio");
    if (!started) await orb();
    else if (paused) await studio.boot();
  }
  async function goHome() {
    if (playing) await studio.boot();   // pause; a nameless record gets asked for its name
    setView("home");
  }

  const phase: Phase =
    starting ? "starting"
    : !started ? "idle"
    : studio.hearing ? "hearing"
    : studio.busy ? "thinking"
    : voice.speaking ? "speaking"
    : voice.listening ? "listening"
    : paused ? "paused"
    : "playing";

  return (
    <main className="flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line/50 px-3 py-2.5 sm:px-4">
        <h1 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-tight">
          <button onClick={() => void goHome()} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent text-accent-ink" aria-label="Records"><Icon name="logo" size={16} /></button>
          <span className="truncate">The Producer</span>
          {view === "studio" && projects.current && <span className="hidden truncate text-sm font-normal text-ink-3 sm:inline">· {projects.current.title}</span>}
          {projects.syncing && <span className="hidden text-xs font-normal text-ink-3 sm:inline">Saving</span>}
        </h1>
        <div className="flex shrink-0 items-center gap-0.5">
          {view === "studio" && (
            <>
              <IconButton name="undo" label="Undo" onClick={studio.undo} disabled={!studio.canUndo} />
              <IconButton name="redo" label="Redo" onClick={studio.redo} disabled={!studio.canRedo} />
              <IconButton name="library" label="Records" onClick={() => void goHome()} />
              <IconButton name="folder" label="Projects" onClick={() => setShowProjects(true)} />
              <IconButton name="download" label={studio.rendering ? "Rendering WAV…" : "Download WAV"} onClick={() => void studio.download()} disabled={studio.rendering} className={studio.rendering ? "animate-breathe" : ""} />
            </>
          )}
          {view === "home" && <IconButton name="folder" label="Manage records" onClick={() => setShowProjects(true)} />}
          {account.enabled && <IconButton name="user" label={account.user ? "Your account" : "Sign in"} tone={account.user ? "solid" : "ghost"} onClick={() => setShowAccount(true)} />}
        </div>
      </header>

      {view === "home" ? (
        <Home
          signedIn={projects.signedIn} email={account.user?.email} projects={projects.projects} loading={projects.loading} localLibrary={studio.library}
          onOpen={(id) => void enter(() => projects.open(id))}
          onOpenLocal={(s) => void enter(() => studio.loadSaved(s))}
          onNew={() => void enter(async () => { projects.startFresh(); await studio.newSession(); })}
          onSignIn={() => setShowAccount(true)}
        />
      ) : (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_minmax(300px,24rem)]">
          <div className="scroll-y scroll-fade-y max-h-[56dvh] shrink-0 border-b border-line/50 p-3 sm:p-4 lg:max-h-none lg:border-b-0 lg:border-r">
            <StudioPanel
              song={song} started={started} playing={playing} starting={starting} onPlayPause={orb}
              nowSection={studio.nowSection} beat={playing ? studio.beat : null} onJump={(id) => void studio.jump(id)}
              getLevels={studio.getLevels} onVolume={studio.setVolume} onToggle={studio.toggleTrack}
              listenHint={studio.listenHint} rollout={studio.rollout} onCancelRollout={studio.cancelRollout}
              ab={studio.ab} onPickAb={(k) => studio.pickAb(k as never)} score={studio.score}
              facts={studio.facts} reference={studio.reference} deltaText={studio.deltaText} hearing={studio.hearing}
              notes={critic.notes} headline={critic.headline} criticThinking={critic.thinking} onApply={critic.apply} onDismiss={critic.dismiss} moves={studio.moves}
            />
          </div>
          <div className="flex min-h-0 flex-col bg-s1/40">
            <ListenPanel
              started={started} starting={starting} phase={phase} running={playing} beatSec={beatSec} onOrb={orb}
              micLevel={mic.level} micPeak={mic.peak} micStatus={mic.status} voiceStatus={voice.status} heardSomething={mic.heardSomething || voice.heardCount > 0}
              onRetryMic={() => { voice.retry(); }} muted={muted} onMute={(m) => { setMuted(m); voice.setMuted(m); }}
              interim={voice.interim} lastHeard={voice.lastHeard} messages={studio.messages} speaking={voice.speaking} busy={studio.busy} onHush={voice.hush}
              paused={paused} ignored={studio.ignored} ignoredCount={studio.ignoredCount} onThatWasForMe={studio.thatWasForMe}
              brainDown={studio.brainDown} onOpenAccount={account.enabled ? () => setShowAccount(true) : undefined}
              humming={hum.recording} humCountIn={hum.countIn} canVerdict={!!studio.lastMoveId} onVerdict={studio.verdict}
              ab={studio.ab} onPickAb={(k) => studio.pickAb(k as never)}
              onAnalyze={account.enabled ? () => setShowAnalyze(true) : undefined}
              onReference={(f) => void studio.addReference(f)} onSample={(f) => void studio.addClip(f)}
              typed={typed} onSend={(t) => void studio.send(t)}
            />
          </div>
        </div>
      )}

      {showProjects && (
        <ProjectsSheet
          signedIn={projects.signedIn} projects={projects.projects} currentId={projects.current?.id ?? null} loading={projects.loading}
          localLibrary={studio.library} clips={studio.clips}
          onOpen={(id) => { setShowProjects(false); void enter(() => projects.open(id)); }}
          onOpenLocal={(s) => { setShowProjects(false); void enter(() => studio.loadSaved(s)); }}
          onNew={() => { setShowProjects(false); void projects.create({ ...SEED_SONG, title: "Untitled record" }); }}
          onRename={(id, t) => void projects.rename(id, t)} onDelete={(id) => void projects.remove(id)} onDuplicate={(id) => void projects.duplicate(id)}
          onDownloadLocal={(s) => void studio.download(s)} onSignIn={() => { setShowProjects(false); setShowAccount(true); }} onClose={() => setShowProjects(false)}
        />
      )}
      {showAccount && <AccountSheet account={account} mode="sheet" onClose={() => setShowAccount(false)} />}
      {showAnalyze && <AnalyzeSheet stems={stems} signedIn={!!account.user} onSignIn={() => { setShowAnalyze(false); setShowAccount(true); }} onClose={() => setShowAnalyze(false)} />}
      {gate && <AccountSheet account={account} mode="gate" onClose={() => {}} />}

      {studio.toast && (
        <div role="status" className="panel fixed bottom-24 left-1/2 z-50 -translate-x-1/2 animate-slide-up rounded-full px-5 py-2.5 text-sm font-medium shadow-panel">{studio.toast}</div>
      )}
    </main>
  );
}
