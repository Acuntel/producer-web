// The desk's last stage, as numbers: Tone-free, so a test holds the curve to its promises.
// The record's true peak stays at or below -1 dBFS, so it never reaches full scale and the producer's
// voice has room on top. The curve's own bound sits half a dB under that: the 4x oversampler's filters
// put the peaks up to 0.9 dB above the curve (measured on the seed, docs/GYM_LOG.md 2026-09-27).
export const TRUE_PEAK_DB = -1;
export const CEILING = Math.pow(10, (TRUE_PEAK_DB - 0.5) / 20);
// The soft ceiling's input is scaled by a half, so its curve spans +6 dBFS of overs instead of ending at
// full scale: a WaveShaper maps only input in [-1, 1] and holds its last value beyond, which was a hard
// clamp at -2.85 dBFS under 1.6 percent of the seed. `u` is the pre-scaled input (the signal times
// PRESCALE); the output is near unity at low levels (a quarter of a dB down at -12 dBFS), bends
// smoothly toward the ceiling, and never reaches it.
export const PRESCALE = 0.5;
export const softCeiling = (u: number) => CEILING * Math.tanh(u / PRESCALE / CEILING);
