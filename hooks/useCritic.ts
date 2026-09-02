"use client";
// Runs the critic in the background after the ears finish. Recommendations only.
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
  useEffect(() => { setNotes(loadNotes()); }, []);

  useEffect(() => {
    if (!d.started || !d.facts || d.paused || inflight.current) return;
    const key = `${d.song.title}|${d.facts.loudness.integrated}|${d.facts.spectrum.centroidHz}|${d.song.tracks.length}|${d.reference?.name ?? ""}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    inflight.current = true; setThinking(true);
    const t = window.setTimeout(async () => {
      try {
        const ears = await import("@/lib/ears");
        const r = await fetch("/api/critic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          song: d.song, facts: ears.factsForBrain(d.facts!), reference: d.reference ? { name: d.reference.name, facts: ears.factsForBrain(d.reference.facts) } : null,
          deltas: d.reference ? ears.compare(d.facts!, d.reference.facts).deltas : null,
          dismissed: loadNotes().filter((n) => n.status === "dismissed").slice(-12).map((n) => n.what), taste: tasteSummary(d.song.title),
        }) }).then((x) => x.json());
        if (r?.headline) setHeadline(r.headline);
        if (Array.isArray(r?.notes)) setNotes(mergeNotes(r.notes.map((n: CriticNote) => ({ ...n, status: "open", at: Date.now() }))));
      } catch { /* the critic is optional */ }
      finally { inflight.current = false; setThinking(false); }
    }, 1200);
    return () => window.clearTimeout(t);
  }, [d.started, d.facts, d.paused, d.song, d.reference]);

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
