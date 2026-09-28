"use client";
// The studio session: song state, instant local moves, the brain exchange, the
// ears, verify-after-move, A/B auditions, rollouts, references, clips, taste,
// history and the scorecard. The page only renders.
import { useCallback, useEffect, useRef, useState } from "react";
import { SEED_SONG, applyOps, migrateSong, withReferenceGroove, History, diffSongs, type Song, type Note, type Role } from "@/lib/song";
import { newSongId } from "@/lib/song/migrate";
import { levelOps, levelLine } from "@/lib/song/level";
import { exchange, forceEconomy } from "@/lib/brain/stream";
import { studioJobs } from "@/lib/jobs/queue";
import type { Landing } from "@/lib/engine/landing";
import type { Boundary } from "@/lib/engine/boundary";

const SPEND_TARGET = 5;   // dollars per record at list prices; the masterprompt's target
import { movesFromOps, type LaneMove } from "@/lib/song/moves";
import { stripWake, quickGate, classify } from "@/lib/brain/attend";
import type { Engine, Position } from "@/lib/engine";
import { clipKeysFor } from "@/lib/engine/keys";
import { studioContext } from "@/lib/audio/studio";
import type { MusicFacts } from "@/lib/ears";
import { logMove, attachWindow, tasteSummary, logPair } from "@/lib/taste";
import { logMoveScore, referenceDelta, scoreLine } from "@/lib/scorecard";
import { notesForBrain } from "@/lib/critic";
import { localIntent, rolloutIntent, rolloutLine } from "@/lib/brain/local";
import { verifyMove } from "@/lib/brain/verify";
import { costOf, addCost, costFor, type Usage } from "@/lib/cost";
import { feelFromFacts } from "@/lib/brain/feel";
import { RITUAL_ACTIONS, type BrainAction, type Expectation, type RitualAction } from "@/lib/brain/parse";
import { REFINE_KINDS, type RolloutKind } from "@/lib/brain/rollouts";
import { laneInfo } from "@/lib/brain/laneNames";
import { useRollout } from "./useRollout";
import { useStudioHarness } from "./useStudioHarness";
import { useInitiative } from "./useInitiative";
import { useUploads } from "./useUploads";
import { useLibraryActions } from "./useLibraryActions";
import { useDeviceSave, SONG_KEY, CHAT_KEY } from "./useDeviceSave";
import type { Reference } from "@/lib/types/ui";
import type { ClipMeta } from "@/lib/types/ui";

type Msg = { role: "user" | "assistant"; content: string };
type Reply = { say: string; ops?: unknown[] | null; song?: unknown; action?: BrainAction | null; listen?: string | null; expect?: Expectation[] | null; alternative?: unknown[] | null; detail?: string; model?: string; usage?: Usage };
export type AB = { a: Song; b: Song; playing: "a" | "b"; label: string } | null;

const REF_KEY = "producer.reference.v1";
// A new session starts empty: no pattern, no template. The producer asks what we are making.
export const BLANK_SONG: Song = { version: 3, title: "Untitled", bpm: 124, key: "A minor", lane: "tech-house", humanize: { swing: 0.54, velVar: 0.1, clapLateMs: 8, seed: 7 }, tracks: [], sections: [{ id: "sketch", name: "Sketch", bars: 8, active: [], fill: "none" }], arrangement: ["sketch"] };
export const isGenericTitle = (t: string) => /^(untitled|untitled record|new record|glow|g-town heat|northern lights|after hours|iron lung|holy water|probe)$/i.test(t.trim());
const isBlank = (s: Song) => s.tracks.length === 0 && isGenericTitle(s.title);
const isE2E = () => typeof window !== "undefined" && /[?&](e2e|voice)=1/.test(window.location.search);

export type SnapshotMeta = { label?: string; newProject?: boolean; facts?: unknown; chat?: { role: "user" | "assistant"; content: string }[]; blank?: boolean };

export type StudioActions = { prefetchVoice?: (text: string) => Promise<unknown> | void; analyze?: (input: { url?: string; query?: string; from?: "local" | "web" }) => Promise<void> | void; vocal?: (prompt: string, lyrics?: string, lengthMs?: number) => Promise<void> | void; findSound?: (beats: number) => Promise<void> | void; hear?: (sectionId?: string) => Promise<string | null>; identify?: () => Promise<string | null>; tracklist?: (input: { url?: string; query?: string }) => Promise<void> | void; ritual?: (a: BrainAction) => Promise<unknown> | void; draft?: (name: string | null) => Promise<unknown> | void };
export type SetOpts = { silent?: boolean; label?: string; noHistory?: boolean; noSnapshot?: boolean; boundary?: Boundary; fromTop?: boolean; jobId?: string };

// The press: the greeting starts VOICE_LEAD after it and the record joins RECORD_LEAD after that, both on
// the studio's audio clock, so the order of the first sounds is the same on every reload.
const VOICE_LEAD = 0.05, RECORD_LEAD = 0.1;

export function useStudio(say: (t: string, o?: { at?: number }) => void, recordHum: (bpm: number, beats: number) => Promise<{ notes: Note[] } | null>, onSnapshot?: (s: Song, meta: SnapshotMeta) => void, actions?: StudioActions) {
  const onSnapshotRef = useRef(onSnapshot); onSnapshotRef.current = onSnapshot;
  const actionsRef = useRef(actions); actionsRef.current = actions;
  const newProjectRef = useRef(false);
  const [song, setSongState] = useState<Song>(SEED_SONG);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [nowSection, setNowSection] = useState(-1);
  const [clips, setClips] = useState<ClipMeta[]>([]);
  const [facts, setFacts] = useState<MusicFacts | null>(null);
  const [hearing, setHearing] = useState(false);
  const [reference, setReference] = useState<Reference | null>(null);
  const [deltaText, setDeltaText] = useState<string | null>(null);
  const [listenHint, setListenHint] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [lastMoveId, setLastMoveId] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [ab, setAb] = useState<AB>(null); const [score, setScore] = useState("");
  const [canUndo, setCanUndo] = useState(false); const [canRedo, setCanRedo] = useState(false);
  const [ignored, setIgnored] = useState<{ text: string; at: number } | null>(null);
  const [brainDown, setBrainDownState] = useState<"credits" | "key" | "cap" | null>(null);
  const brainDownRef = useRef<"credits" | "key" | "cap" | null>(null);
  const setBrainDown = (v: "credits" | "key" | "cap" | null) => { brainDownRef.current = v; setBrainDownState(v); };
  const [moves, setMoves] = useState<LaneMove[]>([]);
  const [cost, setCost] = useState(0);
  const [ignoredCount, setIgnoredCount] = useState(0);
  const lastMoveAtRef = useRef(0);
  const pausedRef = useRef(false);
  const resumeRef = useRef<string | null>(null);
  const titlePendingRef = useRef(false);
  const askedTitleRef = useRef(false);

  const engineRef = useRef<Engine | null>(null);
  const songRef = useRef(song); const messagesRef = useRef(messages);
  const factsRef = useRef<MusicFacts | null>(null); const referenceRef = useRef<Reference | null>(null);
  const busyRef = useRef(false); const pendingRef = useRef<string[]>([]);   // asks that arrive while one is running wait in order, never overwrite each other
  const lastMoveRef = useRef<string | null>(null);
  const hearSeq = useRef(0);
  const laidRef = useRef<(() => void) | null>(null);
  const movedRef = useRef<((id: string) => void) | null>(null);   // told after each version is laid on the rig (a listen that is pulled down stays down)
  const setSongRef = useRef<((s: Song, o?: SetOpts) => Promise<Landing | null>) | null>(null);
  const offerRef = useRef<((line: string, yes: () => void) => void) | null>(null);   // a question for the room (hooks/useQuestions)
  const historyRef = useRef(new History(60));
  const abRef = useRef<AB>(null);
  const localMovesRef = useRef<string[]>([]);
  const verifyingRef = useRef(false);
  useEffect(() => { songRef.current = song; }, [song]); useEffect(() => { messagesRef.current = messages; }, [messages]); useEffect(() => { pausedRef.current = paused; }, [paused]);

  const savedRef = useRef(false);   // a saved record replaces the seed on mount: the seed is never warmed for it
  const armedRef = useRef<Promise<unknown>>(Promise.resolve());   // the record armed and the greeting fetched
  useEffect(() => {
    try {
      const s = migrateSong(JSON.parse(localStorage.getItem(SONG_KEY) ?? "null"));
      if (s) { savedRef.current = true; setSongState(s); }
      const m = localStorage.getItem(CHAT_KEY); if (m) setMessages(JSON.parse(m));
      const r = localStorage.getItem(REF_KEY); if (r) { const ref = JSON.parse(r); setReference(ref); referenceRef.current = ref; }
    } catch {}
    setScore(scoreLine());
    void import("@/lib/engine").then(({ listClips }) => listClips().then((all) => setClips(all.map((c) => ({ id: c.id, name: c.name, bpm: c.bpm, key: c.key, durationSec: c.durationSec }))))).catch(() => {});
  }, []);
  // Saving on this device at idle, on commits only, and saying so when it cannot (useDeviceSave).
  const { library, notSaved, autoSave } = useDeviceSave(song, messages);
  // No playhead in React: the board reads the transport itself, sixty times a second, without
  // re-rendering the page. A state update every ninety milliseconds was re-rendering everything
  // on screen eleven times a second and starving the scheduler that has to hit the beat.

  const flash = useCallback((t: string) => { setToast(t); setTimeout(() => setToast(""), 1800); }, []);
  // The meter: every brain call adds its list-price cost to this record's running total.
  const governedRef = useRef(false);
  const spend = useCallback((model: string | undefined, usage: unknown) => {
    const usd = costOf(model, usage as Usage); if (!usd) return;
    const total = addCost(songRef.current.title, usd); setCost(total);
    // The five dollar governor: past the target, the deep model is kept for blueprints only, and the user is told once.
    if (total > SPEND_TARGET && !governedRef.current) {
      governedRef.current = true; forceEconomy(true);
      const line = `This record has passed ${SPEND_TARGET} dollars in brain spend, so I am switching the everyday moves to the fast model. Blueprints keep the deep one.`;
      flash(`Past $${SPEND_TARGET}: fast model for everyday moves`); say(line);
    }
  }, [flash, say]);
  useEffect(() => { setCost(costFor(song.title)); }, [song.title]);
  const landMoves = useCallback((ops: unknown[], before: Song, after: Song) => {
    const m = movesFromOps(ops, before, after); if (!m.length) return;
    setMoves((prev) => [...prev.filter((x) => Date.now() - x.at < 4000 && !m.some((y) => y.trackId === x.trackId)), ...m].slice(-12));
    const aud = m.find((x) => x.auditionClipId); if (aud?.auditionClipId) void engineRef.current?.previewClip(aud.auditionClipId);
  }, []);
  const meteringRef = useRef(false);
  const getEngine = useCallback(async () => {
    if (!engineRef.current) {
      const { Engine } = await import("@/lib/engine");
      engineRef.current = new Engine();
      engineRef.current.onSection = (_n, idx) => setNowSection(idx);
      engineRef.current.setMetering(meteringRef.current);
    }
    return engineRef.current;
  }, []);
  // The board asks for meters while it is on screen; the engine builds them only then.
  const setMetering = useCallback((on: boolean) => { meteringRef.current = on; engineRef.current?.setMetering(on); }, []);

  // The ears on our own render. Only changed sections re-render (cache); sequenced so stale results never win.
  // One listen at a time, and the newest version wins. Two renders racing was the studio competing
  // with itself for the thread that has to hit the next beat; a queue of them meant the producer was
  // still listening to a record from five moves ago.
  const listening = useRef(false);
  const nextToHear = useRef<Song | null>(null);
  const hearNow = useCallback(async (s: Song): Promise<MusicFacts | null> => {
    if (listening.current) { nextToHear.current = s; return null; }
    listening.current = true;
    try { return await hearOnce(s); }
    finally {
      listening.current = false;
      const again = nextToHear.current; nextToHear.current = null;
      if (again) void hearNow(again);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hearOnce = useCallback(async (s: Song): Promise<MusicFacts | null> => {
    const seq = ++hearSeq.current;
    setHearing(true);
    try {
      const { hearSong } = await import("@/lib/engine");
      const f = (await import("@/lib/ears/vocalFacts")).attachVocal(await hearSong(s, { maxSeconds: 240 }), s);
      if (seq !== hearSeq.current) return f;
      factsRef.current = f; setFacts(f);
      if (referenceRef.current) { const { compare } = await import("@/lib/ears"); setDeltaText(compare(f, referenceRef.current.facts).text); }
      // The leveler: a crushed drop hides every other judgement, so the studio pulls the master back
      // before the brain or the user listens. Only on the version that was actually heard.
      if (s === songRef.current) {
        const lv = levelOps(s, f);
        if (lv) {
          const { song: leveled } = applyOps(s, lv.ops);
          localMovesRef.current.push(`studio leveled master ${lv.delta > 0 ? "+" : ""}${lv.delta.toFixed(1)} dB (drop read ${lv.from.toFixed(1)} LUFS)`);
          flash(levelLine(lv));
          // Silent on purpose: the leveler acts on what was just measured, and re-listening to its
          // own gain move put the studio on a treadmill of renders it never got off. It acts only between
          // jobs, on a bar line, and only on the version it measured.
          void studioJobs.whenIdle().then(() => { if (songRef.current === s) void setSongRef.current?.(leveled, { noHistory: true, label: "level", silent: true, boundary: "bar" }); });
        }
      }
      return f;
    } catch (e) { console.warn("listen failed", e instanceof Error ? e.message : e); return null; }
    finally { if (seq === hearSeq.current) setHearing(false); }
  }, []);
  // The ears follow a change instead of racing it: a burst of moves is heard once, when it settles.
  const earsTimer = useRef<number | null>(null);
  const refreshEars = useCallback((s: Song, after = 500) => {
    if (earsTimer.current) window.clearTimeout(earsTimer.current);
    earsTimer.current = window.setTimeout(() => { earsTimer.current = null; void hearNow(s); }, after);
  }, [hearNow]);
  useEffect(() => () => { if (earsTimer.current) window.clearTimeout(earsTimer.current); }, []);

  const setSong = useCallback(async (s: Song, opts?: SetOpts): Promise<Landing | null> => {
    if (!opts?.noHistory) historyRef.current.push(songRef.current, opts?.label ?? "change");
    setCanUndo(historyRef.current.canUndo); setCanRedo(historyRef.current.canRedo);
    songRef.current = s; setSongState(s);
    const eng = await getEngine();
    // Told once the version is in the audio (its boundary), not when it is scheduled: a fader held down for a
    // listen is put back down after the landing's own ramps, never before them.
    let landing: Landing | null = null;
    if (started || engineRef.current) { landing = await eng.update(s, { boundary: opts?.boundary, fromTop: opts?.fromTop, jobId: opts?.jobId }); if (landing) void landing.landed.then((ok) => { if (ok) laidRef.current?.(); }); }
    autoSave(s);
    // The cloud hears about every save too; a new record (rollout, full song) opens a new project.
    if (!opts?.noSnapshot) { const fresh = newProjectRef.current; if (!isBlank(s)) newProjectRef.current = false; onSnapshotRef.current?.(s, { label: opts?.label, newProject: fresh, chat: messagesRef.current.slice(-40), blank: isBlank(s) }); }
    if (!opts?.silent) refreshEars(s);
    return landing;
  }, [autoSave, getEngine, refreshEars, started]);
  setSongRef.current = setSong;
  // Opening a saved project or version: no history entry, no re-save of what was just loaded.
  // Direct edits from studio surfaces (the analyze sheet, one-shot picks): ops in, saved, heard, logged for the brain.
  const edit = useCallback(async (ops: unknown[], label: string) => {
    const res = applyOps(songRef.current, ops);
    if (res.applied === 0) { flash("That did not apply"); return false; }
    landMoves(ops, songRef.current, res.song);
    await setSong(res.song, { label });
    localMovesRef.current.push(label);
    return true;
  }, [flash, setSong, landMoves]);
  const editRef = useRef(edit); editRef.current = edit;
  const newSessionRef = useRef<() => Promise<void>>(async () => {});
  const registerClip = useCallback((c: ClipMeta) => setClips((x) => (x.some((y) => y.id === c.id) ? x : [...x, c])), []);
  // Live meters for the studio surfaces; a fader drag moves the voice directly and commits once on release.
  const getLevels = useCallback(() => engineRef.current?.getLevels() ?? null, []);
  // What the board paints from: the hits the transport will fire, where it is, and the rig's health.
  const getSchedule = useCallback(() => engineRef.current?.getSchedule() ?? null, []);
  const getHealth = useCallback(() => engineRef.current?.health() ?? null, []);
  useStudioHarness({ engine: engineRef, facts: factsRef, song: songRef, edit: editRef, newSession: newSessionRef });
  // The kit and the first section's clips warm while the landing is up, keyed on the record that is
  // committed (its id, kit and sounds), never on a ref that may still hold the seed. The voice route warms once.
  // Before the press the record is armed too: its voices built a step at a time and laid on the stopped
  // transport (Engine.arm), and the greeting's first sentence is fetched, so the press only starts things.
  const warmKey = `${song.id ?? song.title}|${song.kit ?? "synth"}|${song.lane}|${song.bpm}|${clipKeysFor(song).join(",")}`;
  useEffect(() => {
    if (savedRef.current && song === SEED_SONG) return;
    const s = song; void import("@/lib/engine").then((m) => m.warmFor(s)).catch(() => {});
    if (!started) armedRef.current = Promise.all([getEngine().then((e) => e.arm(s)).catch(() => {}), Promise.resolve(actionsRef.current?.prefetchVoice?.(greetingLine())).catch(() => {})]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warmKey]);
  useEffect(() => { void fetch("/api/speak").catch(() => {}); }, []);
  const setVolume = useCallback(async (id: string, db: number, commit: boolean) => {
    const res = applyOps(songRef.current, [{ op: "set", track: id, path: "volume", value: db }]);
    if (!res.applied) return;
    if (!commit) { engineRef.current?.setTrackVolume(id, db); songRef.current = res.song; setSongState(res.song); return; }
    const name = res.song.tracks.find((t) => t.id === id)?.name ?? id;
    await setSong(res.song, { label: `${name} to ${db} dB` });
    localMovesRef.current.push(`user moved the ${name} fader to ${db} dB`);
  }, [setSong]);
  const toggleTrack = useCallback(async (id: string, what: "mute" | "solo") => {
    const t = songRef.current.tracks.find((x) => x.id === id); if (!t) return;
    const on = what === "mute" ? !!t.mute : !!t.solo;
    const op = what === "mute" ? (on ? "unmute" : "mute") : on ? "unsolo" : "solo";
    await edit([{ op, track: id }], `user ${op}d ${t.name}`);
  }, [edit]);
  const setReferenceBuffer = useCallback(async (buf: AudioBuffer, name: string) => {
    const { hearBuffer } = await import("@/lib/ears/browser");
    const f = await hearBuffer(buf, { maxSeconds: 240, label: name });
    const ref = { name, facts: f };
    referenceRef.current = ref; setReference(ref);
    try { localStorage.setItem(REF_KEY, JSON.stringify(ref)); } catch {}
    if (factsRef.current) { const { compare } = await import("@/lib/ears"); setDeltaText(compare(factsRef.current, f).text); }
  }, []);
  // A reference from numbers already measured (the worker's hearing of a record): no audio decoded here.
  const setReferenceFacts = useCallback((f: MusicFacts, name: string) => {
    const ref = { name, facts: f }; referenceRef.current = ref; setReference(ref);
    try { localStorage.setItem(REF_KEY, JSON.stringify(ref)); } catch {}
    if (factsRef.current) void import("@/lib/ears").then(({ compare }) => setDeltaText(compare(factsRef.current!, f).text));
  }, []);
  const loadChat = useCallback((chat: { role: "user" | "assistant"; content: string }[], summary: string | null) => { setMessages(chat); messagesRef.current = chat; resumeRef.current = summary; askedTitleRef.current = false; }, []);
  // A new or opened record starts a new epoch: the work made for the last one is cancelled, and the brain is
  // back on its normal models (the spend governor is per record).
  const freshRecord = useCallback((why: string) => { studioJobs.bump(why); forceEconomy(false); governedRef.current = false; pendingRef.current = []; }, []);
  const newSession = useCallback(async () => {
    freshRecord("new record");
    historyRef.current = new History(60); setCanUndo(false); setCanRedo(false);
    setMessages([]); messagesRef.current = []; resumeRef.current = null; askedTitleRef.current = false; titlePendingRef.current = false;
    setListenHint(null); abRef.current = null; setAb(null); lastMoveRef.current = null; setLastMoveId(null); setFacts(null); factsRef.current = null;
    newProjectRef.current = true;
    await setSong({ ...BLANK_SONG, id: newSongId() }, { label: "new session", noHistory: true, silent: true });
  }, [setSong, freshRecord]);
  newSessionRef.current = newSession;
  const loadSong = useCallback(async (s: Song) => { freshRecord("opened a record"); await setSong(migrateSong(s) ?? s, { label: `open ${s.title}`, noHistory: true, noSnapshot: true }); flash(`Opened ${s.title}`); if (started) say(`Opened ${s.title}. Where were we?`); }, [flash, say, setSong, started, freshRecord]);
  const getSong = useCallback(() => songRef.current, []);
  const previewClip = useCallback(async (clipId: string) => (await getEngine()).previewClip(clipId), [getEngine]);

  const compactFacts = useCallback(async (f: MusicFacts | null) => { if (!f) return null; try { const ears = await import("@/lib/ears"); return ears.factsForBrain(f); } catch { return null; } }, []);
  const deltasFor = useCallback(async (f: MusicFacts | null) => { if (!f || !referenceRef.current) return null; try { const ears = await import("@/lib/ears"); return ears.compare(f, referenceRef.current.facts).deltas; } catch { return null; } }, []);

  const rolloutDeps = useRef({
    getSong: () => songRef.current,
    applySong: (s: Song, o?: { silent?: boolean }) => setSong(s, { ...o, noHistory: true }),
    hearNow, getReference: () => referenceRef.current,
    getDeltas: (f: MusicFacts | null) => { let d: unknown = null; void deltasFor(f).then((x) => (d = x)); return d; },
    compact: (f: MusicFacts | null) => { if (!f) return null; let c: unknown = null; void compactFacts(f).then((x) => (c = x)); return c; },
    say, taste: () => tasteSummary(songRef.current.title),
    onUsage: (m: string | undefined, u: unknown) => spend(m, u),
  });
  const earsModRef = useRef<typeof import("@/lib/ears") | null>(null);
  useEffect(() => { void import("@/lib/ears").then((m) => { earsModRef.current = m; }); }, []);
  rolloutDeps.current.compact = (f) => (f && earsModRef.current ? earsModRef.current.factsForBrain(f) : null);
  rolloutDeps.current.getDeltas = (f) => (f && referenceRef.current && earsModRef.current ? earsModRef.current.compare(f, referenceRef.current.facts).deltas : null);
  rolloutDeps.current.applySong = (s, o) => setSong(s, { ...o, noHistory: true });
  rolloutDeps.current.say = say;
  const { rollout, run: runRollout, cancel: cancelRollout } = useRollout(rolloutDeps.current);

  const runAction = useCallback(async (a: BrainAction | null | undefined, s: Song, ask: string) => {
    if (!a) return;
    const eng = await getEngine();
    if (a.type === "pause") { eng.pause(); setPaused(true); }
    else if (a.type === "play") { eng.resume(); setPaused(false); }
    else if (a.type === "goto") { if (a.section) eng.goto(a.section); else if (a.bar) eng.gotoBar(a.bar); if (!eng.playing) { eng.resume(); setPaused(false); } }
    else if (a.type === "loop") { const ns = { ...s, loop: a.section ? { section: a.section } : a.bar ? { startBar: a.bar, endBar: a.bar + (a.beats ? a.beats / 4 : 4) } : s.loop }; await setSong(ns, { silent: true, noHistory: true }); if (a.section) eng.goto(a.section); }
    else if (a.type === "unloop") { await setSong({ ...s, loop: null }, { silent: true, noHistory: true }); }
    else if (a.type === "rollout") {
      const kind = (REFINE_KINDS.includes(a.kind as RolloutKind) ? a.kind : referenceRef.current ? "emulate" : "newSong") as RolloutKind;
      // A new record is a draft (lib/song/draft.ts) now: the layered build survives only as the named refines.
      if ((kind === "newSong" || kind === "emulate") && actionsRef.current?.draft) { await actionsRef.current.draft(a.lane ? laneInfo(a.lane)?.name ?? a.lane : null); return; }
      historyRef.current.push(songRef.current, `before ${kind}`); setCanUndo(true);
      // A new record starts clean: no hint, no A/B, no verdict buttons from the last song.
      if (kind === "newSong" || kind === "emulate") { setListenHint(null); abRef.current = null; setAb(null); lastMoveRef.current = null; setLastMoveId(null); newProjectRef.current = true; }
      const res = await runRollout(kind, ask, a.section ?? null, a.lane ?? null);
      refreshEars(songRef.current);
      if (res) { setMessages((m) => [...m, { role: "assistant", content: res.say }]); messagesRef.current = [...messagesRef.current, { role: "assistant", content: res.say }]; setListenHint(res.listen); say(res.say); }
    }
    else if (a.type === "analyze") {
      if ((a.url || a.query) && actionsRef.current?.analyze) { flash("Pulling that record in"); await actionsRef.current.analyze({ url: a.url, query: a.query, from: a.from }); }
      else flash("I need a name or a link to pull that in");
    }
    else if (a.type === "identify") {
      const line = await actionsRef.current?.identify?.();
      if (line) void send(line, { hidden: true });
    }
    else if (a.type === "tracklist") {
      if ((a.url || a.query) && actionsRef.current?.tracklist) { flash("Reading the mix"); await actionsRef.current.tracklist({ url: a.url, query: a.query }); }
      else flash("I need the mix's name or link");
    }
    else if (a.type === "hear") {
      const report = await actionsRef.current?.hear?.(a.section);
      if (report) void send(`${report}\nAnswer honestly from this: what works, the one thing that does not, and make that ONE fix now.`, { hidden: true });
    }
    else if (a.type === "findSound") {
      if (actionsRef.current?.findSound) await actionsRef.current.findSound(a.beats && a.beats > 0 ? Math.min(16, a.beats) : 8);
    }
    else if (a.type === "vocal") {
      if (a.prompt && actionsRef.current?.vocal) { flash("Rendering the vocal"); await actionsRef.current.vocal(a.prompt, a.lyrics, a.lengthMs); }
      else flash("Tell me what the vocal should be");
    }
    else if (RITUAL_ACTIONS.includes(a.type as RitualAction)) await actionsRef.current?.ritual?.(a);
    else if (a.type === "recordHum") {
      const beats = a.beats && a.beats > 0 ? Math.min(32, a.beats) : 8;
      const role = (a.track && ["lead", "bass", "chords", "pluck", "arp", "stab", "pad", "sub"].includes(a.track) ? a.track : "lead") as Role;
      flash("Hum after the count");
      const res = await recordHum(s.bpm, beats);
      if (!res || res.notes.length === 0) { flash("Did not catch a melody, try again"); return; }
      const cur = songRef.current;
      const id = `hum_${role}`;
      const { song: ns } = applyOps(cur, [{ op: "addTrack", track: { id, name: `Hummed ${role}`, role, volume: -6, duck: true, loopBeats: beats, notes: res.notes } }, ...cur.sections.map((sec) => ({ op: "active", section: sec.id, add: [id] }))]);
      await setSong(ns, { label: "hum" });
      void send(`I hummed this for the ${role}: ${JSON.stringify(res.notes)} over ${beats} beats. It is now on track "${id}" in every section. Tighten it up and make it fit.`, { hidden: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getEngine, setSong, recordHum, flash, runRollout, refreshEars, say]);

  // Instant moves: no brain, no wait. The brain hears about them next turn.
  const tryLocal = useCallback(async (text: string): Promise<boolean> => {
    const cur = songRef.current;
    const li = localIntent(text, cur);
    if (!li) return false;
    const t0 = performance.now();
    if (li.history === "undo" || li.history === "redo") {
      studioJobs.bump(li.history);   // work made for the version being left is not landed on the one coming back
      const v = li.history === "undo" ? historyRef.current.undo(cur) : historyRef.current.redo(cur);
      if (!v) { flash(li.history === "undo" ? "Nothing to undo" : "Nothing to redo"); return true; }
      await setSong(v.song, { noHistory: true, label: li.history }); flash(li.say);
    } else if (li.ab) {
      const cab = abRef.current;
      if (!cab) { flash("No A/B running"); return true; }
      if (li.ab === "a" || li.ab === "b") { cab.playing = li.ab; setAb({ ...cab }); await setSong(li.ab === "a" ? cab.a : cab.b, { silent: true, noHistory: true }); }
      else { const keep = li.ab === "keepA" ? "a" : "b"; logPair({ title: cur.title, label: cab.label, chosen: keep, aDiff: diffSongs(cab.b, cab.a).join(", "), bDiff: diffSongs(cab.a, cab.b).join(", ") }); await setSong(keep === "a" ? cab.a : cab.b, { label: `kept ${keep.toUpperCase()}` }); abRef.current = null; setAb(null); }
      if (li.say) say(li.say);
    } else {
      if (li.action?.type === "pause" && /^stop\b/i.test(text.trim())) studioJobs.bump("stop");   // a spoken stop ends the work in flight too
      let ns = cur;
      if (li.ops) { const res = applyOps(cur, li.ops); ns = res.song; landMoves(li.ops, cur, ns); }
      if (ns !== cur) await setSong(ns, { label: li.note });
      await runAction(li.action ?? null, ns, text);
      if (li.say) say(li.say);
    }
    localMovesRef.current.push(li.note); lastMoveAtRef.current = Date.now();
    setMessages((m) => [...m, { role: "user", content: text }, ...(li.say ? [{ role: "assistant" as const, content: li.say }] : [])]);
    logMoveScore({ at: Date.now(), ask: text, kind: "local", latencyMs: Math.round(performance.now() - t0), opsApplied: li.ops?.length ?? 0, skipped: 0 });
    setScore(scoreLine());
    return true;
  }, [flash, runAction, say, setSong]);

  // opts.task: an instruction from the Voice lane. Hidden from the transcript (their own words are
  // already there) but a real ask: instant moves and rollouts still resolve deterministically.
  // opts.alive: the job this ask runs for (lib/jobs/queue.ts); when it goes false the reply is dropped, never applied.
  // It resolves with the landing of the change it made, so the job lands when the audio does.
  const send = useCallback(async (text: string, opts?: { hidden?: boolean; verify?: string; task?: boolean; alive?: () => boolean; jobId?: string; nowPlaying?: Position | null }): Promise<Landing | null> => {
    const t = text.trim();
    if (!t) return null;
    if (!opts?.hidden) lastUtteranceRef.current = Date.now();
    if (busyRef.current) { pendingRef.current.push(t); return null; }
    const ask = !opts?.verify && (!opts?.hidden || !!opts?.task);
    if (ask && !opts?.task && (await tryLocal(t))) return null;
    // Only Brady's own words pick a path (lib/brain/route.ts); the Voice lane's task wording never does.
    const ro = ask && !opts?.task ? rolloutIntent(t, !!referenceRef.current) : null;
    if (ro && (ro.kind === "newSong" || ro.kind === "emulate") && actionsRef.current?.draft) { await actionsRef.current.draft(ro.lane ? laneInfo(ro.lane)?.name ?? ro.lane : null); return null; }
    if (ro) {
      busyRef.current = true; setBusy(true);
      if (!opts?.hidden) setMessages((m) => [...m, { role: "user", content: t }]);
      const sec = ro.section ? (songRef.current.sections.find((x) => x.id === ro.section || x.name.toLowerCase().replace(/\s+/g, "") === ro.section)?.id ?? ro.section) : null;
      const line = rolloutLine(ro, sec);
      setMessages((m) => [...m, { role: "assistant", content: line }]); say(line);
      try { await runAction({ type: "rollout", kind: ro.kind, section: sec ?? undefined, lane: ro.lane }, songRef.current, t); }
      finally { busyRef.current = false; setBusy(false); const p = pendingRef.current.shift(); if (p) void send(p); }
      return null;
    }
    busyRef.current = true; setBusy(true);
    const t0 = performance.now();
    // "This bar right here" is the bar he heard when he let go of the button, not where the playhead is by now.
    const nowPlaying: Position | null = opts?.nowPlaying ?? engineRef.current?.getPosition() ?? null;
    const next: Msg[] = [...messagesRef.current, { role: "user", content: t }];
    if (!opts?.hidden) setMessages(next); else messagesRef.current = next;
    const cur = songRef.current;
    const before = factsRef.current;
    let landing: Landing | null = null;
    try {
      const factsCompact = await compactFacts(factsRef.current);
      const refFacts = referenceRef.current ? await compactFacts(referenceRef.current.facts) : null;
      const deltas = await deltasFor(factsRef.current);
      const localMoves = localMovesRef.current.splice(0);
      // Streamed: the producer starts talking the moment its first sentence closes; the ops land right after.
      let early: string | null = null;
      // The first sentence is shown as it closes; the Voice lane already answered aloud, so the Hands
      // speak only their finished report.
      const data = await exchange({ messages: next, song: cur, facts: factsCompact, reference: referenceRef.current ? { name: referenceRef.current.name, facts: refFacts } : null, deltas, nowPlaying, taste: tasteSummary(cur.title), clips, localMoves, verify: opts?.verify ?? null, score: scoreLine(), critic: notesForBrain(), feel: feelFromFacts(factsRef.current)?.line ?? null, referenceFeel: referenceRef.current ? feelFromFacts(referenceRef.current.facts)?.line ?? null : null }, (s) => {
        early = s;
        setMessages((m) => [...m, { role: "assistant", content: s }]);
      }, "/api/chat", !!opts?.verify) as Reply;
      if (isE2E()) { const w = window as unknown as { __brain?: unknown[] }; (w.__brain ??= []).push(data); }
      if (opts?.alive && !opts.alive()) return null;   // the record moved on while the brain was thinking
      spend(data.model, data.usage);
      if (data.detail && /^cap:/i.test(data.detail)) setBrainDown("cap");
      else if (data.detail && /credit|billing/i.test(data.detail)) setBrainDown("credits");
      else if (data.detail && /invalid.*api.?key|authentication|401/i.test(data.detail)) setBrainDown("key");
      else if (brainDownRef.current) setBrainDown(null);
      if (early === null) setMessages((m) => [...m, { role: "assistant", content: data.say }]);
      else if (early !== data.say) setMessages((m) => { const c = [...m]; for (let i = c.length - 1; i >= 0; i--) if (c[i].role === "assistant") { c[i] = { role: "assistant", content: data.say }; break; } return c; });
      let ns: Song | null = null, applied = 0, skipped = 0;
      const refGroove = referenceRef.current?.facts.groove.template; // {"op":"groove","from":"reference"} borrows the reference's measured timing
      if (data.ops && Array.isArray(data.ops)) {
        let opsIn: unknown[] = data.ops;
        // Precise blips: "slice" ops cut audio in the browser first, then become ordinary ops.
        if (opsIn.some((o) => (o as { op?: string } | null)?.op === "slice")) {
          const { resolveSliceOps } = await import("@/lib/engine/slice");
          const r = await resolveSliceOps(opsIn, songRef.current, registerClip);
          opsIn = r.ops;
          if (r.made.length) { localMovesRef.current.push(`studio sliced ${r.made.join(", ")}`); flash(`Sliced ${r.made[0]}`); }
          if (r.failed.length) localMovesRef.current.push(`slice failed: ${r.failed.join("; ")}`);
        }
        const res = applyOps(songRef.current, withReferenceGroove(opsIn, refGroove)); ns = res.song; applied = res.applied; skipped = res.skipped.length;
        landMoves(opsIn, songRef.current, res.song);
      }
      else if (data.song) { ns = migrateSong(data.song); if (ns && ns.title !== cur.title) newProjectRef.current = true; }
      if (ns) landing = await setSong(ns, { silent: !!data.expect, label: data.say.slice(0, 40), jobId: opts?.jobId });
      if (ns && data.alternative && Array.isArray(data.alternative)) {
        const b = applyOps(cur, withReferenceGroove(data.alternative, refGroove)).song;
        abRef.current = { a: ns, b, playing: "a", label: data.say.slice(0, 60) }; setAb({ ...abRef.current });
      } else if (ns) { abRef.current = null; setAb(null); }
      setListenHint(data.listen ?? null);
      const entry = logMove({ title: (ns ?? cur).title, said: t, move: data.say, listen: data.listen, factsSummary: before ? `${Math.round(before.tempo.bpm)}bpm ${before.key.name} ${before.loudness.integrated.toFixed(1)}LUFS` : undefined });
      lastMoveRef.current = entry.id; setLastMoveId(entry.id); lastMoveAtRef.current = Date.now();
      if (ns) movedRef.current?.(entry.id);   // a move on the record is judged by what is said in the thirty seconds after it (hooks/useRitual)
      say(data.say);
      await runAction(data.action, ns ?? songRef.current, t);
      // Verify: re-hear the changed sections and hold the brain to its word, once per move.
      let verified: "pass" | "fail" | "na" = "na";
      if (ns && data.expect && !verifyingRef.current) {
        const after = await hearNow(ns);
        const problem = after ? verifyMove(before, after, data.expect) : null;
        verified = problem ? "fail" : "pass";
        // A miss is offered, never fixed behind his back: one spoken line, and the fix only on a yes.
        if (problem) {
          const fix = () => { verifyingRef.current = true; void send(`VERIFY: ${problem}. Fix it in one move and tell me honestly what you changed.`, { hidden: true, verify: problem }).finally(() => { verifyingRef.current = false; }); };
          if (offerRef.current) offerRef.current(`That did not come out the way I meant: ${problem.replace(/\.$/, "")}. Want me to try it another way?`, fix); else fix();
        }
      }
      const d = await deltasFor(factsRef.current);
      logMoveScore({ at: Date.now(), ask: t, kind: opts?.verify ? "verify" : "brain", latencyMs: Math.round(performance.now() - t0), opsApplied: applied, skipped, verified, refDelta: d ? referenceDelta(d as never) : null, lufs: factsRef.current?.loudness.integrated ?? null });
      setScore(scoreLine());
    } catch {
      const line = "Connection wobbled. Say that again?";
      setMessages((m) => [...m, { role: "assistant", content: line }]);
      say(line);
    } finally {
      busyRef.current = false; setBusy(false);
      const p = pendingRef.current.shift();
      if (p) void send(p);
    }
    return landing;
  }, [clips, compactFacts, deltasFor, hearNow, runAction, say, setSong, tryLocal, registerClip, flash, spend]);

  // Voice goes through the attention layer: was that for the producer? Typed text never does.
  const noteIgnored = useCallback((t: string) => { setIgnored({ text: t, at: Date.now() }); setIgnoredCount((n) => n + 1); }, []);
  const sendVoice = useCallback(async (raw: string) => {
    const { text: t, woke } = stripWake(raw);
    if (!t) { if (woke) say("Yes?"); return; }
    setIgnored(null);
    if (titlePendingRef.current) {
      titlePendingRef.current = false;
      const title = t.replace(/^(?:call it|name it|let'?s call it|title it|it'?s called|how about|maybe|um+|uh+)\s+/i, "").replace(/[.!?]+$/, "").trim().slice(0, 40);
      if (title && !/^(no|nah|skip|later|nothing|not now|leave it)$/i.test(title)) { await edit([{ op: "title", title: title.toUpperCase() }], `titled ${title}`); say(`${title}. Saved.`); return; }
      say("Untitled it stays. We can name it later."); return;
    }
    if (woke) return send(t);                                                       // named, always for me
    if (localIntent(t, songRef.current) || rolloutIntent(t, !!referenceRef.current)) return send(t);   // transport, mixer, new song: instant
    const recentMove = !!lastMoveRef.current && Date.now() - lastMoveAtRef.current < 25000;
    const gate = quickGate(t, { paused: pausedRef.current, recentMove });
    if (gate === "send") return send(t);
    if (gate === "ignore") return noteIgnored(t);
    const lastProducer = [...messagesRef.current].reverse().find((m) => m.role === "assistant")?.content ?? "";
    const lastAsk = [...messagesRef.current].reverse().find((m) => m.role === "user")?.content ?? "";
    const intent = await classify(t, { paused: pausedRef.current, lastProducer, lastAsk, section: engineRef.current?.getPosition()?.section ?? "" });
    if (intent === "ignore") return noteIgnored(t);
    return send(t);
  }, [noteIgnored, say, send, edit]);
  const thatWasForMe = useCallback(() => { const i = ignored; if (!i) return; setIgnored(null); void send(i.text); }, [ignored, send]);

  const lastUtteranceRef = useRef(Date.now());
  useInitiative({ started, paused, rollout, send, busy: busyRef, song: songRef, engine: engineRef, lastUtterance: lastUtteranceRef });

  // The line the stage opens with, the same one the press says and the arm fetches ahead.
  const greetingLine = () => isBlank(songRef.current)
    ? "New record. Who are we chasing tonight? An artist, a song, or a feeling."
    : resumeRef.current ? `We are back. Last time: ${resumeRef.current} Where do we pick up?`
    : messagesRef.current.length > 0 ? "We are back. Tell me what you are hearing." : "We are live. That is our groove. Name a vibe, or just say surprise me.";
  const boot = useCallback(async () => {
    if (starting) return;
    if (!started) {
      setStarting(true); performance.mark("producer:boot");   // the press, for the first-sound probe
      try {
        const greeting = greetingLine();
        resumeRef.current = null;
        // One greeting per session on screen: earlier boot greetings (a reload, a second start) are replaced, never stacked.
        const isGreeting = (t: string) => /^(New record\. Who are we chasing|We are back\.|We are live\. That is our groove)/.test(t);
        setMessages((m) => { const kept = [...m]; while (kept.length && kept[kept.length - 1].role === "assistant" && isGreeting(kept[kept.length - 1].content)) kept.pop(); return [...kept, { role: "assistant", content: greeting }]; });
        // A fixed order on one clock: the context resumes inside the press, the greeting (fetched ahead) starts
        // at t0 and the record joins underneath it a moment later. Nothing waits on a race.
        const eng = await getEngine();
        const c = studioContext(); if (c.state === "suspended") await c.resume().catch(() => {});
        const t0 = c.currentTime + VOICE_LEAD;
        say(greeting, { at: t0 });
        await eng.start(songRef.current, { at: t0 + RECORD_LEAD });
        setStarted(true); setPaused(false);
        // The first listen waits out the first two bars, so the start has the thread to itself.
        refreshEars(songRef.current, Math.round((8 * 60 / songRef.current.bpm) * 1000) + 500);
      } finally { setStarting(false); }
      return;
    }
    const eng = await getEngine();
    if (paused) { eng.resume(); setPaused(false); return; }
    eng.pause(); setPaused(true);
    // On the way out, a record with no name gets one. Once per session, by voice.
    if (isGenericTitle(songRef.current.title) && songRef.current.tracks.length > 0 && !askedTitleRef.current) {
      askedTitleRef.current = true; titlePendingRef.current = true;
      say("Paused. Before we leave it, what do we call this one?");
    }
  }, [getEngine, paused, refreshEars, say, started, starting]);

  // Explicit transport for the orchestrator (auditions, interrupts) and the transcript it keeps.
  const play = useCallback(async () => { if (!started) { await boot(); return; } const eng = await getEngine(); eng.resume(); setPaused(false); }, [boot, getEngine, started]);
  const pause = useCallback(async () => { if (!started) return; const eng = await getEngine(); eng.pause(); setPaused(true); }, [getEngine, started]);
  const append = useCallback((role: "user" | "assistant", content: string) => { const m = { role, content }; messagesRef.current = [...messagesRef.current, m]; setMessages((x) => [...x, m]); }, []);
  const getPosition = useCallback((): Position | null => engineRef.current?.getPosition() ?? null, []);
  const duck = useCallback((on: boolean) => { engineRef.current?.duck(on); }, []);
  const liveEngine = useCallback(() => engineRef.current, []);
  /** Settles when the record is armed and the greeting fetched (4 s at most): what a person sees before they press. */
  const whenArmed = useCallback(() => Promise.race([armedRef.current, new Promise((r) => window.setTimeout(r, 4000))]), []);
  const onLaid = useCallback((f: (() => void) | null) => { laidRef.current = f; }, []);
  const onMoveLanded = useCallback((f: ((id: string) => void) | null) => { movedRef.current = f; }, []);
  /** A move made outside the brain (a voice placed, a take) opens the same thirty-second verdict window. */
  const openVerdict = useCallback((id: string) => { lastMoveRef.current = id; setLastMoveId(id); lastMoveAtRef.current = Date.now(); movedRef.current?.(id); }, []);
  const onOffer = useCallback((f: ((line: string, yes: () => void) => void) | null) => { offerRef.current = f; }, []);
  /** A whole new version of the record, landed on a boundary (a draft on the next bar from its top, next one on the next phrase). */
  const land = useCallback((s: Song, o: SetOpts) => setSong(s, o), [setSong]);
  const jump = useCallback(async (sectionId: string) => { const eng = await getEngine(); if (eng.goto(sectionId)) flash(`Jumped to ${songRef.current.sections.find((s) => s.id === sectionId)?.name ?? sectionId}`); }, [flash, getEngine]);
  const verdict = useCallback((v: "liked" | "killed") => { if (!lastMoveId) return; attachWindow(lastMoveId, { landedAt: lastMoveAtRef.current, windowMs: 30000, saidAt: Date.now(), words: v === "liked" ? "pressed keep" : "pressed kill", verdict: v === "liked" ? "liked" : "rejected", closedBy: "verdict" }); flash(v === "liked" ? "Kept" : "Killed"); void send(v === "liked" ? "Yes, keep that." : "No, kill that, go a different direction."); }, [flash, lastMoveId, send]);
  const undo = useCallback(() => void tryLocal("undo"), [tryLocal]); const redo = useCallback(() => void tryLocal("redo"), [tryLocal]);
  const pickAb = useCallback((which: "a" | "b" | "keepA" | "keepB") => void tryLocal(which === "a" ? "play a" : which === "b" ? "play b" : which === "keepA" ? "keep a" : "keep b"), [tryLocal]);
  const { loadSaved, saveNow, download } = useLibraryActions({ autoSave, flash, say, setSong, started, getSong: () => songRef.current, setRendering });
  const { addReference, addClip } = useUploads({ flash, send, setSong, setClips, factsRef, referenceRef, setReference, setDeltaText, getSong: () => songRef.current });

  return { song, messages, busy, started, starting, paused, nowSection, library, clips, facts, hearing, reference, deltaText, listenHint, toast, lastMoveId, rendering, ab, score, canUndo, canRedo, rollout, notSaved,
    boot, send, sendVoice, ignored, ignoredCount, thatWasForMe, loadChat, newSession, setReferenceBuffer, setReferenceFacts, moves, previewClip, brainDown, jump, verdict, undo, redo, pickAb, cancelRollout, loadSaved, saveNow, download, addReference, addClip, flash, loadSong, getSong, edit, registerClip, getLevels, getSchedule, getHealth, setVolume, toggleTrack,
    play, pause, append, tryLocal, spend, cost, getPosition, duck, liveEngine, onLaid, onMoveLanded, openVerdict, onOffer, land, runAction, whenArmed, setMetering, factsNow: () => factsRef.current, referenceNow: () => referenceRef.current };
}
