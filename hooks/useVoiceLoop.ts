"use client";
// The conversation loop: mic open whenever the producer is not speaking,
// queued utterances, spoken replies, live interim transcription.
import { useCallback, useEffect, useRef, useState } from "react";
import { makeRecognizer, type RecognitionLike } from "@/lib/voice/recognition";
import { speak as ttsSpeak, stop as ttsStop } from "@/lib/voice/tts";

export function useVoiceLoop(onUtterance: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const recRef = useRef<RecognitionLike | null>(null);
  const sessionRef = useRef(false);
  const speakingRef = useRef(false);
  const onUtteranceRef = useRef(onUtterance);
  useEffect(() => { onUtteranceRef.current = onUtterance; }, [onUtterance]);

  const startListening = useCallback(() => {
    if (!sessionRef.current || speakingRef.current) return;
    try { recRef.current?.abort?.(); } catch {}
    const rec = makeRecognizer({
      onInterim: setInterim,
      onFinal: (t) => onUtteranceRef.current(t),
      onEnd: () => { setListening(false); if (sessionRef.current && !speakingRef.current) setTimeout(startListening, 300); },
    });
    if (!rec) return;
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch {}
  }, []);

  const stopListening = useCallback(() => {
    try { recRef.current?.abort?.(); recRef.current?.stop(); } catch {}
    setListening(false);
  }, []);

  const say = useCallback((text: string) => {
    speakingRef.current = true; setSpeaking(true);
    stopListening();
    void ttsSpeak(text, () => { speakingRef.current = false; setSpeaking(false); startListening(); });
  }, [startListening, stopListening]);

  const begin = useCallback(() => { sessionRef.current = true; startListening(); }, [startListening]);
  const end = useCallback(() => { sessionRef.current = false; ttsStop(); stopListening(); }, [stopListening]);
  const hush = useCallback(() => { ttsStop(); speakingRef.current = false; setSpeaking(false); startListening(); }, [startListening]);

  return { listening, interim, speaking, say, begin, end, hush, startListening, stopListening };
}
