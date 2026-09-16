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
  screen: "landing" | "stage";
  projects: string[];
  onLanding: (c: { open?: string; new?: boolean }) => void;
};
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
      const r = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, song: { bpm: song.bpm, lane: song.lane } }) }).then((x) => x.json());
      if (r.usage) dRef.current.studio.spend(r.model, r.usage);
      const lines: string[] = r.found ? r.lines : [`${q}: nothing in the store or on the web yet; work from the lane.`];
      researchRef.current = [...researchRef.current, ...lines].slice(-10); setResearch(researchRef.current);
      doneWork(id, r.found ? `${r.kind} found in ${r.ms} ms from the ${r.source}` : "nothing found, working from the lane");
    } catch { doneWork(id, "research failed"); }
    finally { inflightRef.current.delete(id); release(); researchWaitRef.current = null; }
  }, [addWork, doneWork]);

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

  const act = useCallback(async (c: VoiceControl) => {
    const s = dRef.current.studio;
    if (c.stop) { interrupt(true); return; }
    if (c.research) void doResearch(c.research);
    if (dRef.current.screen === "landing") { if (c.open || c.new) dRef.current.onLanding({ open: c.open, new: c.new }); return; }
    if (c.task) void runTask(c.task);
    else if (c.audition) void audition(c.audition.section, c.audition.bars);
    else if (c.open || c.new) dRef.current.onLanding({ open: c.open, new: c.new });
    void s;
  }, [audition, doResearch, interrupt, runTask]);

  // The entry point: what you said, and how long the engine took to commit it.
  const hear = useCallback(async (text: string, sttMs: number) => {
    const s = dRef.current.studio;
    const t = text.trim(); if (!t) return;
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
