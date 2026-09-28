// Audio loops are clock state (masterprompt 8.2). A loop that is laid mid-span, a jump into the middle of
// one, a loop region that starts inside one, and a resume after a pause all start the loop at once at the
// right phase, instead of leaving it silent until the next section. Tone-free math, so a test holds it.
import type { AudioClip } from "../song/types";
import type { ClipSpan } from "./schedule";

export type SpanEv = { beats: number; phase: number };

/** A track's span events: each span's start, plus the loop's start when it falls inside a span (the wrap
 *  lands there, and Tone only fires what is on the timeline). Beats in, beats out. */
export function spanEvents(spans: ClipSpan[], loopStart: number): { beat: number; ev: SpanEv }[] {
  const out = spans.map((s) => ({ beat: s.startBeat, ev: { beats: s.beats, phase: 0 } }));
  for (const s of spans) {
    if (loopStart > s.startBeat + 1e-6 && loopStart < s.startBeat + s.beats - 1e-6) out.push({ beat: loopStart, ev: { beats: s.startBeat + s.beats - loopStart, phase: loopStart - s.startBeat } });
  }
  return out.sort((a, b) => a.beat - b.beat);
}

/** The span a beat is inside (not at its very start), and how far in. */
export function spanAt(spans: ClipSpan[], beat: number): { span: ClipSpan; phase: number } | null {
  const s = spans.find((x) => beat > x.startBeat + 1e-6 && beat < x.startBeat + x.beats - 1e-6);
  return s ? { span: s, phase: beat - s.startBeat } : null;
}

/** Where in the buffer a loop is after `phaseBeats` of the song, in seconds. `rate` is the warp (song bpm
 *  over clip bpm), so one song beat is 60 / songBpm * rate seconds of the clip. */
export function loopOffsetSec(clip: AudioClip, bufferSec: number, phaseBeats: number, songBpm: number, rate: number): number {
  const start = clip.startSec ?? 0;
  const loopEnd = clip.lengthBeats ? Math.min(bufferSec, start + clip.lengthBeats * (60 / songBpm) * rate) : bufferSec;
  const len = Math.max(1e-3, loopEnd - start);
  const into = (phaseBeats * (60 / songBpm) * rate) % len;
  return start + into;
}
