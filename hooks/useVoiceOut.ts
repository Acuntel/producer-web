"use client";
// The producer's voice, streamed into the studio's own context. Every line is split into sentences;
// each is fetched as raw PCM from /api/speak, and the next sentence's fetch starts while this one plays
// (pipelined), so a round trip never becomes a hole. A sentence starts only once a short jitter buffer
// has arrived, and its chunks are scheduled back to back. A sentence fetched ahead (the greeting's first)
// plays from memory at the exact audio time it is asked for. stop() is barge-in.
import { useCallback, useEffect, useRef, useState } from "react";
import { studioContext } from "@/lib/audio/studio";
import { voiceBus } from "@/lib/audio/voiceBus";
import { sentences, pcmToFloat } from "@/lib/voice/sentences";

const RATE = 24000;
const JITTER_SEC = 0.12;   // audio a sentence gathers before it starts, so a slow chunk is not a hole
const CHUNK_BYTES = 4800;  // about 100 ms of 24 kHz 16-bit PCM
type Deps = { duck?: (on: boolean) => void; playing?: () => boolean };
type Job = { id: number; text: string; at?: number; resolve: () => void };
type Played = { text: string; at: number; end: number };
const e2e = () => typeof window !== "undefined" && /[?&](e2e|voice)=1/.test(window.location.search);
// The first word of a line is out (at audio time `at`): the probe times it from the mark.
const firstWord = (c: BaseAudioContext, at: number) => {
  performance.mark("producer:voice", { startTime: performance.now() + Math.max(0, at - c.currentTime) * 1000 });
  window.dispatchEvent(new Event("producer:voice"));
};

export function useVoiceOut(d: Deps = {}) {
  const [speaking, setSpeaking] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const queueRef = useRef<Job[]>([]);
  const runningRef = useRef(false);
  const genRef = useRef(0);          // bumped by stop(): everything older is dropped
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const abortsRef = useRef<AbortController[]>([]);
  const nextAtRef = useRef(0);
  const dRef = useRef(d); dRef.current = d;
  const voiceOk = useRef<boolean | null>(null);
  const seq = useRef(0);
  const ahead = useRef(new Map<string, Promise<AudioBuffer | null>>());

  // The studio's own context (lib/audio/studio.ts): one clock and one device buffer for the voice and the record.
  const ctx = () => { const c = studioContext(); if (c.state === "suspended") void c.resume().catch(() => {}); return c; };
  const forced = () => typeof window !== "undefined" && /[?&]voice=local/.test(window.location.search);

  const play = useCallback((c: AudioContext, samples: Float32Array, at: number) => {
    const buf = c.createBuffer(1, samples.length, RATE); buf.getChannelData(0).set(samples);
    const src = c.createBufferSource(); src.buffer = buf; src.connect(voiceBus(c)); src.start(at);
    sourcesRef.current.push(src); src.onended = () => { sourcesRef.current = sourcesRef.current.filter((s) => s !== src); };
    return at + buf.duration;
  }, []);

  const open = useCallback((text: string): Promise<Response | null> => {
    if (voiceOk.current === false || forced()) return Promise.resolve(null);
    const ac = new AbortController(); abortsRef.current.push(ac);
    return fetch("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, format: "pcm" }), signal: ac.signal })
      .then((r) => { if (!r.ok || !r.body) { if (r.status === 503) voiceOk.current = false; return null; } voiceOk.current = true; return r; })
      .catch(() => null).finally(() => { abortsRef.current = abortsRef.current.filter((a) => a !== ac); });
  }, []);

  /** Fetch a line's sentences now and keep their audio, so saying it later has no round trip at all (the greeting). */
  const prefetch = useCallback((text: string): Promise<unknown> => Promise.all(sentences(text).map((t) => keep(t))), []);
  const keep = (t: string): Promise<AudioBuffer | null> => {
    const have = ahead.current.get(t); if (have) return have;
    const p = open(t).then(async (r) => {
      if (!r) return null;
      const bytes = new Uint8Array(await r.arrayBuffer()); if (bytes.length < 2) return null;
      const f = pcmToFloat(bytes); const c = studioContext(); const b = c.createBuffer(1, f.length, RATE); b.getChannelData(0).set(f); return b;
    }).catch(() => null);
    ahead.current.set(t, p);
    if (ahead.current.size > 12) ahead.current.delete(ahead.current.keys().next().value as string);
    return p;
  };

  // One sentence onto the audio clock after whatever is already scheduled. Resolves once all of it is
  // scheduled (not played), true when it came from the voice route.
  const playSentence = useCallback(async (text: string, fetched: Promise<Response | null>, gen: number, at: number | undefined, first: boolean, log: Played[]): Promise<boolean> => {
    const c = ctx();
    let res = fetched;
    const kept = ahead.current.get(text); const buf = kept ? await kept : null;
    if (kept && !buf) { ahead.current.delete(text); res = open(text); }   // the fetch ahead failed: ask again now
    if (buf) {
      const start = Math.max(at ?? c.currentTime + 0.03, nextAtRef.current, c.currentTime + 0.01);
      const src = c.createBufferSource(); src.buffer = buf; src.connect(voiceBus(c)); src.start(start);
      sourcesRef.current.push(src); src.onended = () => { sourcesRef.current = sourcesRef.current.filter((s) => s !== src); };
      nextAtRef.current = start + buf.duration; log.push({ text, at: start, end: nextAtRef.current });
      if (first) firstWord(c, start);
      return true;
    }
    const r = await res; if (!r || gen !== genRef.current) return gen !== genRef.current;
    const reader = r.body!.getReader();
    let held: Uint8Array[] = []; let heldBytes = 0; let started = false; let start = 0;
    const flush = () => {
      if (!heldBytes) return;
      const all = new Uint8Array(heldBytes - (heldBytes % 2)); let o = 0;
      for (const h of held) { const n = Math.min(h.length, all.length - o); all.set(h.subarray(0, n), o); o += n; }
      const rest = heldBytes % 2 ? held[held.length - 1].subarray(held[held.length - 1].length - 1) : null;
      held = rest ? [rest] : []; heldBytes = rest ? 1 : 0;
      // A late chunk (the clock passed where it should have gone) starts a short re-buffer, never a click.
      let t = Math.max(nextAtRef.current, c.currentTime + (started ? 0.02 : 0.03));
      if (!started) { t = Math.max(t, at ?? 0); start = t; started = true; if (first) firstWord(c, t); }
      nextAtRef.current = play(c, pcmToFloat(all), t);
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (gen !== genRef.current) { try { await reader.cancel(); } catch {} return true; }
      if (done) break;
      if (!value?.length) continue;
      held.push(value); heldBytes += value.length;
      // The jitter buffer: the first flush waits for enough audio; after that, every ~100 ms of it goes out.
      if (heldBytes >= (started ? CHUNK_BYTES : JITTER_SEC * RATE * 2)) flush();
    }
    flush();
    if (started) log.push({ text, at: start, end: nextAtRef.current });
    return started;
  }, [open, play]);

  // No ElevenLabs key: the free voice (Kokoro in the browser), then the browser's own voice as the last resort.
  const localSpeak = useCallback(async (text: string, gen: number): Promise<boolean> => {
    try {
      const { speakLocal } = await import("@/lib/voice/kokoro");
      const out = await speakLocal(text);
      if (!out || gen !== genRef.current) return !!out;
      const c = ctx();
      const buf = c.createBuffer(1, out.samples.length, out.sampleRate); buf.getChannelData(0).set(out.samples);
      const src = c.createBufferSource(); src.buffer = buf; src.connect(voiceBus(c));
      const at = Math.max(c.currentTime + 0.02, nextAtRef.current); src.start(at); nextAtRef.current = at + buf.duration; firstWord(c, at);
      sourcesRef.current.push(src); src.onended = () => { sourcesRef.current = sourcesRef.current.filter((s) => s !== src); };
      return true;
    } catch (e) { console.warn("kokoro: local voice failed", e instanceof Error ? e.message : e); return false; }
  }, []);
  const browserSpeak = (text: string) => new Promise<void>((res) => {
    if (typeof speechSynthesis === "undefined") { res(); return; }
    // Under a test harness the system voice stays silent: it speaks through macOS, which no browser mute reaches,
    // so every harness run used to talk out of the laptop. The line still takes its time, so flows that wait on it hold.
    if (/[?&]e2e=1/.test(window.location.search)) { firstWord(ctx(), ctx().currentTime); window.setTimeout(res, Math.min(4000, 400 + text.length * 40)); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.rate = 1.05; u.onstart = () => firstWord(ctx(), ctx().currentTime); u.onend = () => res(); u.onerror = () => res();
    speechSynthesis.speak(u);
  });

  const pump = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setSpeaking(true); dRef.current.duck?.(true);
    try {
      while (queueRef.current.length) {
        const job = queueRef.current.shift()!;
        const gen = genRef.current; const log: Played[] = [];
        setCurrent(job.text);
        const parts = sentences(job.text);
        // Pipelined: sentence k+1 is fetched while sentence k plays.
        const opened: (Promise<Response | null> | undefined)[] = [];
        const want = (k: number) => { if (k < parts.length && !opened[k] && !ahead.current.has(parts[k])) opened[k] = open(parts[k]); return opened[k] ?? Promise.resolve(null); };
        for (let i = 0; i < parts.length && gen === genRef.current; i++) {
          const res = want(i); want(i + 1);
          const ok = await playSentence(parts[i], res, gen, i === 0 ? job.at : undefined, i === 0, log);
          if (!ok && gen === genRef.current) {
            // The free in-browser voice runs its model on the page's own thread (150 to 800 ms blocks), which is
            // the thread the record's scheduler needs: under a playing record it would crackle the music. So
            // while the record plays, a failed voice falls back to the browser's own speech, which runs outside.
            const local = forced() || !dRef.current.playing?.() ? await localSpeak(parts[i], gen) : false;
            if (!local && gen === genRef.current) { await browserSpeak(parts.slice(i).join(" ")); break; }
          }
        }
        // The line is done when its audio has played.
        const c = ctx(); const wait = Math.max(0, (nextAtRef.current - c.currentTime) * 1000);
        if (gen === genRef.current && wait > 0) await new Promise((r) => setTimeout(r, wait));
        if (e2e()) { const w = window as unknown as { __speech?: Played[][] }; (w.__speech ??= []).push(log); }
        job.resolve();
      }
    } finally {
      runningRef.current = false; setSpeaking(false); setCurrent(null); dRef.current.duck?.(false);
    }
  }, [open, playSentence, localSpeak]);

  /** Say a line. With `at` (an audio time on the studio's clock), its first sentence starts exactly then. */
  const speak = useCallback((text: string, opts?: { at?: number }): Promise<void> => {
    const t = text.trim();
    if (!t) return Promise.resolve();
    return new Promise<void>((resolve) => { queueRef.current.push({ id: ++seq.current, text: t, at: opts?.at, resolve }); void pump(); });
  }, [pump]);

  const stop = useCallback(() => {
    genRef.current++;
    for (const a of abortsRef.current.splice(0)) a.abort();
    for (const s of sourcesRef.current.splice(0)) { try { s.stop(); } catch {} }
    nextAtRef.current = 0;
    for (const j of queueRef.current.splice(0)) j.resolve();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }, []);

  useEffect(() => () => { stop(); }, [stop]);   // the context is the studio's and outlives this hook

  return { speak, stop, speaking, current, prefetch, warm: () => { ctx(); } };
}
