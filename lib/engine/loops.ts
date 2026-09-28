// A clip that loops: a warped instrument loop is a GrainPlayer stretched to the song tempo; a sung loop is never
// granulated or varispeed, it loops its formant-kept pre-render (lib/song/fit.ts) in a plain Player at rate 1.
// Both start, stop and loop the same way, so the rig schedules them alike.
import * as Tone from "tone";
import type { AudioClip } from "../song/types";

export type Loop = Tone.GrainPlayer | Tone.Player;

/** The loop for an audio track's clip `c` (already the played clip for a voice), into `into`, or none for a one-shot. */
export function makeLoop(c: AudioClip | undefined, buf: AudioBuffer | undefined, voice: boolean, songBpm: number, into: Tone.ToneAudioNode): Loop | undefined {
  if (!c || !buf || c.oneShot) return undefined;
  const start = c.startSec ?? 0;
  if (voice) {
    const p = new Tone.Player({ url: buf, loop: true, loopStart: start, fadeIn: 0.004, fadeOut: 0.004 });
    p.volume.value = c.gainDb ?? 0;
    p.loopEnd = c.lengthBeats ? Math.min(buf.duration, start + c.lengthBeats * (60 / songBpm)) : buf.duration;
    p.connect(into);
    return p;
  }
  const rate = c.warp !== false && c.bpm ? songBpm / c.bpm : 1;
  const g = new Tone.GrainPlayer({ url: buf, loop: true, playbackRate: rate, detune: (c.semitones ?? 0) * 100, grainSize: 0.12, overlap: 0.05, loopStart: start });
  g.volume.value = c.gainDb ?? 0;
  // The loop is lengthBeats of the clip's own beats in its buffer (60 / song.bpm * rate = 60 / clip bpm), never past its end.
  if (c.lengthBeats) g.loopEnd = Math.min(buf.duration, start + c.lengthBeats * (60 / songBpm) * rate);
  g.connect(into);
  return g;
}
