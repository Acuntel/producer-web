"use client";
// Runs the critic in the background once the record has sat still. Recommendations only.
// It is keyed on the record's structure (its parts, sections and arrangement, not a fader or a
// re-listen), and it waits for 20 s with no change, so a session of quick moves is one critic
// pass at the end, not a paid call and a re-render per move. One call in flight at a time; if the
// structure moves on while it thinks, the newest version gets its pass after the next quiet 20 s.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Song } from "@/lib/song";
import type { MusicFacts } from "@/lib/ears";
import { loadNotes, mergeNotes, setNoteStatus, openNotes, type CriticNote } from "@/lib/critic";
import { tasteSummary, logMove, setVerdict } from "@/lib/taste";
import { economyQuery } from "@/lib/brain/stream";

/** How long the record must sit with no structural change before the critic listens. */
export const CRITIC_IDLE_MS = 20000;

/** The record's shape: which parts play what, in which sections, in what order. A fader, a mute or a
 *  re-listen is not a new record to critique; a new part, a new pattern or a new section is. */
export function structureKey(song: Song, reference?: string | null): string {
  const tracks = song.tracks.map((t) => [t.id, t.role, t.notes.length, Object.keys(t.patterns ?? {}).length, t.clip?.clipId ?? t.clip?.sampleId ?? ""]);
  const sections = song.sections.map((s) => [s.id, s.bars, (s.active ?? []).length]);
  return JSON.stringify([song.title, song.bpm, song.key, tracks, sections, song.arrangement, reference ?? ""]);
}

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

  const keyOf = (x: Deps) => (x.facts ? structureKey(x.song, x.reference?.name) : "");

  const run = useCallback(async () => {
    const x = latest.current;
    if (!x.started || !x.facts || x.paused || inflight.current) return;
    const key = keyOf(x);
    if (!key || key === lastKey.current) return;
    lastKey.current = key;
    inflight.current = true; setThinking(true);
    try {
      const ears = await import("@/lib/ears");
      const r = await fetch("/api/critic" + economyQuery(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
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
      if (keyOf(latest.current) !== lastKey.current) { timer.current = window.setTimeout(() => void run(), CRITIC_IDLE_MS); }
    }
  }, []);

  // Every change to the structure restarts the quiet clock; a new measurement of the same structure does not.
  const key = keyOf(d);
  useEffect(() => {
    if (!d.started || !key || d.paused || key === lastKey.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void run(), CRITIC_IDLE_MS);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [d.started, d.paused, key, run]);

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
