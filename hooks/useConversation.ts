"use client";
// The conversation, orchestrated. Every sentence you say goes: instant local move if it
// is one; otherwise the Voice lane answers within a second and decides whether the
// Hands have work, whether research should start, or whether to play an audition.
// Work runs behind the talk and shows up as cards; a press or a stop word interrupts.
import { useCallback, useRef, useState } from "react";
import type { Work } from "@/components/WorkCards";
import type { VoiceControl, VoiceState } from "@/lib/brain/voice";
import type { Song } from "@/lib/song/types";
import { economyQuery } from "@/lib/brain/stream";
import { feelFromFacts } from "@/lib/brain/feel";
import { tasteSummary } from "@/lib/taste";
import type { useStudio } from "./useStudio";

type Studio = ReturnType<typeof useStudio>;
type Deps = {
  studio: Studio;
  voice: { speak: (t: string) => Promise<void>; stop: () => void; speaking: boolean };
  screen: "landing" | "library" | "stage";
  projects: string[];
  onLanding: (c: { open?: string; new?: boolean; library?: boolean; account?: boolean }) => void;
  grab?: (what: string, at?: number | null) => Promise<string | null>;   // a part of the heard record, into this one (hooks/useStems)
  vocal?: (what?: string | null, where?: string | null, from?: string | null) => Promise<string | null>;   // a voice off a record, landed before the drop
  ritual?: { control: (c: VoiceControl) => Promise<string | null>; heard: (words: string) => void };   // the order of work (hooks/useRitual)
};
const RITUAL_TITLE = (c: VoiceControl) => c.source ? `Setting the grid from ${c.source.name}` : c.chop ? "Cutting a chop on the grid" : c.alone ? "The chop alone, on a loop" : c.beat ? "Bringing the beat to the chop" : c.next ? "The next candidate" : c.down ? "Everything down but the seed" : null;
export type Timing = { stt: number; firstWord: number; voiceMs: number };

function resolveSection(song: Song, want?: string) {
  if (!want || want === "current") return null;
  const w = want.toLowerCase().replace(/\s+/g, "");
  return song.sections.find((s) => s.id.toLowerCase() === w) ?? song.sections.find((s) => s.name.toLowerCase().replace(/\s+/g, "") === w) ?? song.sections.find((s) => s.name.toLowerCase().replace(/\s+/g, "").includes(w)) ?? null;
}

export function useConversation(d: Deps) {
  const [work, setWork] = useState<Work[]>([]);
  const [research, setResearch] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [auditioning, setAuditioning] = useState(false);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [brainDown, setBrainDown] = useState<"credits" | "key" | "cap" | null>(null);
  const dRef = useRef(d); dRef.current = d;
  const turnRef = useRef(0);
  const researchRef = useRef<string[]>([]);
  const inflightRef = useRef(new Map<string, string>());
  const auditionRef = useRef<{ timer: number; resolve: (v: "done" | "cut") => void } | null>(null);
  const seq = useRef(0);

  const addWork = useCallback((w: Omit<Work, "id" | "at">) => {
    const id = `w${++seq.current}`;
    setWork((prev) => [...prev.filter((x) => !x.done || Date.now() - x.at < 6000), { ...w, id, at: Date.now() }]);
    return id;
  }, []);
  const doneWork = useCallback((id: string, result?: string) => setWork((prev) => prev.map((w) => (w.id === id ? { ...w, done: true, result, at: Date.now() } : w))), []);
  const progressWork = useCallback((id: string, p: number) => setWork((prev) => prev.map((w) => (w.id === id ? { ...w, progress: p } : w))), []);

  const stopAudition = useCallback(() => {
    const a = auditionRef.current; if (!a) return;
    auditionRef.current = null; window.clearTimeout(a.timer); a.resolve("cut");
    setAuditioning(false);
  }, []);

  // A press on the button, or a stop word: the producer yields the floor at once.
  const interrupt = useCallback((stopMusic = false) => {
    turnRef.current++;
    dRef.current.voice.stop();
    if (auditionRef.current) { stopAudition(); void dRef.current.studio.pause(); }
    else if (stopMusic) void dRef.current.studio.pause();
  }, [stopAudition]);

  const audition = useCallback(async (section?: string, bars = 16) => {
    const s = dRef.current.studio;
    const song = s.getSong();
    if (song.tracks.length === 0) { await dRef.current.voice.speak("There is nothing to play yet. Give me a direction and I will build the first sixteen bars."); return; }
    const sec = resolveSection(song, section);
    const nBars = Math.max(4, Math.min(sec?.bars ?? bars, bars));
    if (sec) await s.jump(sec.id);
    await s.play();
    const secs = (nBars * 4 * 60) / song.bpm;
    setAuditioning(true);
    const id = addWork({ kind: "audition", title: `Playing ${nBars} bars of ${sec?.name ?? "the record"}`, detail: "say stop any time", progress: 0 });
    const t0 = Date.now();
    const tick = window.setInterval(() => progressWork(id, (Date.now() - t0) / (secs * 1000)), 250);
    const result = await new Promise<"done" | "cut">((resolve) => { auditionRef.current = { timer: window.setTimeout(() => resolve("done"), secs * 1000), resolve }; });
    window.clearInterval(tick);
    if (result === "cut") { doneWork(id, "stopped"); return; }
    auditionRef.current = null; setAuditioning(false);
    await s.pause();
    doneWork(id, "played");
    s.append("assistant", "In or out?");
    await dRef.current.voice.speak("In or out?");
  }, [addWork, doneWork, progressWork]);

  const researchWaitRef = useRef<Promise<void> | null>(null);
  const doResearch = useCallback(async (q: string) => {
    if ([...inflightRef.current.values()].includes(`research: ${q}`)) return;
    let release: () => void = () => {};
    researchWaitRef.current = new Promise<void>((r) => { release = r; });
    const id = addWork({ kind: "research", title: `Pulling up ${q}`, detail: "the store first, then the web" });
    inflightRef.current.set(id, `research: ${q}`);
    try {
      const song = dRef.current.studio.getSong();
      const r = await fetch("/api/research" + economyQuery(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, song: { bpm: song.bpm, lane: song.lane } }) }).then((x) => x.json());
      if (r.usage) dRef.current.studio.spend(r.model, r.usage);
      const lines: string[] = r.found ? r.lines : [`${q}: nothing in the store or on the web yet; work from the lane.`];
      researchRef.current = [...researchRef.current, ...lines].slice(-10); setResearch(researchRef.current);
      doneWork(id, r.found ? `${r.kind} found in ${r.ms} ms from the ${r.source}` : "nothing found, working from the lane");
    } catch { doneWork(id, "research failed"); }
    finally { inflightRef.current.delete(id); release(); researchWaitRef.current = null; }
  }, [addWork, doneWork]);

  // The producer going and learning by itself. It picks famous records the studio has never heard,
  // sends them through the same worker one of ours goes through, and keeps only the DNA. It runs for
  // minutes, so it reports as it goes and says what it learned at the end rather than blocking the room.
  const learnRef = useRef<string | null>(null);
  const doLearn = useCallback(async (l: { what?: string | null; count?: number | null }) => {
    const s = dRef.current.studio;
    if (learnRef.current) { const line = "I am already out listening to records. Let me finish this lot first."; s.append("assistant", line); await dRef.current.voice.speak(line); return; }
    const what = (l.what ?? "").trim();
    const id = addWork({ kind: "hear", title: what ? `Learning the biggest ${what}` : "Learning the records it has never heard", detail: "separating and listening, keeping only the DNA" });
    try {
      const started = await fetch("/api/learn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ what, count: l.count ?? 6 }) }).then((x) => x.json());
      if (!started?.ok || !started.started?.length) {
        doneWork(id, started?.note ?? "nothing to learn from");
        const line = started?.note ?? "I have nothing new to go and learn from there yet.";
        s.append("assistant", line); await dRef.current.voice.speak(line); return;
      }
      learnRef.current = started.run;
      const names = started.started.map((x: { artist: string; title: string }) => `${x.artist} - ${x.title}`);
      progressWork(id, 0);
      doneWork(id, `${names.length} records: ${names.slice(0, 3).join(", ")}${names.length > 3 ? " and more" : ""}`);
      const watching = addWork({ kind: "hear", title: `Listening to ${names.length} records`, detail: names[0] });
      // It listens on the worker; this only asks how it is going, and each answer writes what has landed.
      const t0 = Date.now();
      let last: { done: number; failed: number; learned: { title: string; artist: string | null; tempo: number | null }[]; heardInStore: number | null } | null = null;
      const all: { title: string; artist: string | null; tempo: number | null }[] = [];
      while (Date.now() - t0 < 20 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 10000));
        const p = await fetch(`/api/learn?run=${encodeURIComponent(started.run)}`).then((x) => x.json()).catch(() => null);
        if (!p?.ok) continue;
        last = p; all.push(...(p.learned ?? []));
        progressWork(watching, Math.min(1, (p.done + p.failed) / Math.max(1, p.records)));
        if (p.done + p.failed >= p.records) break;
      }
      doneWork(watching, last ? `${all.length} learned, ${last.failed} could not be found` : "gave up waiting");
      const heard = all.length ? all.map((x) => `${x.artist ? `${x.artist} - ` : ""}${x.title}${x.tempo ? ` at ${Math.round(x.tempo)}` : ""}`).join("; ") : "";
      void s.send(all.length
        ? `LEARNED, by going and listening rather than reading tags: ${all.length} record${all.length === 1 ? "" : "s"} now in the store with their own grids, chords, structure and energy (${heard}). The store has heard ${last?.heardInStore ?? "?"} records in total now. Tell the user in one line what came back and one thing it changes about what you can do. Do not change the song.`
        : `The learning run found no records it could hear: ${last?.failed ?? 0} could not be downloaded. Say so in one line and offer to try another genre or year. Do not change the song.`, { hidden: true });
    } catch { doneWork(id, "the learning run failed"); }
    finally { learnRef.current = null; }
  }, [addWork, doneWork, progressWork]);

  const runTask = useCallback(async (task: string) => {
    const id = addWork({ kind: "hands", title: task.length > 88 ? task.slice(0, 85) + "..." : task, detail: "the hands are on it" });
    inflightRef.current.set(id, `hands: ${task.slice(0, 70)}`);
    try {
      // Research the Voice started a moment ago usually lands within a second; the task waits for it (two seconds at most).
      if (researchWaitRef.current) await Promise.race([researchWaitRef.current, new Promise<void>((r) => setTimeout(r, 2000))]);
      const research = researchRef.current.length ? `RESEARCH (from the store, use it):\n${researchRef.current.join("\n")}\n\nTHE ASK: ` : "";
      await dRef.current.studio.send(`${research}${task}`, { hidden: true, task: true });
      doneWork(id, "landed");
    } catch { doneWork(id, "did not land"); }
    finally { inflightRef.current.delete(id); }
  }, [addWork, doneWork]);

  const buildState = useCallback((): VoiceState => {
    const s = dRef.current.studio;
    const pos = s.getPosition();
    return {
      screen: dRef.current.screen, song: s.getSong(), paused: s.paused, taste: tasteSummary(s.getSong().title, 6),
      nowPlaying: pos ? `${pos.section} bar ${pos.barInSection}` : null,
      inflight: [...inflightRef.current.values()], research: researchRef.current, localMoves: [], reports: [],
      feel: feelFromFacts(s.facts)?.line ?? null,
      projects: dRef.current.projects, messages: s.messages.slice(-8),
    };
  }, []);

  const doGrab = useCallback(async (g: { what: string; at?: number | null }) => {
    const s = dRef.current.studio;
    const where = g.at != null ? ` at ${Math.floor(g.at / 60)}:${String(Math.floor(g.at % 60)).padStart(2, "0")}` : "";
    const id = addWork({ kind: "hands", title: `Grabbing the ${g.what}${where}`, detail: "cut at the onset, tuned to the root, no model" });
    try {
      const landed = dRef.current.grab ? await dRef.current.grab(g.what, g.at ?? null) : null;
      const line = landed ? `Grabbed the ${g.what}${where}. It is on its own track, tuned to the root.` : "I have no heard record to grab from yet. Pull one in first and I will cut it.";
      doneWork(id, landed ? "landed" : "nothing to grab from");
      s.append("assistant", line); await dRef.current.voice.speak(line);
    } catch { doneWork(id, "did not land"); }
  }, [addWork, doneWork]);

  // A voice off a record: the studio isolates it, finds the phrase, tunes it and lands it. The Hands
  // never touch it, but they are told what happened so the next move is made knowing it is there.
  const doVocal = useCallback(async (v: { what?: string | null; from?: string | null; where?: string | null }) => {
    const s = dRef.current.studio;
    const id = addWork({ kind: "record", title: v.from ? `Isolating the voice on ${v.from}` : "Isolating the voice", detail: v.what ?? undefined });
    try {
      const report = await dRef.current.vocal?.(v.what ?? null, v.where ?? null, v.from ?? null);
      if (report === null) { doneWork(id, "pulling the record in first"); return; }
      doneWork(id, report ? "landed" : "nothing to take");
      if (report) void s.send(report, { hidden: true });
      else { const line = "I have no record with a voice on it yet. Name one and I will pull it in."; s.append("assistant", line); await dRef.current.voice.speak(line); }
    } catch { doneWork(id, "did not land"); }
  }, [addWork, doneWork]);

  // The order of work: the studio does it with no Hands and speaks the result itself; the card shows it happening.
  const doRitual = useCallback(async (c: VoiceControl, title: string) => {
    const id = addWork({ kind: c.source ? "research" : "hands", title, detail: "the studio, no model" });
    try { const line = await dRef.current.ritual?.control(c); doneWork(id, line ? "landed" : "nothing to do"); } catch { doneWork(id, "did not land"); }
  }, [addWork, doneWork]);

  const act = useCallback(async (c: VoiceControl) => {
    const s = dRef.current.studio;
    if (c.stop) { interrupt(true); return; }
    if (c.library) { dRef.current.onLanding({ library: true }); return; }
    if (c.account) { dRef.current.onLanding({ account: true }); return; }
    if (c.grab?.what) { void doGrab(c.grab); }
    if (c.vocal) { void doVocal(c.vocal); }
    if (c.learn) { void doLearn(c.learn); }
    if (c.research) void doResearch(c.research);
    if (dRef.current.screen !== "stage") { if (c.open || c.new) dRef.current.onLanding({ open: c.open, new: c.new }); return; }
    const ritual = RITUAL_TITLE(c);
    if (ritual) { void doRitual(c, ritual); return; }
    if (c.task) void runTask(c.task);
    else if (c.audition) void audition(c.audition.section, c.audition.bars);
    else if (c.open || c.new) dRef.current.onLanding({ open: c.open, new: c.new });
    void s;
  }, [audition, doResearch, doGrab, doVocal, doLearn, doRitual, interrupt, runTask]);

  // The entry point: what you said, and how long the engine took to commit it.
  const hear = useCallback(async (text: string, sttMs: number) => {
    const s = dRef.current.studio;
    const t = text.trim(); if (!t) return;
    dRef.current.ritual?.heard(t);   // a pulled down listen comes back on the next word, and the words judge the newest element
    const turn = ++turnRef.current;
    if (dRef.current.screen === "stage" && (await s.tryLocal(t))) { setTiming({ stt: sttMs, firstWord: 0, voiceMs: 0 }); return; }
    s.append("user", t);
    setThinking(true);
    const t0 = performance.now();
    let firstWord = 0, finalSay = "", control: VoiceControl = {};
    try {
      const r = await fetch("/api/voice" + economyQuery(), { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ state: buildState(), utterance: t }) });
      if (!r.body) throw new Error("no body");
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
          let o: { type?: string; text?: string; say?: string; control?: VoiceControl; usage?: unknown; model?: string; ms?: number; down?: "credits" | "key" | "cap" | null }; try { o = JSON.parse(line); } catch { continue; }
          if (o.type === "say" && o.text && turn === turnRef.current) { if (!firstWord) firstWord = Math.round(performance.now() - t0); void dRef.current.voice.speak(o.text); }
          else if (o.type === "final") {
            finalSay = o.say ?? ""; control = o.control ?? {}; if (o.usage) s.spend(o.model, o.usage);
            setBrainDown(o.down ?? null);
            const tm = { stt: sttMs, firstWord, voiceMs: o.ms ?? Math.round(performance.now() - t0) }; setTiming(tm);
            if (/[?&](e2e|voice)=1/.test(window.location.search)) { const w = window as unknown as { __voice?: unknown[] }; (w.__voice ??= []).push({ ask: t, say: finalSay, control, ...tm, wall: Math.round(performance.now() - t0) }); }
          }
        }
      }
      if (finalSay) s.append("assistant", finalSay);
      if (turn !== turnRef.current) return;   // they cut in while this was still arriving: say nothing more, do nothing
      await act(control);
    } catch {
      const line = "Connection wobbled. Say that again?";
      s.append("assistant", line); void dRef.current.voice.speak(line);
    } finally { setThinking(false); }
  }, [act, buildState]);

  return { hear, interrupt, audition, work, research, thinking, auditioning, timing, brainDown };
}
