"use client";
// Brady's own voice (masterprompt 5.7). "Put what I just said in the song": the last utterance is cut out of the talk
// mic's 30 s ring by its word times and is a clip within a moment of the ask. "Record me": the record mic (every
// speech process off), the latency confirmed once per device by a loopback click, one bar of count-in, the take cut
// exactly on its bar. Either way the take is gated between phrases, tuned gently toward the song's scale, and placed
// by the same loop as any other voice (hooks/useVoicePlace.ts). It is the one voice the product fully owns.
import { useCallback, useEffect, useRef } from "react";
import type { useStudio } from "./useStudio";
import type { VoiceSource } from "@/lib/song/place";
import { studioContext } from "@/lib/audio/studio";
import { lastSaid, samplesOf, talkRing, remember, type SaidWord } from "@/lib/voice/said";

type Studio = ReturnType<typeof useStudio>;
type Deps = { studio: Studio; speak: (t: string) => Promise<void> | void; place: (v: VoiceSource, src: AudioBuffer) => Promise<unknown> };
type Feed = { input: AudioNode; output: AudioNode; deviceId: string; performer?: AudioBuffer };
type Log = { kind: "said" | "record"; at: number; readyMs: number | null; readyAt?: number; clipId: string | null; seconds: number; latencyMs?: number; latencyFrom?: string; bar?: number; tuning?: { before: number; after: number; notes: number; peak: number }; error?: string };
const harness = () => typeof window !== "undefined" && /[?&]e2e=1/.test(window.location.search);

export function useTake(d: Deps) {
  const dRef = useRef(d); dRef.current = d;
  const feed = useRef<Feed | null>(null);
  const log = useRef<Log[]>([]);
  const say = (line: string) => { const s = dRef.current.studio; s.append("assistant", line); void dRef.current.speak(line); };

  // Keep it (a clip at once), then clean and tune it and hand it to the placement loop.
  const keep = useCallback(async (samples: Float32Array, sr: number, name: string, entry: Log, t0: number) => {
    const s = dRef.current.studio;
    const { putClip, cacheDecoded, audioBufferToWav, cutId } = await import("@/lib/engine");
    const raw = new AudioBuffer({ length: samples.length, numberOfChannels: 1, sampleRate: sr }); raw.copyToChannel(Float32Array.from(samples), 0);
    const id = cutId(`take:${entry.kind}:${Date.now()}`, 0, raw.duration, entry.kind);
    cacheDecoded(id, raw);
    s.registerClip({ id, name, durationSec: raw.duration });
    entry.readyMs = Math.round(performance.now() - t0); entry.readyAt = performance.now(); entry.clipId = id; entry.seconds = Math.round(raw.duration * 100) / 100;
    void audioBufferToWav(raw).arrayBuffer().then((bytes) => putClip({ id, name, type: "audio/wav", bytes, createdAt: Date.now(), durationSec: raw.duration }));
    // Gate between phrases, then tune toward the song's scale, gently.
    const { gateTake, pitchFrames, sungNotes, corrections, deviation } = await import("@/lib/voice/tune");
    const song = s.getSong();
    const gated = gateTake(samples, sr);
    const { frames, hopSec } = pitchFrames(gated, sr);
    const notes = sungNotes(frames, hopSec, song.key);
    const g = new AudioBuffer({ length: gated.length, numberOfChannels: 1, sampleRate: sr }); g.copyToChannel(Float32Array.from(gated), 0);
    const { shiftSegments } = await import("@/lib/audio/stretch");
    const tuned = await shiftSegments(g, corrections(notes, "gentle"));
    const out = tuned.getChannelData(0); let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
    if (peak > 0.891) for (let i = 0; i < out.length; i++) out[i] *= 0.891 / peak;
    entry.tuning = { before: deviation(gated, sr, song.key).medianAbsCents, after: deviation(out, sr, song.key).medianAbsCents, notes: notes.length, peak: Math.round(Math.min(peak, 0.891) * 1000) / 1000 };
    const tid = cutId(id, 0, tuned.duration, "tuned");
    cacheDecoded(tid, tuned);
    void audioBufferToWav(tuned).arrayBuffer().then((bytes) => putClip({ id: tid, name: `${name}, tuned`, type: "audio/wav", bytes, createdAt: Date.now(), durationSec: tuned.duration }));
    const { findPhrases } = await import("@/lib/song/vocal");
    const { voiceFromPhrases } = await import("@/lib/song/place");
    const { detectRootPitch } = await import("@/lib/engine/pitch");
    const midis = (p: { startSec: number; endSec: number }) => { const m = detectRootPitch(out.subarray(Math.floor(p.startSec * sr), Math.floor(p.endSec * sr)), sr).midi; return m === null ? [] : [m]; };
    const v = voiceFromPhrases(findPhrases(out, sr), { name: "your voice", clipKey: tid, bpm: song.bpm, key: song.key, kind: "take", midis });
    if (!v.phrases.length) { say("I kept what you said, but there was no sung or spoken line in it to place."); return; }
    await dRef.current.place(v, tuned);
  }, []);

  /** "Put what I just said in the song." */
  const said = useCallback(async (ask?: string) => {
    const t0 = performance.now();
    const entry: Log = { kind: "said", at: Date.now(), readyMs: null, clipId: null, seconds: 0 };
    log.current.push(entry);
    const u = lastSaid(ask);
    const got = u ? samplesOf(u) : null;
    if (!u || !got) { entry.error = "nothing heard"; say("I have not heard you say anything yet. Hold the button, say or sing it, then ask me again."); return; }
    await keep(got.samples, u.sampleRate, `What you said${u.text ? `: ${u.text.slice(0, 30)}` : ""}`, entry, t0);
  }, [keep]);

  /** "Record me": one bar of count-in on the next bar, then `bars` bars of take, cut on its bar. */
  const record = useCallback(async (bars = 4) => {
    const s = dRef.current.studio; const ctx = studioContext(); const t0 = performance.now();
    const entry: Log = { kind: "record", at: Date.now(), readyMs: null, clipId: null, seconds: 0 };
    log.current.push(entry);
    const { nextBarAt } = await import("@/lib/engine/nextBar");
    const { measureLoopback, storedLatency, storeLatency, reportedLatency, clickBuffer } = await import("@/lib/audio/latency");
    const { recordBetween } = await import("@/lib/audio/recorder");
    let dev: Feed; let stop = () => {}; let track: MediaStreamTrack | null = null;
    if (feed.current) dev = feed.current;
    else {
      try { const { openRecordMic } = await import("@/lib/audio/recordMic"); const m = await openRecordMic(ctx); dev = { input: m.source, output: ctx.destination, deviceId: m.deviceId }; stop = m.stop; track = m.track; }
      catch { entry.error = "no mic"; say("I cannot open your microphone. Allow it in the browser and say record me again."); return; }
    }
    // The latency: the one confirmed for this device, else a loopback click now, else what the browser reports.
    let lat = storedLatency(dev.deviceId);
    if (!lat) {
      const m = await measureLoopback(ctx, dev.input, dev.output);
      const reported = reportedLatency(ctx, track);
      lat = { deviceId: dev.deviceId, offsetMs: Math.round((m ? m.offsetSec : reported) * 10000) / 10, reportedMs: Math.round(reported * 10000) / 10, measured: !!m, spreadMs: m ? Math.round(m.spreadSec * 10000) / 10 : 0, at: Date.now() };
      if (m) storeLatency(lat);
    }
    entry.latencyMs = lat.offsetMs; entry.latencyFrom = lat.measured ? "loopback" : "reported";
    const next = nextBarAt(0.3);
    if (!next) { stop(); entry.error = "stopped"; say("Press play first, and I will count you in on the next bar."); return; }
    say("One bar and you are in.");
    // The count-in: four clicks on the next bar, then the take from the bar after it.
    const click = clickBuffer(ctx.sampleRate);
    for (let b = 0; b < 4; b++) { const src = ctx.createBufferSource(); src.buffer = click; const g = ctx.createGain(); g.gain.value = b ? 0.35 : 0.6; src.connect(g); g.connect(ctx.destination); src.start(next.time + b * next.barSec / 4); src.onended = () => { src.disconnect(); g.disconnect(); }; }
    const start = next.time + next.barSec, end = start + bars * next.barSec, L = lat.offsetMs / 1000;
    entry.bar = next.bar + 1;
    if (feed.current?.performer) { const p = ctx.createBufferSource(); p.buffer = feed.current.performer; p.connect(dev.output); p.start(start); p.onended = () => p.disconnect(); }
    const samples = await recordBetween(ctx, dev.input, start + L, end + L);
    stop();
    await keep(samples, ctx.sampleRate, `Your take on bar ${entry.bar}`, entry, t0);
  }, [keep]);

  const take = useCallback(async (what: "record" | "said", ask?: string) => (what === "said" ? said(ask) : record()), [said, record]);

  useEffect(() => {
    if (!harness()) return;
    const w = window as unknown as Record<string, unknown>;
    w.__take = () => ({ log: log.current });
    // A probe's device: `delaySec` from output to input (a loopback with a known latency) and an optional performer.
    w.__takeFeed = (o: { delaySec: number; performer?: Float32Array; clear?: boolean }) => {
      if (o.clear) { feed.current = null; return true; }
      const ctx = studioContext(); const inG = ctx.createGain(); const del = ctx.createDelay(1); del.delayTime.value = o.delaySec; inG.connect(del);
      const performer = o.performer ? (() => { const b = new AudioBuffer({ length: o.performer!.length, numberOfChannels: 1, sampleRate: ctx.sampleRate }); b.copyToChannel(Float32Array.from(o.performer!), 0); return b; })() : undefined;
      feed.current = { input: del, output: inG, deviceId: `probe-${o.delaySec}`, performer };
      return true;
    };
    w.__takeRecord = (bars?: number) => record(bars);
    // What the talk mic would have heard, handed in with its word times, as if Brady had just said it.
    w.__said = (o: { samples: Float32Array | number[]; text: string; words: SaidWord[] }) => {
      const ctx = studioContext(); const ring = talkRing(ctx.sampleRate);
      const frame = Math.max(ring.newest, Math.round(ctx.currentTime * ctx.sampleRate));
      ring.push(Float32Array.from(o.samples), frame);
      remember({ text: o.text, startFrame: frame, endFrame: frame + o.samples.length, sampleRate: ctx.sampleRate, words: o.words, at: Date.now() });
      return true;
    };
  }, [record]);
  return { take, said, record };
}
