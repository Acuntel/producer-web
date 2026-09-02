# lib/ears

Pure TypeScript music perception. Input: `Float32Array` channels + sample rate. Output: `MusicFacts`
(tempo, groove, key, chords, loudness, spectrum, structure, and a plain-English read). No DOM, no
Tone.js; `browser.ts` is the only file that touches Web Audio.

| file | what it does |
| --- | --- |
| `dsp.ts` | mono mix, windowed-sinc decimation to ~22 kHz, radix-2 FFT, one STFT pass (N=2048) producing per-frame RMS, spectral flux (full band and below 120 Hz), centroid and six band powers; 2.5 ms fine envelopes (full band, >200 Hz, >4 kHz) |
| `chroma.ts` | second spectral pass (N=8192, plus a 4x-decimated copy for the bass octaves) with track tuning estimation, producing constant-Q chroma (chords, structure) and harmonic-salience chroma (key) |
| `loudness.ts` | ITU-R BS.1770-4 at native rate: K-weighting, gated integrated LUFS, short-term max, loudness range, crest, sample peak, plus per-span loudness |
| `rhythm.ts` | tempo by autocorrelation with 8-harmonic summation and a dance prior (or a `bpmHint`), beat and downbeat phase, MPC-style 16th swing, transient density, pump (beat-synchronous breathing of the >200 Hz mix), kicks per bar |
| `tonal.ts` | key from two chroma flavours (constant-Q and harmonic salience, both tuned to the track) scored against Temperley profiles with a natural-minor seventh; confidence and alternate; key-aware per-bar triad chords; condensed progression; Camelot conversion |
| `spectrum.ts` | perceptual band shares (sub <60, low 60-250, lowMid 250-500, mid 500-2k, highMid 2-6k, air >6k; gains calibrated on the DJ set so a typical master reads about 0.25/0.30/0.15/0.15/0.10/0.05), centroid, mud, harshness, stereo width |
| `structure.ts` | per-bar features, self-similarity novelty, segmentation (min 4 bars), labels intro/build/drop/break/groove/outro, energy contour, first drop |
| `groove.ts` | Extract Groove: folds the >4 kHz onsets (hats, the top of claps) into the 16 slots of one bar and reads each slot's timing (beats late or early) and accent; only slots with a stable hit in most bars count. Feeds `facts.groove.template` and the `{"op":"groove","from":"reference"}` move |
| `describe.ts` | deterministic producer read of the facts |
| `compare.ts` | render versus reference deltas and the sentence a mix engineer would say |
| `facts.ts` | `hear()` orchestration and the `MusicFacts` type |
| `browser.ts` | `decodeFile`, `hearBuffer`, `factsForBrain` (compact prompt JSON) |

Tests (Node 26, no extra dependencies):

    node --test tests/ears.test.mjs          # synthetic signals with known answers
    zsh tests/fixtures/make.sh               # once: convert the DJ-tagged tracks (needs ffmpeg)
    node --test tests/ears.real.test.mjs     # real club tracks, ground truth from the filenames (about 30 s)
    ~/.dictation/producer/venv/bin/python tests/fixtures/librosa_check.py   # independent cross-check

Measured on the 12 asserted DJ-tagged tracks (first 150 s each, mono 22050 Hz): tempo 12/12 within
0.1 BPM, key 9/12 exact plus 1 agreeing with librosa where the tag differs, integrated LUFS 12/12
inside -16 to -4, a drop found in 12/12, about 2 s of analysis per track in Node.
