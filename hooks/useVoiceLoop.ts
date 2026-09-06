"use client";
// The conversation loop: the mic stays open even while the producer speaks, so
// the user can cut in (barge-in). Echo of the producer's own voice is filtered
// by comparing what was heard with what is being said. Queued utterances,
// spoken replies, live interim transcription.
import { useCallback, useEffect, useRef, useState } from "react";
import { makeRecognizer, type RecognitionLike } from "@/lib/voice/recognition";
import { speak as ttsSpeak, stop as ttsStop } from "@/lib/voice/tts";

const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
// Heard text that is mostly the producer's own sentence is echo, not the user.
export function looksLikeEcho(heard: string, spoken: string | null): boolean {
  if (!spoken) return false;
  const h = words(heard); if (h.length === 0) return true;
  const s = new Set(words(spoken));
  const overlap = h.filter((w) => s.has(w)).length / h.length;
  return overlap >= 0.6;
}

export function useVoiceLoop(onUtterance: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const recRef = useRef<RecognitionLike | null>(null);
  const sessionRef = useRef(false);
  const speakingRef = useRef(false);
  const spokenRef = useRef<string | null>(null);
  const onUtteranceRef = useRef(onUtterance);
  useEffect(() => { onUtteranceRef.current = onUtterance; }, [onUtterance]);

  const startListening = useCallback(() => {
    if (!sessionRef.current || recRef.current) return;
    const rec = makeRecognizer({
      onInterim: (t) => { if (!(speakingRef.current && looksLikeEcho(t, spokenRef.current))) setInterim(t); },
      onFinal: (t) => {
        if (speakingRef.current) {
          if (looksLikeEcho(t, spokenRef.current)) return;   // our own voice coming back through the speakers
          ttsStop(); speakingRef.current = false; setSpeaking(false);   // the user cut in: stop talking, listen
        }
        onUtteranceRef.current(t);
      },
      onEnd: () => { recRef.current = null; setListening(false); if (sessionRef.current) setTimeout(startListening, 300); },
    });
    if (!rec) return;
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { recRef.current = null; }
  }, []);

  const stopListening = useCallback(() => {
    const rec = recRef.current; recRef.current = null;
    try { rec?.abort?.(); rec?.stop(); } catch {}
    setListening(false);
  }, []);

  const say = useCallback((text: string) => {
    speakingRef.current = true; spokenRef.current = text; setSpeaking(true); setInterim("");
    void ttsSpeak(text, () => { speakingRef.current = false; setSpeaking(false); spokenRef.current = null; if (sessionRef.current && !recRef.current) startListening(); });
    if (sessionRef.current && !recRef.current) startListening();
  }, [startListening]);

  const begin = useCallback(() => { sessionRef.current = true; startListening(); }, [startListening]);
  const end = useCallback(() => { sessionRef.current = false; ttsStop(); stopListening(); }, [stopListening]);
  const hush = useCallback(() => { ttsStop(); speakingRef.current = false; setSpeaking(false); spokenRef.current = null; if (!recRef.current) startListening(); }, [startListening]);

  return { listening, interim, speaking, say, begin, end, hush, startListening, stopListening };
}
