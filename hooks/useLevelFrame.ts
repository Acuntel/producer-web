"use client";
// The microphone level lives in a ref, not in React state: a state update twenty times a second
// re-rendered the whole page while the record played. What shows the level (the glow, the button)
// reads the ref once a frame and paints itself, and only while it is showing it.
import { useEffect, useRef } from "react";

export type LevelRef = { readonly current: number };

/** While `active`, call `paint` once a frame with the level; when it stops, paint the rest state (0) once. */
export function useLevelFrame(level: LevelRef | undefined, active: boolean, paint: (level: number) => void) {
  const paintRef = useRef(paint); paintRef.current = paint;
  useEffect(() => {
    if (!active || !level) { paintRef.current(0); return; }
    let raf = 0, last = -1;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const v = level.current;
      if (Math.abs(v - last) < 0.005) return;
      last = v; paintRef.current(v);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); paintRef.current(0); };
  }, [active, level]);
}
