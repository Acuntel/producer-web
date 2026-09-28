// The producer's voice has one bus in the studio's context. With a desk playing, it goes in before the
// desk's final limiter and soft ceiling, so the voice and the record share one ceiling and never sum past
// it at the device. With no desk yet (the greeting before the first bar), it goes through a limiter of
// its own. Tone-free: the desk hands over a native input when it exists (board.ts).
let bus: GainNode | null = null;
let own: DynamicsCompressorNode | null = null;
let into: AudioNode | null = null;

const VOICE_GAIN = 0.5;   // -6 dB of headroom: the record peaks at -1 dBFS

/** The voice's bus in context `c`, made once. */
export function voiceBus(c: BaseAudioContext): GainNode {
  if (bus && bus.context === c) return bus;
  bus = c.createGain(); bus.gain.value = VOICE_GAIN;
  own = c.createDynamicsCompressor(); own.threshold.value = -8; own.knee.value = 0; own.ratio.value = 20; own.attack.value = 0.002; own.release.value = 0.12;
  own.connect(c.destination);
  bus.connect(into && into.context === c ? into : own);
  return bus;
}

/** The desk's voice input (before its final limiter), or null when the desk comes down. A switch while the
 *  voice speaks is a 10 ms crossfade on the bus, never a click. */
export function routeVoice(next: AudioNode | null) {
  if (next === into) return;
  into = next;
  if (!bus || !own) return;
  const b = bus; const c = b.context; const t = c.currentTime;
  b.gain.cancelScheduledValues(t); b.gain.setValueAtTime(b.gain.value, t); b.gain.linearRampToValueAtTime(0, t + 0.01);
  setTimeout(() => {
    try { b.disconnect(); } catch { /* not connected */ }
    b.connect(next && next.context === c ? next : own!);
    const u = c.currentTime; b.gain.setValueAtTime(0, u); b.gain.linearRampToValueAtTime(VOICE_GAIN, u + 0.01);
  }, 15);
}
