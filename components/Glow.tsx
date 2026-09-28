"use client";
// The edge glow: the one place the stage shows what the producer is doing. Pink while it
// listens to you, violet while it thinks, green while it speaks, a faint ring while the
// music plays. The painting lives in globals.css; this only sets the state.
import { useRef } from "react";
import { useLevelFrame, type LevelRef } from "@/hooks/useLevelFrame";
export type GlowState = "idle" | "listening" | "thinking" | "speaking" | "audition" | "playing";

const TINT: Record<GlowState, "pink" | "green" | "violet" | "mix"> = {
  idle: "mix", listening: "pink", thinking: "violet", speaking: "green", audition: "green", playing: "mix",
};

export function Glow({ state, level }: { state: GlowState; level?: LevelRef }) {
  // Your voice level widens the pink band a little, so holding the button feels alive. Painted
  // straight onto the element once a frame while listening, so the page never re-renders for it.
  const el = useRef<HTMLDivElement>(null);
  useLevelFrame(level, state === "listening", (l) => {
    const e = el.current; if (!e) return;
    const boost = 1 + Math.min(0.6, l * 1.4);
    e.style.transform = `scale(${1 + (boost - 1) * 0.02})`;
    e.style.filter = boost > 1 ? `brightness(${boost})` : "";
  });
  return <div ref={el} aria-hidden className="glow-edge" data-state={state} data-tint={TINT[state]} />;
}
