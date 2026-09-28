// A rolling buffer of what the talk mic heard, kept by audio frame: the last 30 s of push-to-talk, so "put what I just
// said in the song" is a slice of samples already in memory, never a second recording. Tone-free, no DOM.
export class Ring {
  private buf: Float32Array;
  private end = 0;        // the audio frame one past the newest sample held
  constructor(readonly seconds: number, readonly sampleRate: number) { this.buf = new Float32Array(Math.ceil(seconds * sampleRate)); }
  /** Samples heard from audio frame `frame` on. A gap since the last push is held as silence. */
  push(samples: Float32Array, frame: number) {
    const n = this.buf.length;
    if (frame > this.end) { const gap = Math.min(n, frame - this.end); for (let i = 0; i < gap; i++) this.buf[(this.end + i) % n] = 0; }
    for (let i = 0; i < samples.length; i++) this.buf[(frame + i) % n] = samples[i];
    this.end = Math.max(this.end, frame + samples.length);
  }
  /** The oldest frame still held. */
  get start() { return Math.max(0, this.end - this.buf.length); }
  get newest() { return this.end; }
  /** Frames `from` to `to` (clamped to what is held), as a new array. */
  slice(from: number, to: number): Float32Array {
    const a = Math.max(this.start, Math.floor(from)), b = Math.min(this.end, Math.ceil(to));
    const out = new Float32Array(Math.max(0, b - a)); const n = this.buf.length;
    for (let i = 0; i < out.length; i++) out[i] = this.buf[(a + i) % n];
    return out;
  }
}
