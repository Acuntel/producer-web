"use client";
// Record a hum for N beats (in time with the transport), pitch-track it,
// quantize to the grid, hand back notes.
import { useRef, useState } from "react";
import type { Note } from "@/lib/song/types";
import { trackPitch, smoothFrames, framesToNotes } from "@/lib/engine/hum";

export type HumResult = { notes: Note[]; beats: number; frames: number; samples: Float32Array; sampleRate: number };

export function useHum() {
  const [recording, setRecording] = useState(false);
  const [countIn, setCountIn] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);

  async function record(bpm: number, beats = 8, countInBeats = 4): Promise<HumResult | null> {
    if (recording) return null;
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true } }); }
    catch { return null; }
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    const chunks: Float32Array[] = [];
    let capturing = false;
    proc.onaudioprocess = (e) => { if (capturing) chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
    src.connect(proc); proc.connect(ctx.destination);
    const beatMs = 60000 / bpm;
    setRecording(true);
    for (let i = countInBeats; i > 0; i--) { setCountIn(i); await wait(beatMs); }
    setCountIn(0);
    capturing = true;
    let cancelled = false;
    stopRef.current = () => { cancelled = true; };
    await wait(beats * beatMs);
    capturing = false;
    proc.disconnect(); src.disconnect(); stream.getTracks().forEach((t) => t.stop());
    await ctx.close();
    setRecording(false);
    stopRef.current = null;
    if (cancelled) return null;
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const samples = new Float32Array(total);
    let off = 0;
    for (const c of chunks) { samples.set(c, off); off += c.length; }
    const frames = smoothFrames(trackPitch(samples, ctx.sampleRate));
    const notes = framesToNotes(frames, bpm, { loopBeats: beats });
    return { notes, beats, frames: frames.length, samples, sampleRate: ctx.sampleRate };
  }

  return { record, recording, countIn, cancel: () => stopRef.current?.() };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
