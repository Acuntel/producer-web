// Audition one clip, once, through the master chain (so it is compressed, limited and clipped like the
// record and can never come out louder than it), with a 5 ms attack so it does not click in. The
// producer's "listen to this". Before a session exists there is no desk, and nothing else is playing.
import * as Tone from "tone";
import { loadClipsFor } from "./clips";

export async function previewThrough(into: Tone.ToneAudioNode | null, clipId: string, gainDb = -3): Promise<boolean> {
  const bufs = await loadClipsFor([clipId], "preview"); const buf = bufs.get(clipId); if (!buf) return false;
  const p = new Tone.Player(buf); p.fadeIn = 0.005; p.fadeOut = 0.005; p.volume.value = gainDb;
  if (into) p.connect(into); else p.toDestination();
  p.start(); p.onstop = () => p.dispose();
  window.setTimeout(() => { try { p.dispose(); } catch {} }, Math.ceil(buf.duration * 1000) + 500);
  return true;
}
