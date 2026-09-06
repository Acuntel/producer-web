"use client";
// The visible proof that sound is moving: a stereo master meter, a spectrum of what
// leaves the master, and the mic meter. Canvas, one animation frame loop each, no React
// re-renders at 60 fps.
import { useEffect, useRef } from "react";
import type { Levels } from "@/lib/engine";
import type { MicStatus } from "@/hooks/useMicLevel";

const token = (name: string, fallback: string) => (typeof document === "undefined" ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);
const unit = (db: number, floor = -60) => Math.max(0, Math.min(1, (db - floor) / -floor));

export function MasterMeter({ getLevels, running, height = 88 }: { getLevels: () => Levels | null; running: boolean; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = 26, H = height; c.width = W * dpr; c.height = H * dpr; c.style.width = `${W}px`; c.style.height = `${H}px`; ctx.scale(dpr, dpr);
    const live = token("--c-live", "52 211 153"), accent = token("--c-accent", "245 176 66"), warn = token("--c-warn", "251 146 60"), s3 = token("--c-s3", "37 39 46");
    let raf = 0; const hold = [0, 0]; const holdAt = [0, 0]; let smooth = [0, 0];
    const draw = () => {
      const lv = running ? getLevels() : null;
      const now = performance.now();
      const vals = lv ? lv.master.map((d) => unit(d)) : [0, 0];
      smooth = smooth.map((s, i) => (vals[i] > s ? vals[i] : s * 0.92));
      ctx.clearRect(0, 0, W, H);
      for (let ch = 0; ch < 2; ch++) {
        const x = ch * 14, w = 12;
        ctx.fillStyle = `rgb(${s3} / 0.8)`; ctx.beginPath(); ctx.roundRect(x, 0, w, H, 3); ctx.fill();
        const v = smooth[ch]; const h = Math.round(v * H);
        if (h > 0) {
          const g = ctx.createLinearGradient(0, H, 0, 0);
          g.addColorStop(0, `rgb(${live})`); g.addColorStop(0.72, `rgb(${live})`); g.addColorStop(0.86, `rgb(${accent})`); g.addColorStop(1, `rgb(${warn})`);
          ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, H - h, w, h, 3); ctx.fill();
        }
        if (v >= hold[ch] || now - holdAt[ch] > 900) { hold[ch] = v; holdAt[ch] = now; }
        const hy = H - Math.round(hold[ch] * H);
        ctx.fillStyle = hold[ch] > 0.93 ? `rgb(${warn})` : `rgb(255 255 255 / 0.7)`; ctx.fillRect(x, Math.max(0, hy - 1), w, 2);
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [getLevels, running, height]);
  return <canvas ref={ref} aria-label="Master level" role="img" />;
}

export function Spectrum({ getLevels, running, width = 220, height = 88 }: { getLevels: () => Levels | null; running: boolean; width?: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = width * dpr; c.height = height * dpr; c.style.width = `${width}px`; c.style.height = `${height}px`; ctx.scale(dpr, dpr);
    const accent = token("--c-accent", "245 176 66"), cool = token("--c-cool", "110 168 254"), s3 = token("--c-s3", "37 39 46");
    const BARS = 28; let raf = 0; const smooth = new Float32Array(BARS);
    const draw = () => {
      const lv = running ? getLevels() : null;
      const spec = lv?.spectrum ?? null;
      ctx.clearRect(0, 0, width, height);
      const gap = 2, bw = (width - gap * (BARS - 1)) / BARS;
      for (let i = 0; i < BARS; i++) {
        // Log-ish spread: the low bins carry the music, so the first bars take single bins and the top ones take several.
        let v = 0;
        if (spec && spec.length) {
          const lo = Math.floor(Math.pow(i / BARS, 1.6) * (spec.length - 1)), hi = Math.max(lo + 1, Math.floor(Math.pow((i + 1) / BARS, 1.6) * (spec.length - 1)));
          let m = -200; for (let b = lo; b < hi && b < spec.length; b++) m = Math.max(m, spec[b]);
          v = Math.max(0, Math.min(1, (m + 100) / 90));
        }
        smooth[i] = v > smooth[i] ? v : smooth[i] * 0.86;
        const h = Math.max(2, Math.round(smooth[i] * height));
        const x = i * (bw + gap);
        ctx.fillStyle = `rgb(${s3} / 0.7)`; ctx.beginPath(); ctx.roundRect(x, height - 2, bw, 2, 1); ctx.fill();
        const g = ctx.createLinearGradient(0, height, 0, 0); g.addColorStop(0, `rgb(${cool} / 0.9)`); g.addColorStop(1, `rgb(${accent})`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, height - h, bw, h, 2); ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [getLevels, running, width, height]);
  return <canvas ref={ref} aria-label="Spectrum of the master output" role="img" />;
}

export function MicMeter({ level, peak, status }: { level: number; peak: number; status: MicStatus }) {
  const segs = 24;
  const lit = Math.round(level * segs), pk = Math.round(peak * segs);
  const dead = status !== "live";
  return (
    <div className="flex h-3 items-center gap-[3px]" aria-label="Microphone level" role="img">
      {Array.from({ length: segs }, (_, i) => {
        const on = !dead && i < lit; const isPeak = !dead && i === pk - 1 && pk > lit;
        const tone = i >= segs - 3 ? "bg-warn" : i >= segs - 8 ? "bg-accent" : "bg-live";
        return <span key={i} className={`h-full flex-1 rounded-[2px] transition-opacity duration-75 ${on || isPeak ? tone : "bg-s3"} ${on ? "opacity-100" : isPeak ? "opacity-70" : "opacity-60"}`} />;
      })}
    </div>
  );
}
