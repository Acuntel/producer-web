"use client";
// The mic, seen: opens the microphone when the session runs, reports the live level
// (0..1) and the permission state, so "it does not hear me" is never invisible.
import { useEffect, useRef, useState } from "react";

export type MicStatus = "off" | "opening" | "live" | "blocked" | "nodevice" | "error";

export function useMicLevel(enabled: boolean) {
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [status, setStatus] = useState<MicStatus>("off");
  const [heardSomething, setHeardSomething] = useState(false);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) { setStatus("off"); setLevel(0); return; }
    let stream: MediaStream | null = null, ctx: AudioContext | null = null, cancelled = false;
    setStatus("opening");
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.6;
        src.connect(an);
        const buf = new Float32Array(an.fftSize);
        let smooth = 0, pk = 0;
        setStatus("live");
        const tick = () => {
          if (cancelled) return;
          an.getFloatTimeDomainData(buf);
          let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          const v = Math.min(1, Math.pow(rms * 6, 0.7));   // speech at a normal distance lands around 0.4-0.8
          smooth = v > smooth ? v : smooth * 0.85 + v * 0.15;
          pk = Math.max(pk * 0.97, v);
          setLevel(smooth); setPeak(pk);
          if (v > 0.12) setHeardSomething(true);
          raf.current = requestAnimationFrame(tick);
        };
        tick();
        stream.getAudioTracks()[0]?.addEventListener("ended", () => { if (!cancelled) setStatus("nodevice"); });
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        setStatus(name === "NotAllowedError" || name === "SecurityError" ? "blocked" : name === "NotFoundError" || name === "OverconstrainedError" ? "nodevice" : "error");
      }
    })();
    return () => {
      cancelled = true;
      if (raf.current) cancelAnimationFrame(raf.current);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
    };
  }, [enabled]);

  return { level, peak, status, heardSomething };
}
