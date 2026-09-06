"use client";
// Runs the critic in the background after the ears finish. Recommendations only.
// One call in flight at a time; if the song moves on while the critic is thinking,
// the newest state gets its own pass right after, so a note is never lost.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Song } from "@/lib/song";
import type { MusicFacts } from "@/lib/ears";
import { loadNotes, mergeNotes, setNoteStatus, openNotes, type CriticNote } from "@/lib/critic";
import { tasteSummary, logMove, setVerdict } from "@/lib/taste";

type Deps = { song: Song; facts: MusicFacts | null; reference: { name: string; facts: MusicFacts } | null; paused: boolean; send: (t: string) => Promise<void>; started: boolean };

export function useCritic(d: Deps) {
  const [notes, setNotes] = useState<CriticNote[]>([]);
  const [headline, setHeadline] = useState("");
  const [thinking, setThinking] = useState(false);
  const lastKey = useRef("");
  const inflight = useRef(false);
  const latest = useRef(d); latest.current = d;
  const timer = useRef<number | null>(null);
  useEffect(() => { setNotes(loadNotes()); }, []);

  const keyOf = (x: Deps) => (x.facts ? `${x.song.title}|${x.facts.loudness.integrated}|${x.facts.spectrum.centroidHz}|${x.song.tracks.length}|${x.reference?.name ?? ""}` : "");

  const run = useCallback(async () => {
    const x = latest.current;
    if (!x.started || !x.facts || x.paused || inflight.current) return;
    const key = keyOf(x);
    if (!key || key === lastKey.current) return;
    lastKey.current = key;
    inflight.current = true; setThinking(true);
    try {
      const ears = await import("@/lib/ears");
      const r = await fetch("/api/critic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        song: x.song, facts: ears.factsForBrain(x.facts), reference: x.reference ? { name: x.reference.name, facts: ears.factsForBrain(x.reference.facts) } : null,
        deltas: x.reference ? ears.compare(x.facts, x.reference.facts).deltas : null,
        dismissed: loadNotes().filter((n) => n.status === "dismissed").slice(-12).map((n) => n.what), taste: tasteSummary(x.song.title),
      }) }).then((res) => res.json());
      if (r?.headline) setHeadline(r.headline);
      if (Array.isArray(r?.notes)) setNotes(mergeNotes(r.notes.map((n: CriticNote) => ({ ...n, status: "open", at: Date.now() }))));
    } catch { /* the critic is optional */ }
    finally {
      inflight.current = false; setThinking(false);
      // The song moved while we listened: give the newest version its pass too.
      if (keyOf(latest.current) !== lastKey.current) { timer.current = window.setTimeout(() => void run(), 400); }
    }
  }, []);

  useEffect(() => {
    if (!d.started || !d.facts || d.paused) return;
    if (keyOf(d) === lastKey.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void run(), 1200);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [d.started, d.facts, d.paused, d.song, d.reference, run]);

  // The user's choice: apply goes through the producer (spoken, logged); dismiss is remembered.
  const apply = useCallback((n: CriticNote) => {
    setNotes(setNoteStatus(n.id, "applied"));
    const entry = logMove({ title: d.song.title, said: `critic ${n.id}`, move: n.fix }); setVerdict(entry.id, "liked");
    void d.send(`Yes, do this: ${n.fix}${n.section ? ` (in ${n.section})` : ""}. Reason: ${n.why}`);
  }, [d]);
  const dismiss = useCallback((n: CriticNote) => {
    setNotes(setNoteStatus(n.id, "dismissed"));
    const entry = logMove({ title: d.song.title, said: `critic ${n.id}`, move: n.what }); setVerdict(entry.id, "killed");
  }, [d]);

  return { notes: notes.filter((n) => n.status === "open"), all: notes, headline, thinking, apply, dismiss, open: openNotes };
}
