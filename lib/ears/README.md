# lib/ears

Pure TypeScript music perception. Input: `Float32Array` channels + sample rate. Output: `MusicFacts`
(tempo, groove, key, chords, loudness, spectrum, structure, and a plain-English read). No DOM, no
Tone.js; `browser.ts` is the only file that touches Web Audio.

| file | what it does |
| --- | --- |
| `dsp.ts` | mono mix, windowed-sinc decimation to ~22 kHz, radix-2 FFT, one STFT pass producing per-frame RMS, spectral flux (full band and below 120 Hz), centroid, six band powers and chroma; 2.5 ms fine envelopes |
| `loudness.ts` | ITU-R BS.1770-4 at native rate: K-weighting, gated integrated LUFS, short-term max, loudness range, crest, sample peak, plus per-span loudness |
| `rhythm.ts` | tempo by autocorrelation with 8-harmonic summation and a dance prior (or a `bpmHint`), beat and downbeat phase, MPC-style 16th swing, transient density, pump (beat-synchronous breathing of the >200 Hz mix), kicks per bar |
| `tonal.ts` | chroma, Krumhansl-Schmuckler key with confidence and alternate, per-bar triad chords, condensed progression, Camelot conversion |
| `spectrum.ts` | band shares (sub <60, low 60-250, lowMid 250-500, mid 500-2k, highMid 2-6k, air >6k), centroid, mud, harshness, stereo width |
| `structure.ts` | per-bar features, self-similarity novelty, segmentation (min 4 bars), labels intro/build/drop/break/groove/outro, energy contour, first drop |
| `describe.ts` | deterministic producer read of the facts |
| `compare.ts` | render versus reference deltas and the sentence a mix engineer would say |
| `facts.ts` | `hear()` orchestration and the `MusicFacts` type |
| `browser.ts` | `decodeFile`, `hearBuffer`, `factsForBrain` (compact prompt JSON) |

Tests (Node 26, no extra dependencies):

    node --test tests/ears.test.mjs          # synthetic signals with known answers
    zsh tests/fixtures/make.sh               # once: convert the DJ-tagged tracks (needs ffmpeg)
    node --test tests/ears.real.test.mjs     # real club tracks, ground truth from the filenames
    ~/.dictation/producer/venv/bin/python tests/fixtures/librosa_check.py   # independent cross-check
