// The meters, from plain analysers. Tone.Meter is six native nodes and a master FFT, meter and waveform
// analyser are fifteen; these read the same numbers (RMS in dB with Tone's fall-off smoothing, the raw
// sample peak, the spectrum in dB per bin) from one analyser per track and four on the master. They exist
// only while something shows them (Rig.metering).
import * as Tone from "tone";

const db = (g: number) => (g > 0 ? 20 * Math.log10(g) : -Infinity);
const rmsOf = (a: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / Math.max(1, a.length)); };

/** One track's level: RMS over 256 samples in dB, jumping up at once and falling at `smoothing` per read. */
export class TrackMeter {
  readonly input: AnalyserNode;
  private buf = new Float32Array(256);
  private rms = 0;
  constructor(private smoothing = 0.75) {
    this.input = Tone.getContext().rawContext.createAnalyser() as unknown as AnalyserNode;
    this.input.fftSize = 512;
  }
  getValue(): number { this.input.getFloatTimeDomainData(this.buf); this.rms = Math.max(rmsOf(this.buf), this.rms * this.smoothing); return db(this.rms); }
  dispose() { try { this.input.disconnect(); } catch { /* gone */ } }
}

/** The master: a stereo level with fall-off, the true sample peak per channel, and the spectrum. */
export class MasterMeters {
  readonly input: ChannelSplitterNode;
  private l: AnalyserNode; private r: AnalyserNode; private fft: AnalyserNode;
  private wave = new Float32Array(1024); private bins = new Float32Array(1024);
  private rms: [number, number] = [0, 0];
  constructor(from: Tone.ToneAudioNode, private smoothing = 0.8) {
    const c = Tone.getContext().rawContext as unknown as BaseAudioContext;
    this.input = c.createChannelSplitter(2);
    this.l = c.createAnalyser(); this.r = c.createAnalyser(); this.l.fftSize = this.r.fftSize = 2048;
    this.fft = c.createAnalyser(); this.fft.fftSize = 2048; this.fft.smoothingTimeConstant = 0.5;
    Tone.connect(from, this.input); Tone.connect(from, this.fft);
    this.input.connect(this.l, 0); this.input.connect(this.r, 1);
  }
  read(): { master: [number, number]; peak: [number, number]; spectrum: Float32Array } {
    const side = (a: AnalyserNode, i: 0 | 1) => {
      a.getFloatTimeDomainData(this.wave);
      let pk = 0; for (let k = 0; k < this.wave.length; k++) { const v = Math.abs(this.wave[k]); if (v > pk) pk = v; }
      this.rms[i] = Math.max(rmsOf(this.wave), this.rms[i] * this.smoothing);
      return { level: db(this.rms[i]), peak: pk > 0 ? 20 * Math.log10(pk) : -100 };
    };
    const L = side(this.l, 0), R = side(this.r, 1);
    this.fft.getFloatFrequencyData(this.bins);
    return { master: [L.level, R.level], peak: [L.peak, R.peak], spectrum: this.bins };
  }
  dispose() { for (const n of [this.input, this.l, this.r, this.fft]) { try { n.disconnect(); } catch { /* gone */ } } }
}
