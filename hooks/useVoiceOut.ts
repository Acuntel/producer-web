"use client";
// The producer's voice, streamed. Every utterance is split into sentences; each sentence
// is fetched as raw PCM from /api/speak and scheduled straight into Web Audio as the
// bytes arrive, so speech starts as soon as the first sentence closes. The next
// sentence is fetched while the current one plays. stop() is barge-in.
import { useCallback, useEffect, useRef, useState } from "react";

const RATE = 24000;
type Deps = { duck?: (on: boolean) => void; playing?: () => boolean };
type Job = { id: number; text: string; resolve: () => void };
// The first word of an utterance is out: the stage lets the record join underneath it, and the probe times it.
const firstWord = () => { performance.mark("producer:voice"); window.dispatchEvent(new Event("producer:voice")); };

function sentences(text: string): string[] {
  const out: string[] = [];
  const re = /[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) { const s = m[0].trim(); if (s) out.push(s); }
  return out.length ? out : [text.trim()];
}

export function useVoiceOut(d: Deps = {}) {
  const [speaking, setSpeaking] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<Job[]>([]);
  const runningRef = useRef(false);
  const genRef = useRef(0);          // bumped by stop(): everything older is dropped
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const abortsRef = useRef<AbortController[]>([]);
  const nextAtRef = useRef(0);
  const dRef = useRef(d); dRef.current = d;
  const voiceOk = useRef<boolean | null>(null);
  const seq = useRef(0);

  // The voice sums with the record at the device. The record now peaks at -1 dBFS, so the voice gets headroom
  // (-6 dB) and a limiter at -8 dBFS: together they never reach full scale, where the sum used to clip.
  // A playback-sized buffer, like the desk, so the voice does not crackle when the laptop is busy.
  const outRef = useRef<AudioNode | null>(null);
  const ctx = () => { if (!ctxRef.current) ctxRef.current = new AudioContext({ latencyHint: "playback" }); if (ctxRef.current.state === "suspended") void ctxRef.current.resume().catch(() => {}); return ctxRef.current; };
  const bus = (c: AudioContext) => {
    if (outRef.current) return outRef.current;
    const g = c.createGain(); g.gain.value = 0.5;
    const lim = c.createDynamicsCompressor(); lim.threshold.value = -8; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
    g.connect(lim); lim.connect(c.destination);
    return (outRef.current = g);
  };

  // Fetch one sentence as PCM and schedule it; resolves when the audio has finished playing.
  const playSentence = useCallback(async (text: string, gen: number): Promise<boolean> => {
    if (voiceOk.current === false) return false;
    if (typeof window !== "undefined" && /[?&]voice=local/.test(window.location.search)) return false;   // force the free voice (harness, or a user's choice)
    const ac = new AbortController(); abortsRef.current.push(ac);
    try {
      const r = await fetch("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, format: "pcm" }), signal: ac.signal });
      if (!r.ok || !r.body) { if (r.status === 503) voiceOk.current = false; return false; }
      voiceOk.current = true;
      const c = ctx();
      const reader = r.body.getReader();
      let carry = new Uint8Array(0);
      let started = false;
      let lastEnd = 0;
      const schedule = (bytes: Uint8Array) => {
        const n = Math.floor(bytes.length / 2); if (n === 0) return;
        const buf = c.createBuffer(1, n, RATE); const ch = buf.getChannelData(0);
        const dv = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
        for (let i = 0; i < n; i++) ch[i] = dv.getInt16(i * 2, true) / 32768;
        const src = c.createBufferSource(); src.buffer = buf; src.connect(bus(c));
        const at = Math.max(c.currentTime + (started ? 0 : 0.05), nextAtRef.current);
        src.start(at); nextAtRef.current = at + buf.duration; lastEnd = nextAtRef.current;
        if (!started) firstWord();
        started = true;
        sourcesRef.current.push(src); src.onended = () => { sourcesRef.current = sourcesRef.current.filter((s) => s !== src); };
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (gen !== genRef.current) { try { await reader.cancel(); } catch {} return true; }
        if (done) break;
        if (!value) continue;
        const merged = new Uint8Array(carry.length + value.length); merged.set(carry); merged.set(value, carry.length);
        const usable = merged.length - (merged.length % 2);
        // Schedule in slices of about 100 ms so playback starts before the download ends.
        if (usable >= 4800 || (carry.length && usable >= 2)) { schedule(merged.subarray(0, usable)); carry = merged.subarray(usable); }
        else carry = merged;
      }
      if (carry.length >= 2) schedule(carry.subarray(0, carry.length - (carry.length % 2)));
      if (!started) return false;
      const wait = Math.max(0, (lastEnd - c.currentTime) * 1000);
      await new Promise((res) => setTimeout(res, wait));
      return true;
    } catch { return gen !== genRef.current; }
    finally { abortsRef.current = abortsRef.current.filter((a) => a !== ac); }
  }, []);

  // No ElevenLabs key: the free voice (Kokoro in the browser), then the browser's own voice as the last resort.
  const localSpeak = useCallback(async (text: string, gen: number): Promise<boolean> => {
    try {
      const { speakLocal } = await import("@/lib/voice/kokoro");
      const out = await speakLocal(text);
      if (!out || gen !== genRef.current) return !!out;
      const c = ctx();
      const buf = c.createBuffer(1, out.samples.length, out.sampleRate); buf.getChannelData(0).set(out.samples);
      const src = c.createBufferSource(); src.buffer = buf; src.connect(bus(c));
      const at = Math.max(c.currentTime + 0.02, nextAtRef.current); src.start(at); nextAtRef.current = at + buf.duration; firstWord();
      sourcesRef.current.push(src); src.onended = () => { sourcesRef.current = sourcesRef.current.filter((s) => s !== src); };
      await new Promise((res) => setTimeout(res, Math.max(0, (nextAtRef.current - c.currentTime) * 1000)));
      return true;
    } catch (e) { console.warn("kokoro: local voice failed", e instanceof Error ? e.message : e); return false; }
  }, []);
  const browserSpeak = (text: string) => new Promise<void>((res) => {
    if (typeof speechSynthesis === "undefined") { res(); return; }
    // Under a test harness the system voice stays silent: it speaks through macOS, which no browser mute reaches,
    // so every harness run used to talk out of the laptop. The line still takes its time, so flows that wait on it hold.
    if (/[?&]e2e=1/.test(window.location.search)) { firstWord(); window.setTimeout(res, Math.min(4000, 400 + text.length * 40)); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.rate = 1.05; u.onstart = firstWord; u.onend = () => res(); u.onerror = () => res();
    speechSynthesis.speak(u);
  });

  const pump = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setSpeaking(true); dRef.current.duck?.(true);
    try {
      while (queueRef.current.length) {
        const job = queueRef.current.shift()!;
        const gen = genRef.current;
        setCurrent(job.text);
        const parts = sentences(job.text);
        // Prefetch the next sentence while the current one plays: the queue hides the round trip.
        let i = 0;
        while (i < parts.length && gen === genRef.current) {
          const ok = await playSentence(parts[i], gen);
          if (!ok && gen === genRef.current) {
            // The free in-browser voice runs its model on the page's own thread (150 to 800 ms blocks), which is
            // the thread the record's scheduler needs: under a playing record it would crackle the music. So
            // while the record plays, a failed voice falls back to the browser's own speech, which runs outside.
            const forced = typeof window !== "undefined" && /[?&]voice=local/.test(window.location.search);
            const local = forced || !dRef.current.playing?.() ? await localSpeak(parts[i], gen) : false;
            if (!local && gen === genRef.current) { await browserSpeak(parts.slice(i).join(" ")); break; }
          }
          i++;
        }
        job.resolve();
      }
    } finally {
      runningRef.current = false; setSpeaking(false); setCurrent(null); dRef.current.duck?.(false);
    }
  }, [playSentence, localSpeak]);

  const speak = useCallback((text: string): Promise<void> => {
    const t = text.trim();
    if (!t) return Promise.resolve();
    return new Promise<void>((resolve) => { queueRef.current.push({ id: ++seq.current, text: t, resolve }); void pump(); });
  }, [pump]);

  const stop = useCallback(() => {
    genRef.current++;
    for (const a of abortsRef.current.splice(0)) a.abort();
    for (const s of sourcesRef.current.splice(0)) { try { s.stop(); } catch {} }
    nextAtRef.current = 0;
    for (const j of queueRef.current.splice(0)) j.resolve();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }, []);

  useEffect(() => () => { stop(); void ctxRef.current?.close().catch(() => {}); }, [stop]);

  return { speak, stop, speaking, current, warm: () => { ctx(); } };
}
