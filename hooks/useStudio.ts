"use client";
// The studio session: song state, instant local moves, the brain exchange, the
// ears, verify-after-move, A/B auditions, rollouts, references, clips, taste,
// history and the scorecard. The page only renders.
import { useCallback, useEffect, useRef, useState } from "react";
import { SEED_SONG, applyOps, migrateSong, History, diffSongs, type Song, type Note, type Role } from "@/lib/song";
import type { Engine, Position } from "@/lib/engine";
import type { MusicFacts } from "@/lib/ears";
import { logMove, setVerdict, inferVerdictFromUtterance, tasteSummary, logPair } from "@/lib/taste";
import { logMoveScore, referenceDelta, scoreLine } from "@/lib/scorecard";
import { notesForBrain } from "@/lib/critic";
import { localIntent, rolloutIntent } from "@/lib/brain/local";
import { verifyMove } from "@/lib/brain/verify";
import type { BrainAction, Expectation } from "@/lib/brain/parse";
import type { RolloutKind } from "@/lib/brain/rollouts";
import { useRollout } from "./useRollout";
import { useUploads } from "./useUploads";
import { useLibraryActions } from "./useLibraryActions";
import type { Reference } from "@/components/EarsPanel";
import type { SavedSong, ClipMeta } from "@/components/SongsSheet";

type Msg = { role: "user" | "assistant"; content: string };
type Reply = { say: string; ops?: unknown[] | null; song?: unknown; action?: BrainAction | null; listen?: string | null; expect?: Expectation[] | null; alternative?: unknown[] | null; detail?: string };
export type AB = { a: Song; b: Song; playing: "a" | "b"; label: string } | null;

const LIB_KEY = "producer.library.v2", SONG_KEY = "producer.song.v4", CHAT_KEY = "producer.chat.v3", REF_KEY = "producer.reference.v1";
const loadLibrary = (): SavedSong[] => { try { return JSON.parse(localStorage.getItem(LIB_KEY) ?? "[]"); } catch { return []; } };
const persistLibrary = (lib: SavedSong[]) => { try { localStorage.setItem(LIB_KEY, JSON.stringify(lib.slice(0, 30))); } catch {} };
const isE2E = () => typeof window !== "undefined" && window.location.search.includes("e2e");

export function useStudio(say: (t: string) => void, recordHum: (bpm: number, beats: number) => Promise<{ notes: Note[] } | null>) {
  const [song, setSongState] = useState<Song>(SEED_SONG);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [nowSection, setNowSection] = useState(-1);
  const [beat, setBeat] = useState<number | null>(null);
  const [library, setLibrary] = useState<SavedSong[]>([]);
  const [clips, setClips] = useState<ClipMeta[]>([]);
  const [facts, setFacts] = useState<MusicFacts | null>(null);
  const [hearing, setHearing] = useState(false);
  const [reference, setReference] = useState<Reference | null>(null);
  const [deltaText, setDeltaText] = useState<string | null>(null);
  const [listenHint, setListenHint] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [lastMoveId, setLastMoveId] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [ab, setAb] = useState<AB>(null);
  const [score, setScore] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const engineRef = useRef<Engine | null>(null);
  const songRef = useRef(song); const messagesRef = useRef(messages);
  const factsRef = useRef<MusicFacts | null>(null); const referenceRef = useRef<Reference | null>(null);
  const busyRef = useRef(false); const pendingRef = useRef<string | null>(null);
  const lastMoveRef = useRef<string | null>(null);
  const hearSeq = useRef(0);
  const historyRef = useRef(new History(60));
  const abRef = useRef<AB>(null);
  const localMovesRef = useRef<string[]>([]);
  const verifyingRef = useRef(false);
  useEffect(() => { songRef.current = song; }, [song]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    try {
      const s = migrateSong(JSON.parse(localStorage.getItem(SONG_KEY) ?? "null"));
      if (s) setSongState(s);
      const m = localStorage.getItem(CHAT_KEY); if (m) setMessages(JSON.parse(m));
      const r = localStorage.getItem(REF_KEY); if (r) { const ref = JSON.parse(r); setReference(ref); referenceRef.current = ref; }
    } catch {}
    setLibrary(loadLibrary()); setScore(scoreLine());
    void import("@/lib/engine").then(({ listClips }) => listClips().then((all) => setClips(all.map((c) => ({ id: c.id, name: c.name, bpm: c.bpm, key: c.key, durationSec: c.durationSec }))))).catch(() => {});
  }, []);
  useEffect(() => { try { localStorage.setItem(SONG_KEY, JSON.stringify(song)); localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-40))); } catch {} }, [song, messages]);
  useEffect(() => {
    if (!started) return;
    const t = window.setInterval(() => setBeat(engineRef.current?.getBeat() ?? null), 90);
    return () => window.clearInterval(t);
  }, [started]);

  const flash = useCallback((t: string) => { setToast(t); setTimeout(() => setToast(""), 1800); }, []);
  const getEngine = useCallback(async () => {
    if (!engineRef.current) {
      const { Engine } = await import("@/lib/engine");
      engineRef.current = new Engine();
      engineRef.current.onSection = (_n, idx) => setNowSection(idx);
    }
    return engineRef.current;
  }, []);
  const autoSave = useCallback((s: Song) => {
    const lib = [{ song: s, savedAt: Date.now() }, ...loadLibrary().filter((x) => x.song.title !== s.title)];
    persistLibrary(lib); setLibrary(lib.slice(0, 30));
  }, []);

  // The ears on our own render. Only changed sections re-render (cache); sequenced so stale results never win.
  const hearNow = useCallback(async (s: Song): Promise<MusicFacts | null> => {
    const seq = ++hearSeq.current;
    setHearing(true);
    try {
      const { hearSong } = await import("@/lib/engine");
      const f = await hearSong(s, { maxSeconds: 240 });
      if (seq !== hearSeq.current) return f;
      factsRef.current = f; setFacts(f);
      if (referenceRef.current) { const { compare } = await import("@/lib/ears"); setDeltaText(compare(f, referenceRef.current.facts).text); }
      return f;
    } catch { return null; }
    finally { if (seq === hearSeq.current) setHearing(false); }
  }, []);
  const refreshEars = useCallback((s: Song) => { void hearNow(s); }, [hearNow]);

  const setSong = useCallback(async (s: Song, opts?: { silent?: boolean; label?: string; noHistory?: boolean }) => {
    if (!opts?.noHistory) historyRef.current.push(songRef.current, opts?.label ?? "change");
    setCanUndo(historyRef.current.canUndo); setCanRedo(historyRef.current.canRedo);
    songRef.current = s; setSongState(s);
    const eng = await getEngine();
    if (started || engineRef.current) await eng.update(s);
    autoSave(s);
    if (!opts?.silent) refreshEars(s);
  }, [autoSave, getEngine, refreshEars, started]);

  const compactFacts = useCallback(async (f: MusicFacts | null) => { if (!f) return null; try { const ears = await import("@/lib/ears"); return ears.factsForBrain(f); } catch { return null; } }, []);
  const deltasFor = useCallback(async (f: MusicFacts | null) => { if (!f || !referenceRef.current) return null; try { const ears = await import("@/lib/ears"); return ears.compare(f, referenceRef.current.facts).deltas; } catch { return null; } }, []);

  const rolloutDeps = useRef({
    getSong: () => songRef.current,
    applySong: (s: Song, o?: { silent?: boolean }) => setSong(s, { ...o, noHistory: true }),
    hearNow, getReference: () => referenceRef.current,
    getDeltas: (f: MusicFacts | null) => { let d: unknown = null; void deltasFor(f).then((x) => (d = x)); return d; },
    compact: (f: MusicFacts | null) => { if (!f) return null; let c: unknown = null; void compactFacts(f).then((x) => (c = x)); return c; },
    say, taste: () => tasteSummary(songRef.current.title),
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
      const kind = (["newSong", "emulate", "finish", "fixSection"].includes(a.kind ?? "") ? a.kind : referenceRef.current ? "emulate" : "newSong") as RolloutKind;
      historyRef.current.push(songRef.current, `before ${kind}`); setCanUndo(true);
      const res = await runRollout(kind, ask, a.section ?? null);
      refreshEars(songRef.current);
      if (res) { setMessages((m) => [...m, { role: "assistant", content: res.say }]); messagesRef.current = [...messagesRef.current, { role: "assistant", content: res.say }]; setListenHint(res.listen); say(res.say); }
    }
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
      let ns = cur;
      if (li.ops) { const res = applyOps(cur, li.ops); ns = res.song; }
      if (ns !== cur) await setSong(ns, { label: li.note });
      await runAction(li.action ?? null, ns, text);
      if (li.say) say(li.say);
    }
    localMovesRef.current.push(li.note);
    setMessages((m) => [...m, { role: "user", content: text }, ...(li.say ? [{ role: "assistant" as const, content: li.say }] : [])]);
    logMoveScore({ at: Date.now(), ask: text, kind: "local", latencyMs: Math.round(performance.now() - t0), opsApplied: li.ops?.length ?? 0, skipped: 0 });
    setScore(scoreLine());
    return true;
  }, [flash, runAction, say, setSong]);

  const send = useCallback(async (text: string, opts?: { hidden?: boolean; verify?: string }) => {
    const t = text.trim();
    if (!t) return;
    if (busyRef.current) { pendingRef.current = t; return; }
    if (!opts?.hidden && !opts?.verify && (await tryLocal(t))) return;
    const ro = !opts?.hidden && !opts?.verify ? rolloutIntent(t, !!referenceRef.current) : null;
    if (ro) {
      busyRef.current = true; setBusy(true);
      setMessages((m) => [...m, { role: "user", content: t }]);
      const sec = ro.section ? (songRef.current.sections.find((x) => x.id === ro.section || x.name.toLowerCase().replace(/\s+/g, "") === ro.section)?.id ?? ro.section) : null;
      const line = ro.kind === "emulate" ? "On it. I will chase the reference in layers: drums, bass, harmony, hook, then the mix." : ro.kind === "finish" ? "Building it out to a full arrangement now." : ro.kind === "fixSection" ? `Reworking the ${sec ?? "section"} now.` : "Give me a minute, I will build this in layers: drums, bass, then the hook.";
      setMessages((m) => [...m, { role: "assistant", content: line }]); say(line);
      try { await runAction({ type: "rollout", kind: ro.kind, section: sec ?? undefined }, songRef.current, t); }
      finally { busyRef.current = false; setBusy(false); const p = pendingRef.current; pendingRef.current = null; if (p) void send(p); }
      return;
    }
    busyRef.current = true; setBusy(true);
    const t0 = performance.now();
    if (lastMoveRef.current && !opts?.hidden) { const v = inferVerdictFromUtterance(t); if (v) setVerdict(lastMoveRef.current, v); }
    const nowPlaying: Position | null = engineRef.current?.getPosition() ?? null;
    const next: Msg[] = [...messagesRef.current, { role: "user", content: t }];
    if (!opts?.hidden) setMessages(next); else messagesRef.current = next;
    const cur = songRef.current;
    const before = factsRef.current;
    try {
      const factsCompact = await compactFacts(factsRef.current);
      const refFacts = referenceRef.current ? await compactFacts(referenceRef.current.facts) : null;
      const deltas = await deltasFor(factsRef.current);
      const localMoves = localMovesRef.current.splice(0);
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next, song: cur, facts: factsCompact, reference: referenceRef.current ? { name: referenceRef.current.name, facts: refFacts } : null, deltas, nowPlaying, taste: tasteSummary(cur.title), clips, localMoves, verify: opts?.verify ?? null, score: scoreLine(), critic: notesForBrain() }) });
      const data = (await r.json()) as Reply;
      if (isE2E()) { const w = window as unknown as { __brain?: unknown[] }; (w.__brain ??= []).push(data); }
      setMessages((m) => [...m, { role: "assistant", content: data.say }]);
      let ns: Song | null = null, applied = 0, skipped = 0;
      if (data.ops && Array.isArray(data.ops)) { const res = applyOps(songRef.current, data.ops); ns = res.song; applied = res.applied; skipped = res.skipped.length; }
      else if (data.song) ns = migrateSong(data.song);
      if (ns) await setSong(ns, { silent: !!data.expect, label: data.say.slice(0, 40) });
      if (ns && data.alternative && Array.isArray(data.alternative)) {
        const b = applyOps(cur, data.alternative).song;
        abRef.current = { a: ns, b, playing: "a", label: data.say.slice(0, 60) }; setAb({ ...abRef.current });
      } else if (ns) { abRef.current = null; setAb(null); }
      setListenHint(data.listen ?? null);
      const entry = logMove({ title: (ns ?? cur).title, said: t, move: data.say, listen: data.listen, factsSummary: before ? `${Math.round(before.tempo.bpm)}bpm ${before.key.name} ${before.loudness.integrated.toFixed(1)}LUFS` : undefined });
      lastMoveRef.current = entry.id; setLastMoveId(entry.id);
      say(data.say);
      await runAction(data.action, ns ?? songRef.current, t);
      // Verify: re-hear the changed sections and hold the brain to its word, once per move.
      let verified: "pass" | "fail" | "na" = "na";
      if (ns && data.expect && !verifyingRef.current) {
        const after = await hearNow(ns);
        const problem = after ? verifyMove(before, after, data.expect) : null;
        verified = problem ? "fail" : "pass";
        if (problem) { verifyingRef.current = true; void send(`VERIFY: ${problem}. Fix it in one move and tell me honestly what you changed.`, { hidden: true, verify: problem }).finally(() => { verifyingRef.current = false; }); }
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
      const p = pendingRef.current; pendingRef.current = null;
      if (p) void send(p);
    }
  }, [clips, compactFacts, deltasFor, hearNow, runAction, say, setSong, tryLocal]);

  const boot = useCallback(async () => {
    if (starting) return;
    if (!started) {
      setStarting(true);
      try {
        const eng = await getEngine();
        await eng.start(songRef.current);
        setStarted(true); setPaused(false);
        const greeting = messagesRef.current.length > 0 ? "We are back. Tell me what you are hearing." : "We are live. That is our groove. Name a vibe, or just say surprise me.";
        setMessages((m) => [...m, { role: "assistant", content: greeting }]);
        say(greeting);
        refreshEars(songRef.current);
      } finally { setStarting(false); }
      return;
    }
    const eng = await getEngine();
    if (paused) { eng.resume(); setPaused(false); } else { eng.pause(); setPaused(true); }
  }, [getEngine, paused, refreshEars, say, started, starting]);

  const jump = useCallback(async (sectionId: string) => { const eng = await getEngine(); if (eng.goto(sectionId)) flash(`Jumped to ${songRef.current.sections.find((s) => s.id === sectionId)?.name ?? sectionId}`); }, [flash, getEngine]);
  const verdict = useCallback((v: "liked" | "killed") => { if (!lastMoveId) return; setVerdict(lastMoveId, v); flash(v === "liked" ? "Kept" : "Killed"); void send(v === "liked" ? "Yes, keep that." : "No, kill that, go a different direction."); }, [flash, lastMoveId, send]);
  const undo = useCallback(() => void tryLocal("undo"), [tryLocal]);
  const redo = useCallback(() => void tryLocal("redo"), [tryLocal]);
  const pickAb = useCallback((which: "a" | "b" | "keepA" | "keepB") => void tryLocal(which === "a" ? "play a" : which === "b" ? "play b" : which === "keepA" ? "keep a" : "keep b"), [tryLocal]);
  const { loadSaved, saveNow, download } = useLibraryActions({ autoSave, flash, say, setSong, started, getSong: () => songRef.current, setRendering });
  const { addReference, addClip } = useUploads({ flash, send, setSong, setClips, factsRef, referenceRef, setReference, setDeltaText, getSong: () => songRef.current });

  return { song, messages, busy, started, starting, paused, nowSection, beat, library, clips, facts, hearing, reference, deltaText, listenHint, toast, lastMoveId, rendering, ab, score, canUndo, canRedo, rollout,
    boot, send, jump, verdict, undo, redo, pickAb, cancelRollout, loadSaved, saveNow, download, addReference, addClip, flash };
}
