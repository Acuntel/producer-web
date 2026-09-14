"use client";
// The edge glow: the one place the stage shows what the producer is doing. Pink while it
// listens to you, violet while it thinks, green while it speaks, a faint ring while the
// music plays. The painting lives in globals.css; this only sets the state.
export type GlowState = "idle" | "listening" | "thinking" | "speaking" | "audition" | "playing";

const TINT: Record<GlowState, "pink" | "green" | "violet" | "mix"> = {
  idle: "mix", listening: "pink", thinking: "violet", speaking: "green", audition: "green", playing: "mix",
};

export function Glow({ state, level = 0 }: { state: GlowState; level?: number }) {
  // Your voice level widens the pink band a little, so holding the button feels alive.
  const boost = state === "listening" ? 1 + Math.min(0.6, level * 1.4) : 1;
  return (
    <div
      aria-hidden
      className="glow-edge"
      data-state={state}
      data-tint={TINT[state]}
      style={{ transform: `scale(${1 + (boost - 1) * 0.02})`, filter: boost > 1 ? `brightness(${boost})` : undefined }}
    />
  );
}
