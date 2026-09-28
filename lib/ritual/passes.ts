// The transport's loop count: a pass is one trip around the loop region, the thing a producer counts
// ("two more times, then the drums"). Tone's Transport emits "loop" each time the playhead wraps from
// loopEnd back to loopStart; this only counts those, off React, with one listener per transport.
import * as Tone from "tone";
import { ensureStudioContext } from "../engine/context";

let loops = 0;
let armed: object | null = null;

export function armPasses(): void {
  ensureStudioContext();   // the studio's transport, never the one Tone made on import (it is disposed)
  const t = Tone.getTransport();
  if (armed === t) return;
  armed = t;
  t.on("loop", () => { loops++; });
}

export const loopCount = () => loops;
/** Where the playhead sits inside the loop region, 0 to 1. */
export const loopProgress = (): number => { try { return Tone.getTransport().progress; } catch { return 0; } };
export const transportRunning = (): boolean => { try { return Tone.getTransport().state === "started"; } catch { return false; } };
export const transportBpm = (): number => Math.round(Tone.getTransport().bpm.value * 10) / 10;
