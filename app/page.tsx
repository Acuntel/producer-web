"use client";
// The Producer. Two panes: the song on one side, the conversation on the other.
// On phones they stack, the song staying visible above the talk. An account gate
// sits in front for new visitors so every record lands in their projects.
import { useEffect, useRef, useState } from "react";
import { useStudio } from "@/hooks/useStudio";
import { useVoiceLoop } from "@/hooks/useVoiceLoop";
import { useHum } from "@/hooks/useHum";
import { useCritic } from "@/hooks/useCritic";
import { useAccount } from "@/hooks/useAccount";
import { useProjects, type SnapshotMeta } from "@/hooks/useProjects";
import { StudioPanel } from "@/components/StudioPanel";
import { Conversation } from "@/components/Conversation";
import { ProjectsSheet } from "@/components/ProjectsSheet";
import { AccountSheet } from "@/components/AccountSheet";
import { AnalyzeSheet } from "@/components/AnalyzeSheet";
import { useStems } from "@/hooks/useStems";
import { IconButton } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { Phase } from "@/components/Orb";
import type { Song } from "@/lib/song/types";
import { SEED_SONG } from "@/lib/song";

export default function Studio() {
  const sendRef = useRef<(t: string) => void>(() => {});
  const snapshotRef = useRef<(s: Song, m: SnapshotMeta) => void>(() => {});
  const voice = useVoiceLoop((t) => sendRef.current(t));
  const hum = useHum();
  const account = useAccount();
  const studio = useStudio(voice.say, (bpm, beats) => hum.record(bpm, beats), (s, m) => snapshotRef.current(s, m));
  const projects = useProjects({ user: account.user, loadSong: studio.loadSong, getSong: studio.getSong, localLibrary: studio.library, flash: studio.flash });
  snapshotRef.current = projects.snapshot;
  const stems = useStems({ user: account.user, projectId: projects.current?.id ?? null, flash: studio.flash, edit: studio.edit, send: studio.send, registerClip: studio.registerClip, getSong: studio.getSong });
  useEffect(() => { sendRef.current = (t) => void studio.send(t); }, [studio]);
  const critic = useCritic({
    song: studio.song, facts: studio.facts, reference: studio.reference,
    paused: !!studio.rollout, send: studio.send, started: studio.started,
  });

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
    if (!wasStarted) voice.begin();
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
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent text-accent-ink">
            <Icon name="logo" size={16} />
          </span>
          <span className="truncate">The Producer</span>
          {projects.syncing && <span className="hidden text-xs font-normal text-ink-3 sm:inline">Saving</span>}
        </h1>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton name="undo" label="Undo" onClick={studio.undo} disabled={!studio.canUndo} />
          <IconButton name="redo" label="Redo" onClick={studio.redo} disabled={!studio.canRedo} />
          <IconButton name="folder" label="Projects" onClick={() => setShowProjects(true)} />
          <IconButton
            name="download"
            label={studio.rendering ? "Rendering WAV…" : "Download WAV"}
            onClick={() => void studio.download()}
            disabled={studio.rendering}
            className={studio.rendering ? "animate-breathe" : ""}
          />
          {account.enabled && (
            <IconButton name="user" label={account.user ? "Your account" : "Sign in"} tone={account.user ? "solid" : "ghost"} onClick={() => setShowAccount(true)} />
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(400px,34rem)_1fr]">
        <div className="scroll-y scroll-fade-y max-h-[52dvh] shrink-0 border-b border-line/50 p-3 sm:p-4 lg:max-h-none lg:border-b-0 lg:border-r">
          <StudioPanel
            song={song}
            phase={phase}
            beatSec={beatSec}
            onOrb={orb}
            starting={starting}
            playing={playing}
            nowSection={studio.nowSection}
            beat={playing ? studio.beat : null}
            onJump={(id) => void studio.jump(id)}
            listenHint={studio.listenHint}
            rollout={studio.rollout}
            onCancelRollout={studio.cancelRollout}
            ab={studio.ab}
            onPickAb={(k) => studio.pickAb(k as never)}
            score={studio.score}
            facts={studio.facts}
            reference={studio.reference}
            deltaText={studio.deltaText}
            hearing={studio.hearing}
            notes={critic.notes}
            headline={critic.headline}
            criticThinking={critic.thinking}
            onApply={critic.apply}
            onDismiss={critic.dismiss}
            started={started}
          />
        </div>

        <div className="flex min-h-0 flex-col bg-s1/40">
          <Conversation
            started={started}
            messages={studio.messages}
            busy={studio.busy}
            interim={voice.interim}
            humming={hum.recording}
            humCountIn={hum.countIn}
            listening={voice.listening}
            speaking={voice.speaking}
            canVerdict={!!studio.lastMoveId}
            onVerdict={studio.verdict}
            onHush={voice.hush}
            onSend={(t) => void studio.send(t)}
            onReference={(f) => void studio.addReference(f)}
            onSample={(f) => void studio.addClip(f)}
            onAnalyze={account.enabled ? () => setShowAnalyze(true) : undefined}
          />
        </div>
      </div>

      {showProjects && (
        <ProjectsSheet
          signedIn={projects.signedIn}
          projects={projects.projects}
          currentId={projects.current?.id ?? null}
          loading={projects.loading}
          localLibrary={studio.library}
          clips={studio.clips}
          onOpen={(id) => { setShowProjects(false); void projects.open(id); }}
          onOpenLocal={(s) => { setShowProjects(false); void studio.loadSaved(s); }}
          onNew={() => { setShowProjects(false); void projects.create({ ...SEED_SONG, title: "Untitled record" }); }}
          onRename={(id, t) => void projects.rename(id, t)}
          onDelete={(id) => void projects.remove(id)}
          onDuplicate={(id) => void projects.duplicate(id)}
          onDownloadLocal={(s) => void studio.download(s)}
          onSignIn={() => { setShowProjects(false); setShowAccount(true); }}
          onClose={() => setShowProjects(false)}
        />
      )}

      {showAccount && <AccountSheet account={account} mode="sheet" onClose={() => setShowAccount(false)} />}
      {showAnalyze && <AnalyzeSheet stems={stems} signedIn={!!account.user} onSignIn={() => { setShowAnalyze(false); setShowAccount(true); }} onClose={() => setShowAnalyze(false)} />}
      {gate && <AccountSheet account={account} mode="gate" onClose={() => {}} />}

      {studio.toast && (
        <div
          role="status"
          className="panel fixed bottom-24 left-1/2 z-50 -translate-x-1/2 animate-slide-up rounded-full px-5 py-2.5 text-sm font-medium shadow-panel"
        >
          {studio.toast}
        </div>
      )}
    </main>
  );
}
