// The studio's input tap, on the audio thread (lib/audio/recorder.ts): the mic for speech, a hum, and a
// take. It copies what comes in, 2048 frames at a time, and posts each block with the audio frame its
// first sample was heard at and its RMS level. Nothing else runs here. No ScriptProcessor, no second context.
class ProducerRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 2048; this.buf = new Float32Array(this.size); this.n = 0; this.start = 0; this.capture = true;
    this.port.onmessage = (e) => { if (e.data && typeof e.data.capture === "boolean") this.capture = e.data.capture; };
  }
  process(inputs) {
    // An input with nothing playing into it has no channels: that is silence, and time still passes, so a take whose
    // singer stops before its end still reaches its end.
    const ch = (inputs[0] && inputs[0][0]) || (this.zeros || (this.zeros = new Float32Array(128)));
    for (let i = 0; i < ch.length; i++) {
      if (this.n === 0) this.start = currentFrame + i;
      this.buf[this.n++] = ch[i];
      if (this.n === this.size) {
        let s = 0; for (let j = 0; j < this.size; j += 8) s += this.buf[j] * this.buf[j];
        this.port.postMessage({ frame: this.start, rms: Math.sqrt(s / (this.size / 8)), samples: this.capture ? this.buf.slice() : null });
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor("producer-recorder", ProducerRecorder);
