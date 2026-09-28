// Where the next bar line is in audio time, on the live transport: a take's count-in starts there, so the take itself
// starts on a bar and its samples line up with the grid from the first one.
import * as Tone from "tone";

/** The audio time and number (from 0) of the next bar line at least `leadSec` from now, or null while stopped. */
export function nextBarAt(leadSec = 0.15): { time: number; bar: number; barSec: number } | null {
  const tr = Tone.getTransport();
  if (tr.state !== "started") return null;
  const barTicks = 4 * tr.PPQ, now = Tone.immediate() + leadSec;
  const at = tr.getTicksAtTime(now), ticks = Math.ceil(at / barTicks) * barTicks;
  const beatSec = 60 / tr.bpm.value;
  return { time: now + ((ticks - at) / tr.PPQ) * beatSec, bar: Math.round(ticks / barTicks), barSec: 4 * beatSec };
}
