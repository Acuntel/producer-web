"use client";
// Initiative: a producer in the room does not wait forever, but quiet is not a cue. The producer we watched worked
// through six minutes of talk with the loop running, so after six quiet minutes of playing, once every six minutes
// at most, it offers one A/B or one call-out, and never inside another question's 30 s (lib/ritual/questions.ts).
import { useEffect, useRef, type MutableRefObject } from "react";
import type { Engine } from "@/lib/engine";
import type { Song } from "@/lib/song";
import { mayAsk, askClock } from "@/lib/ritual/questions";

type Deps = { started: boolean; paused: boolean; rollout: unknown; send: (t: string, o: { hidden: boolean }) => unknown; busy: MutableRefObject<boolean>; song: MutableRefObject<Song>; engine: MutableRefObject<Engine | null>; lastUtterance: MutableRefObject<number> };

export function useInitiative(d: Deps) {
  const lastRef = useRef(0);
  const { started, paused, rollout, send, busy, song, engine, lastUtterance } = d;
  useEffect(() => {
    if (!started || paused) return;
    const t = window.setInterval(() => {
      const now = Date.now();
      if (busy.current || rollout || now - lastUtterance.current < 360000 || now - lastRef.current < 360000 || song.current.tracks.length === 0 || !mayAsk(now)) return;
      lastRef.current = now; askClock.last = now;
      const pos = engine.current?.getPosition();
      void send(`PRODUCER INITIATIVE: the user has been listening quietly for six minutes${pos ? ` (now in the ${pos.section}, bar ${pos.barInSection + 1})` : ""}. Take one initiative a real producer would: EITHER offer an A/B on one specific element (return ops for A and alternative for B, say "A or B?") OR pause and point at one bar with one proposed fix as a question. One sentence, no lecture, nothing else changes.`, { hidden: true });
    }, 15000);
    return () => window.clearInterval(t);
  }, [started, paused, rollout, send, busy, song, engine, lastUtterance]);
}
