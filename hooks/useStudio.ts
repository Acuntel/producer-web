"use client";
// The studio session: song state, the brain exchange, the ears, references,
// clips, the taste ledger, transport actions. The page only renders.
import { useCallback, useEffect, useRef, useState } from "react";
import { SEED_SONG, applyOps, migrateSong, type Song, type Note, type Role } from "@/lib/song";
import type { Engine, Position } from "@/lib/engine";
import type { MusicFacts } from "@/lib/ears";
import { logMove, setVerdict, inferVerdictFromUtterance, tasteSummary } from "@/lib/taste";
import type { BrainAction } from "@/lib/brain/parse";
import type { Reference } from "@/components/EarsPanel";
import type { SavedSong, ClipMeta } from "@/components/SongsSheet";

type Msg = { role: "user" | "assistant"; content: string };
type Reply = { say: string; ops?: unknown[] | null; song?: unknown; action?: BrainAction | null; listen?: string | null; detail?: string };

const LIB_KEY = "producer.library.v2", SONG_KEY = "producer.song.v4", CHAT_KEY = "producer.chat.v3", REF_KEY = "producer.reference.v1";
const loadLibrary = (): SavedSong[] => { try { return JSON.parse(localStorage.getItem(LIB_KEY) ?? "[]"); } catch { return []; } };
const persistLibrary = (lib: SavedSong[]) => { try { localStorage.setItem(LIB_KEY, JSON.stringify(lib.slice(0, 30))); } catch {} };

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

  const engineRef = useRef<Engine | null>(null);
  const songRef = useRef(song); const messagesRef = useRef(messages);
  const factsRef = useRef<MusicFacts | null>(null); const referenceRef = useRef<Reference | null>(null);
  const busyRef = useRef(false); const pendingRef = useRef<string | null>(null);
  const lastMoveRef = useRef<string | null>(null);
  const hearSeq = useRef(0);
  useEffect(() => { songRef.current = song; }, [song]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    try {
      const s = migrateSong(JSON.parse(localStorage.getItem(SONG_KEY) ?? "null"));
      if (s) setSongState(s);
      const m = localStorage.getItem(CHAT_KEY); if (m) setMessages(JSON.parse(m));
      const r = localStorage.getItem(REF_KEY); if (r) { const ref = JSON.parse(r); setReference(ref); referenceRef.current = ref; }
    } catch {}
    setLibrary(loadLibrary());
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

  // The ears on our own render. Sequenced so a stale render never overwrites a newer one.
  const refreshEars = useCallback(async (s: Song) => {
    const seq = ++hearSeq.current;
    setHearing(true);
    try {
      const { hearSong } = await import("@/lib/engine");
      const f = await hearSong(s, { maxSeconds: 240 });
      if (seq !== hearSeq.current) return;
      factsRef.current = f; setFacts(f);
      if (referenceRef.current) {
        const { compare } = await import("@/lib/ears");
        setDeltaText(compare(f, referenceRef.current.facts).text);
      }
    } catch { /* ears failed; the brain is told nothing was measured */ }
    finally { if (seq === hearSeq.current) setHearing(false); }
  }, []);

  const setSong = useCallback(async (s: Song, opts?: { silent?: boolean }) => {
    songRef.current = s; setSongState(s);
    const eng = await getEngine();
    if (started || engineRef.current) await eng.update(s);
    autoSave(s);
    if (!opts?.silent) void refreshEars(s);
  }, [autoSave, getEngine, refreshEars, started]);

  const runAction = useCallback(async (a: BrainAction | null | undefined, s: Song) => {
    if (!a) return;
    const eng = await getEngine();
    if (a.type === "pause") { eng.pause(); setPaused(true); }
    else if (a.type === "play") { eng.resume(); setPaused(false); }
    else if (a.type === "goto") { if (a.section) eng.goto(a.section); else if (a.bar) eng.gotoBar(a.bar); if (!eng.playing) { eng.resume(); setPaused(false); } }
    else if (a.type === "loop") { const ns = { ...s, loop: a.section ? { section: a.section } : a.bar ? { startBar: a.bar, endBar: a.bar + (a.beats ? a.beats / 4 : 4) } : s.loop }; await setSong(ns, { silent: true }); if (a.section) eng.goto(a.section); }
    else if (a.type === "unloop") { await setSong({ ...s, loop: null }, { silent: true }); }
    else if (a.type === "recordHum") {
      const beats = a.beats && a.beats > 0 ? Math.min(32, a.beats) : 8;
      const role = (a.track && ["lead", "bass", "chords", "pluck", "arp", "stab", "pad", "sub"].includes(a.track) ? a.track : "lead") as Role;
      flash("Hum after the count");
      const res = await recordHum(s.bpm, beats);
      if (!res || res.notes.length === 0) { flash("Did not catch a melody, try again"); return; }
      const cur = songRef.current;
      const id = `hum_${role}`;
      const { song: ns } = applyOps(cur, [
        { op: "addTrack", track: { id, name: `Hummed ${role}`, role, volume: -6, duck: true, loopBeats: beats, notes: res.notes } },
        ...cur.sections.map((sec) => ({ op: "active", section: sec.id, add: [id] })),
      ]);
      await setSong(ns);
      void send(`I hummed this for the ${role}: ${JSON.stringify(res.notes)} over ${beats} beats. It is now on track "${id}" in every section. Tighten it up and make it fit.`, { hidden: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getEngine, setSong, recordHum, flash]);

  const send = useCallback(async (text: string, opts?: { hidden?: boolean }) => {
    const t = text.trim();
    if (!t) return;
    if (busyRef.current) { pendingRef.current = t; return; }
    busyRef.current = true; setBusy(true);
    if (lastMoveRef.current && !opts?.hidden) { const v = inferVerdictFromUtterance(t); if (v) setVerdict(lastMoveRef.current, v); }
    const nowPlaying: Position | null = engineRef.current?.getPosition() ?? null;
    const next: Msg[] = [...messagesRef.current, { role: "user", content: t }];
    if (!opts?.hidden) setMessages(next); else messagesRef.current = next;
    const cur = songRef.current;
    try {
      let refFacts: unknown = null, factsCompact: unknown = null, deltas: unknown = null;
      try {
        const ears = await import("@/lib/ears");
        factsCompact = factsRef.current ? ears.factsForBrain(factsRef.current) : null;
        refFacts = referenceRef.current ? ears.factsForBrain(referenceRef.current.facts) : null;
        deltas = factsRef.current && referenceRef.current ? ears.compare(factsRef.current, referenceRef.current.facts).deltas : null;
      } catch {}
      const r = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, song: cur, facts: factsCompact, reference: referenceRef.current ? { name: referenceRef.current.name, facts: refFacts } : null, deltas, nowPlaying, taste: tasteSummary(cur.title), clips }),
      });
      const data = (await r.json()) as Reply;
      setMessages((m) => [...m, { role: "assistant", content: data.say }]);
      let ns: Song | null = null;
      if (data.ops && Array.isArray(data.ops)) {
        const res = applyOps(songRef.current, data.ops);
        ns = res.song;
        if (res.skipped.length) console.warn("skipped ops", res.skipped);
      } else if (data.song) ns = migrateSong(data.song);
      if (ns) await setSong(ns);
      setListenHint(data.listen ?? null);
      const entry = logMove({ title: (ns ?? cur).title, said: t, move: data.say, listen: data.listen, factsSummary: factsRef.current ? `${Math.round(factsRef.current.tempo.bpm)}bpm ${factsRef.current.key.name} ${factsRef.current.loudness.integrated.toFixed(1)}LUFS` : undefined });
      lastMoveRef.current = entry.id; setLastMoveId(entry.id);
      say(data.say);
      await runAction(data.action, ns ?? songRef.current);
    } catch {
      const line = "Connection wobbled. Say that again?";
      setMessages((m) => [...m, { role: "assistant", content: line }]);
      say(line);
    } finally {
      busyRef.current = false; setBusy(false);
      const p = pendingRef.current; pendingRef.current = null;
      if (p) void send(p);
    }
  }, [clips, runAction, say, setSong]);

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
        void refreshEars(songRef.current);
      } finally { setStarting(false); }
      return;
    }
    const eng = await getEngine();
    if (paused) { eng.resume(); setPaused(false); } else { eng.pause(); setPaused(true); }
  }, [getEngine, paused, refreshEars, say, started, starting]);

  const jump = useCallback(async (sectionId: string) => { const eng = await getEngine(); if (eng.goto(sectionId)) flash(`Jumped to ${songRef.current.sections.find((s) => s.id === sectionId)?.name ?? sectionId}`); }, [flash, getEngine]);

  const verdict = useCallback((v: "liked" | "killed") => {
    if (!lastMoveId) return;
    setVerdict(lastMoveId, v); flash(v === "liked" ? "Kept" : "Killed");
    void send(v === "liked" ? "Yes, keep that." : "No, kill that, go a different direction.");
  }, [flash, lastMoveId, send]);

  const loadSaved = useCallback(async (item: SavedSong) => { autoSave(songRef.current); await setSong(item.song); flash(`Loaded ${item.song.title}`); if (started) say(`Loaded ${item.song.title}. Where were we?`); }, [autoSave, flash, say, setSong, started]);
  const saveNow = useCallback(() => { autoSave(songRef.current); flash(`Saved ${songRef.current.title}`); }, [autoSave, flash]);
  const download = useCallback(async (s?: Song) => {
    setRendering(true);
    try {
      const target = s ?? songRef.current;
      const { renderWav } = await import("@/lib/engine");
      const url = URL.createObjectURL(await renderWav(target));
      const a = document.createElement("a"); a.href = url; a.download = `${target.title.replace(/\s+/g, "-")}.wav`; a.click();
      URL.revokeObjectURL(url); flash("Downloading your song");
    } finally { setRendering(false); }
  }, [flash]);

  // A reference track: heard, never copied.
  const addReference = useCallback(async (file: File) => {
    flash("Listening to the reference…");
    const { decodeFile, hearBuffer } = await import("@/lib/ears/browser");
    const f = await hearBuffer(await decodeFile(file), { maxSeconds: 240, label: file.name });
    const ref = { name: file.name.replace(/\.[a-z0-9]+$/i, ""), facts: f };
    referenceRef.current = ref; setReference(ref);
    try { localStorage.setItem(REF_KEY, JSON.stringify(ref)); } catch {}
    if (factsRef.current) { const { compare } = await import("@/lib/ears"); setDeltaText(compare(factsRef.current, f).text); }
    void send(`I uploaded a reference track called "${ref.name}". You just heard it: ${f.read} Tell me what you hear in one breath, then make our song chase its DNA one move at a time.`, { hidden: true });
  }, [flash, send]);

  // A sample or vocal: stored, heard, dropped in as an audio track.
  const addClip = useCallback(async (file: File) => {
    flash("Hearing the clip…");
    const { decodeFile, hearBuffer } = await import("@/lib/ears/browser");
    const { putClip, newClipId, cacheDecoded } = await import("@/lib/engine");
    const bytes = await file.arrayBuffer();
    const buf = await decodeFile(new Blob([bytes]));
    const f = await hearBuffer(buf, { maxSeconds: 60, label: file.name });
    const id = newClipId();
    const name = file.name.replace(/\.[a-z0-9]+$/i, "");
    const short = buf.duration < 2.5;
    await putClip({ id, name, type: file.type, bytes, createdAt: Date.now(), durationSec: buf.duration, bpm: short ? undefined : f.tempo.bpm, key: f.key.name });
    cacheDecoded(id, buf);
    const meta = { id, name, bpm: short ? undefined : f.tempo.bpm, key: f.key.name, durationSec: buf.duration };
    setClips((c) => [...c, meta]);
    const cur = songRef.current;
    const trackId = `clip_${cur.tracks.length + 1}`;
    const beats = Math.max(1, Math.round((buf.duration / 60) * cur.bpm / 4) * 4);
    const { song: ns } = applyOps(cur, [{ op: "addTrack", track: { id: trackId, name, role: "audio", volume: -4, duck: true, loopBeats: short ? 4 : beats,
      notes: short ? [[60, 0, 0.5, 110], [60, 2, 0.5, 100]] : [],
      clip: { clipId: id, name, bpm: short ? undefined : f.tempo.bpm, warp: !short, semitones: 0, lengthBeats: short ? undefined : beats, gainDb: 0, oneShot: short, durationSec: buf.duration } } },
      ...cur.sections.filter((s) => /drop|groove/i.test(s.name)).map((s) => ({ op: "active", section: s.id, add: [trackId] }))]);
    await setSong(ns);
    void send(`I dropped in an audio clip "${name}" (${buf.duration.toFixed(1)}s, ${short ? "one-shot" : `${Math.round(f.tempo.bpm)} BPM warped to ${cur.bpm}`}, key ${f.key.name}) as track "${trackId}" in the drops and groove. Make it sit: level, placement, pitch, chops. Tell me what you did.`, { hidden: true });
  }, [flash, send, setSong]);

  return { song, messages, busy, started, starting, paused, nowSection, beat, library, clips, facts, hearing, reference, deltaText, listenHint, toast, lastMoveId, rendering,
    boot, send, jump, verdict, loadSaved, saveNow, download, addReference, addClip, flash };
}
