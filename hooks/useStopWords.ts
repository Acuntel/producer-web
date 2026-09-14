"use client";
// While the producer has the floor (talking, or playing an audition), a small local
// recognizer listens for the stop words only. "Stop", "wait", "hold on", "pause",
// "producer": any of them hands the floor back. Nothing else it hears goes anywhere.
import { useEffect, useRef } from "react";
import { makeRecognizer, type RecognitionLike } from "@/lib/voice/recognition";

const STOP = /\b(stop|wait|hold on|hold up|pause|producer|okay stop|that's enough|enough)\b/i;

export function useStopWords(active: boolean, onStop: (heard: string) => void) {
  const recRef = useRef<RecognitionLike | null>(null);
  const cbRef = useRef(onStop); cbRef.current = onStop;

  useEffect(() => {
    if (!active) { const r = recRef.current; recRef.current = null; try { r?.abort?.(); r?.stop(); } catch {} return; }
    let alive = true;
    const start = () => {
      if (!alive || recRef.current) return;
      const rec = makeRecognizer({
        onInterim: (t) => { if (STOP.test(t)) { cbRef.current(t); } },
        onFinal: (t) => { if (STOP.test(t)) cbRef.current(t); },
        onEnd: () => { recRef.current = null; if (alive) setTimeout(start, 250); },
        onError: () => { /* a quiet room or a blocked mic: nothing to do */ },
      });
      if (!rec) return;
      recRef.current = rec;
      try { rec.start(); } catch { recRef.current = null; }
    };
    start();
    return () => { alive = false; const r = recRef.current; recRef.current = null; try { r?.abort?.(); r?.stop(); } catch {} };
  }, [active]);
}
