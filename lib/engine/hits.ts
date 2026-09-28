// Sampled hits (a kit drum, a one-shot): one buffer source per hit, with that hit's gain and rate
// set for it and carried into its own start at the hit's audio time. A shared Player has one volume
// and one rate, and the rig's callback set them 0.1 to 0.2 s before the hit played, at now(): every
// drum played the previous hit's velocity. A retrigger fades the hit still ringing over a few
// milliseconds instead of cutting it (the Player cut it dead, which is a click).
import * as Tone from "tone";

/** The fade a retriggered hit gets, and the fade-in of every hit (none: a drum's attack is its sound). */
export const CHOKE_SEC = 0.004;

export type Hitter = {
  /** Play at audio time t, at a linear gain and a playback rate, from `offset` seconds into the buffer. */
  hit: (t: number, gain: number, rate: number, offset?: number) => void;
  dispose: () => void;
};

// A reversed copy, made once per buffer. Tone reverses a buffer in place, which would reverse the
// shared, cached original under every other voice that plays it.
const reversedCopies = new WeakMap<AudioBuffer, AudioBuffer>();
export function reversedOf(buf: AudioBuffer): AudioBuffer {
  const have = reversedCopies.get(buf); if (have) return have;
  const out = new AudioBuffer({ length: buf.length, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(Float32Array.from(buf.getChannelData(c)).reverse(), c);
  reversedCopies.set(buf, out);
  return out;
}

export function hitter(buf: AudioBuffer, into: Tone.ToneAudioNode): Hitter {
  const tb = new Tone.ToneAudioBuffer(buf);
  const ringing = new Set<Tone.ToneBufferSource>();
  let last: Tone.ToneBufferSource | null = null;
  return {
    hit: (t, gain, rate, offset = 0) => {
      if (last && ringing.has(last)) { try { last.stop(t); } catch { /* already ended */ } }
      const src = new Tone.ToneBufferSource({ url: tb, playbackRate: rate, fadeIn: 0, fadeOut: CHOKE_SEC, curve: "linear" });
      src.onended = () => ringing.delete(src);
      src.connect(into);
      ringing.add(src); last = src;
      src.start(t, offset, undefined, gain);
    },
    dispose: () => { for (const s of ringing) { try { s.dispose(); } catch { /* gone */ } } ringing.clear(); last = null; },
  };
}
