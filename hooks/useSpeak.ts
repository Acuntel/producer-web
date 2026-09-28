"use client";
// Push to talk. The button press opens the realtime speech engine and streams the mic;
// the release sends the commit, so the end of the sentence is known the moment the
// finger lifts (no silence timer). Web Speech does the same job when no engine token
// can be had. One microphone stream stays open for the whole session, so a press
// costs nothing.
import { useCallback, useEffect, useRef, useState } from "react";
import { scribeAvailable } from "@/lib/voice/scribe";
import { makeRecognizer, type RecognitionLike } from "@/lib/voice/recognition";
import type { LevelRef } from "./useLevelFrame";
import { studioContext } from "@/lib/audio/studio";
import { tapInput, type Tap } from "@/lib/audio/recorder";
import { talkRing, remember, type SaidWord } from "@/lib/voice/said";

export type SpeakStatus = "idle" | "holding" | "sending" | "blocked" | "nodevice" | "unsupported";
type Deps = { onFinal: (text: string, ms: number) => void; onPress?: () => void };

function downsample(input: Float32Array, inRate: number, outRate: number): Int16Array {
  const ratio = inRate / outRate; const n = Math.floor(input.length / ratio); const o = new Int16Array(n);
  for (let i = 0; i < n; i++) { const a = Math.floor(i * ratio), b = Math.min(input.length, Math.floor((i + 1) * ratio)); let s = 0, c = 0; for (let j = a; j < b; j++) { s += input[j]; c++; } const v = c ? s / c : 0; o[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767))); }
  return o;
}
const b64 = (a: Int16Array) => { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 0x8000))); return btoa(s); };
const SILENCE = b64(new Int16Array(1600));   // 100 ms of nothing, rides with the commit

export function useSpeak(d: Deps) {
  const [status, setStatusState] = useState<SpeakStatus>("idle");
  const statusRef = useRef<SpeakStatus>("idle");
  const setStatus = (s: SpeakStatus) => { statusRef.current = s; setStatusState(s); };
  const levelRef = useRef(0);   // read once a frame by what shows it (useLevelFrame), never a re-render
  const [interim, setInterim] = useState("");
  const [engine, setEngineState] = useState<"scribe" | "webspeech" | null>(null);
  const engineRef = useRef<"scribe" | "webspeech" | null>(null);
  const setEngine = (e: "scribe" | "webspeech" | null) => { engineRef.current = e; setEngineState(e); };
  const dRef = useRef(d); dRef.current = d;
  const holdingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const tapRef = useRef<Tap | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<string[]>([]);
  const partialRef = useRef("");
  const tokenRef = useRef<Promise<string | null> | null>(null);
  const tokenAtRef = useRef(0);
  const recRef = useRef<RecognitionLike | null>(null);
  const pressAtRef = useRef(0);
  const releaseAtRef = useRef(0);
  const finalTimer = useRef<number | null>(null);
  const utterRef = useRef<{ start: number | null; end: number; sr: number; words: SaidWord[] }>({ start: null, end: 0, sr: 44100, words: [] });

  const fetchToken = useCallback(async (): Promise<string | null> => {
    try { const r = await fetch("/api/stt/token", { method: "POST" }); if (!r.ok) return null; const j = (await r.json()) as { token?: string }; return j.token ?? null; } catch { return null; }
  }, []);
  const warmToken = useCallback(() => { tokenRef.current = fetchToken(); tokenAtRef.current = Date.now(); }, [fetchToken]);

  // The microphone, opened once, kept for the session, in the studio's own context through its input tap
  // (lib/audio/recorder.ts): no second context and no ScriptProcessor on the page's thread.
  const ensureMic = useCallback(async (): Promise<boolean> => {
    const ctx = studioContext();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    if (streamRef.current && tapRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      const src = ctx.createMediaStreamSource(stream);
      tapRef.current = await tapInput(ctx, src, {
        level: (rms) => { levelRef.current = Math.min(1, rms * 6); },
        chunk: (data, frame) => {
          // Every sample the talk mic hears is kept for 30 s by its audio frame ("put what I just said in the song").
          talkRing(ctx.sampleRate).push(data, frame);
          if (!holdingRef.current) return;
          if (utterRef.current.start === null) utterRef.current.start = frame;
          utterRef.current.end = frame + data.length; utterRef.current.sr = ctx.sampleRate;
          const chunk = b64(downsample(data, ctx.sampleRate, 16000));
          const ws = wsRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: chunk, sample_rate: 16000 }));
          else pendingRef.current.push(chunk);
        },
      });
      streamRef.current = stream;
      return true;
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      setStatus(name === "NotAllowedError" || name === "SecurityError" ? "blocked" : name === "NotFoundError" ? "nodevice" : "blocked");
      return false;
    }
  }, []);

  const finish = useCallback((text: string) => {
    if (finalTimer.current) { window.clearTimeout(finalTimer.current); finalTimer.current = null; }
    const t = text.trim();
    setInterim(""); partialRef.current = "";
    const u = utterRef.current;
    if (u.start !== null) remember({ text: t, startFrame: u.start, endFrame: u.end, sampleRate: u.sr, words: u.words, at: Date.now() });
    setStatus("idle");
    const ms = Math.round(performance.now() - releaseAtRef.current);
    console.info(`speak: ${t ? "committed" : "nothing heard"} ${ms} ms after release${t ? `: "${t.slice(0, 80)}"` : ""}`);
    if (typeof window !== "undefined" && /[?&](e2e|voice)=1/.test(window.location.search)) { const w = window as unknown as { __stt?: unknown[] }; (w.__stt ??= []).push({ text: t, ms, engine: engineRef.current }); }
    if (t) dRef.current.onFinal(t, ms);
  }, []);

  const closeWs = useCallback(() => { const ws = wsRef.current; wsRef.current = null; try { ws?.close(); } catch {} }, []);

  // The realtime engine: one socket per utterance, opened on the press, committed on release.
  const openScribe = useCallback(async () => {
    if (!tokenRef.current || Date.now() - tokenAtRef.current > 8 * 60 * 1000) warmToken();
    const token = await tokenRef.current; warmToken();
    if (!token) return false;
    const url = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token=${encodeURIComponent(token)}&audio_format=pcm_16000&language_code=en&filter_background_audio=true&include_timestamps=true`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => { for (const c of pendingRef.current.splice(0)) ws.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: c, sample_rate: 16000 })); if (!holdingRef.current) commitScribe(ws); };
    ws.onmessage = (m) => {
      let x: { message_type?: string; type?: string; text?: string; words?: { text?: string; start?: number; end?: number; type?: string }[] }; try { x = JSON.parse(m.data as string); } catch { return; }
      // Word times (seconds from the first audio sent, which is the first frame heard while holding) cut "what I just said".
      if (Array.isArray(x.words)) utterRef.current.words = x.words.filter((w) => (w.type ?? "word") === "word" && typeof w.start === "number" && typeof w.end === "number").map((w) => ({ w: w.text ?? "", start: w.start as number, end: w.end as number }));
      const t = x.message_type ?? x.type ?? "";
      if (t === "partial_transcript") { partialRef.current = (x.text ?? "").trim(); setInterim(partialRef.current); }
      else if (t === "committed_transcript" || t === "committed_transcript_with_timestamps") { const text = (x.text ?? "").trim() || partialRef.current; closeWs(); finish(text); }
      else if (t === "auth_error" || t === "quota_exceeded" || t === "rate_limited") { console.warn("scribe", t); closeWs(); finish(partialRef.current); }
    };
    ws.onerror = () => { console.warn("scribe: socket error"); };
    ws.onclose = () => { if (wsRef.current === ws) { wsRef.current = null; if (!holdingRef.current && statusRef.current !== "idle") finish(partialRef.current); } };
    return true;
  }, [closeWs, finish, warmToken]);

  function commitScribe(ws: WebSocket) {
    try { ws.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: SILENCE, sample_rate: 16000, commit: true })); } catch {}
    // A committed transcript normally lands within a few hundred milliseconds; the last partial is the answer if it does not.
    finalTimer.current = window.setTimeout(() => { closeWs(); finish(partialRef.current); }, 2500);
  }

  const press = useCallback(async () => {
    if (holdingRef.current) return;
    dRef.current.onPress?.();
    holdingRef.current = true; pressAtRef.current = performance.now(); partialRef.current = ""; setInterim("");
    utterRef.current = { start: null, end: 0, sr: utterRef.current.sr, words: [] };
    setStatus("holding");
    const ok = await ensureMic();
    if (!ok) { holdingRef.current = false; return; }
    if (!holdingRef.current) return;   // released before the mic opened
    const useScribe = engine === "scribe" ? true : engine === "webspeech" ? false : await scribeAvailable();
    if (useScribe) { setEngine("scribe"); const opened = await openScribe(); if (opened) return; }
    setEngine("webspeech");
    const rec = makeRecognizer({
      onInterim: (t) => { partialRef.current = t; setInterim(t); },
      onFinal: (t) => { recRef.current = null; finish(t); },
      onEnd: () => { if (recRef.current) { recRef.current = null; finish(partialRef.current); } },
      onError: (kind) => { if (kind === "blocked") setStatus("blocked"); else if (kind === "nodevice") setStatus("nodevice"); recRef.current = null; finish(partialRef.current); },
    });
    if (!rec) { setStatus("unsupported"); holdingRef.current = false; return; }
    rec.continuous = false;
    recRef.current = rec;
    try { rec.start(); } catch { recRef.current = null; }
  }, [engine, ensureMic, finish, openScribe]);

  const release = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false; releaseAtRef.current = performance.now();
    setStatus("sending");
    const ws = wsRef.current;
    if (ws) { if (ws.readyState === WebSocket.OPEN) commitScribe(ws); /* else: onopen commits */ return; }
    const rec = recRef.current;
    if (rec) { try { rec.stop(); } catch { recRef.current = null; finish(partialRef.current); } finalTimer.current = window.setTimeout(() => { if (recRef.current) { recRef.current = null; finish(partialRef.current); } }, 2500); return; }
    // No engine at all yet (released before anything opened): nothing to send.
    finish("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finish]);

  useEffect(() => { void scribeAvailable().then((ok) => { setEngine(ok ? "scribe" : "webspeech"); if (ok) warmToken(); }); }, [warmToken]);
  useEffect(() => () => { closeWs(); tapRef.current?.stop(); streamRef.current?.getTracks().forEach((t) => t.stop()); }, [closeWs]);

  return { status, level: levelRef as LevelRef, interim, engine, press, release, holding: status === "holding" };
}
