"use client";
// The one control. Hold to talk, release to send. A quick tap toggles instead, for
// people who would rather not hold. Space bar does the same. While the producer is
// speaking, a press cuts it off and starts listening at once.
import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

export type SpeakState = "idle" | "holding" | "sending" | "speaking" | "disabled";

export function SpeakButton({
  state, level, onPress, onRelease, label, hint,
}: { state: SpeakState; level: number; onPress: () => void; onRelease: () => void; label?: string; hint?: string }) {
  const downAt = useRef<number | null>(null);
  const toggled = useRef(false);
  const holding = state === "holding";
  const speaking = state === "speaking";

  // Pointer: down starts, up ends when it was a hold; a quick tap turns the mic on and
  // the next tap turns it off.
  const down = (e: React.PointerEvent) => {
    if (state === "disabled") return;
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic events have no live pointer */ }
    if (toggled.current) { toggled.current = false; downAt.current = null; onRelease(); return; }
    downAt.current = performance.now();
    onPress();
  };
  const up = (e: React.PointerEvent) => {
    if (state === "disabled" || downAt.current === null) return;
    e.preventDefault();
    const held = performance.now() - downAt.current;
    downAt.current = null;
    if (held < 260) { toggled.current = true; return; }   // a tap: stay open until the next tap
    onRelease();
  };
  // Keyboard: hold the space bar.
  useEffect(() => {
    let spaceDown = false;
    const kd = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || spaceDown) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault(); spaceDown = true; onPress();
    };
    const ku = (e: KeyboardEvent) => { if (e.code !== "Space" || !spaceDown) return; e.preventDefault(); spaceDown = false; onRelease(); };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, [onPress, onRelease]);

  const scale = holding ? 1 + Math.min(0.22, level * 0.6) : 1;
  const text = label ?? (holding ? "Listening" : speaking ? "Tap to cut in" : state === "sending" ? "Sending" : "Hold to talk");

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <div className="relative grid place-items-center" style={{ width: 104, height: 104 }}>
        {speaking && <span aria-hidden className="absolute inset-0 rounded-full border-2 border-live/70" style={{ animation: "speak-ring 1.4s ease-out infinite" }} />}
        {holding && <span aria-hidden className="absolute inset-[-10px] rounded-full bg-accent/25 blur-xl transition-transform duration-75" style={{ transform: `scale(${scale})` }} />}
        <button
          type="button"
          aria-label={holding ? "Release to send" : speaking ? "Cut in" : "Hold to talk"}
          aria-pressed={holding}
          data-role="speak"
          disabled={state === "disabled"}
          onPointerDown={down}
          onPointerUp={up}
          onPointerCancel={up}
          onContextMenu={(e) => e.preventDefault()}
          style={{ transform: `scale(${scale})`, touchAction: "none" }}
          className={`relative grid h-[88px] w-[88px] place-items-center rounded-full transition-[transform,box-shadow,background-color] duration-100 ease-out
            disabled:opacity-40
            ${holding ? "bg-accent text-accent-ink shadow-[0_0_0_6px_rgb(255_45_146/0.25),0_0_60px_rgb(255_45_146/0.6)]"
              : speaking ? "bg-live text-accent-ink shadow-[0_0_50px_rgb(57_255_136/0.45)]"
              : "bg-ink text-base shadow-[0_0_0_1px_rgb(255_255_255/0.08)_inset,0_10px_40px_-12px_rgb(255_45_146/0.7)] hover:shadow-[0_0_0_1px_rgb(255_255_255/0.1)_inset,0_10px_50px_-10px_rgb(255_45_146/0.9)]"}`}
        >
          <Icon name={speaking ? "stop" : "mic"} size={32} />
        </button>
      </div>
      <div className="flex h-5 flex-col items-center" aria-live="polite">
        <span className={`text-sm font-medium ${holding ? "text-accent" : speaking ? "text-live" : "text-ink-3"}`}>{text}</span>
      </div>
      {hint && <span className="-mt-2 text-xs text-ink-3">{hint}</span>}
    </div>
  );
}
