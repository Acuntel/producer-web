# EARS V8 MASTERPROMPT: the producer that actually hears (2026-09-01)

## The problem (Brady's words, mined)
"The system simply cannot process music. It needs to understand music more than 0s and 1s."
"Hear every beat, every rhythm, every human action within the music." "Produce wonderful music
based on existing songs." "All I want to do is communicate with you, and you communicate back."
Ground truth before this build: the brain's entire perception of any song was SIX numbers from
one 8-beat render of the drop (engine.analyzeSong). No tempo, no key, no chords, no structure,
no loudness, no reference track, no memory of verdicts. The 33-file Mind was knowledge without
perception. The brain was also BLOCKED live (identity-linked key without a workspace id).

## The architecture (validated by the 09-01 research, see memory producer-web-ears-research)
ONE perception pipeline for every audio object -> MusicFacts JSON -> the text-only brain.
Audio objects: (1) the app's own full-song render, (2) a reference track the user uploads,
(3) later: the user's hum. Claude never takes audio; nobody in the field feeds raw audio to a
text brain. Deterministic MIR supplies the numbers (audio LLMs hallucinate tempo and key).

## Phase 1 (THIS BUILD, no new infra, all in-browser TypeScript + the existing route)
1. lib/ears/*  pure TS, no DOM dependency, testable in Node:
   dsp (FFT/STFT/K-weighting) · loudness (BS.1770 LUFS, LRA, crest) · rhythm (onset envelope,
   tempo, beat phase, swing, transient density, pump depth) · tonal (chroma, Krumhansl key,
   per-bar chords) · spectrum (6 bands, centroid, mud, harshness, width) · structure (novelty
   segmentation, energy contour, drop detection) · facts (MusicFacts type, hear(), describe(),
   compare()).
2. engine.hearSong(song): full-arrangement offline render -> hear() -> MusicFacts with
   per-section facts. Replaces the six-number Ears.
3. Reference upload: header button -> decode -> hear() -> stored as the REFERENCE; the brain gets
   the reference facts + compare(render, reference) deltas on every exchange, and the emulation
   contract (DNA only: tempo, key, energy contour, swing, mix targets; never the recording).
4. Brain contract (route.ts): MEASURED SOUND becomes a MusicFacts block + plain-English read;
   thresholds per lane; reference deltas; taste ledger summary.
5. Taste ledger (lib/taste.ts, localStorage): every exchange logged with a facts snapshot;
   thumbs up/down on each producer move; the last verdicts are summarized into the prompt.
6. Unblock the brain: swap ANTHROPIC_API_KEY in Vercel to Brady's working workspace-scoped key
   (the Hermann bot key: no header needed, Opus 5 verified 09-01). Brady should mint a dedicated
   producer-web key later; the swap is one command.

## Self-tests (the loop: build -> test -> fix until green)
- tests/ears.test.mjs on synthetic signals: known tempo, key, loudness, pump, drop position.
- tests/ears.real.test.mjs on REAL DJ-tagged tracks from ~/Desktop/Good Music From Slop
  (filename = BPM + Camelot key = ground truth): tempo within 2 BPM or an octave, key match or
  relative-key match; librosa cross-check in ~/.dictation/producer/venv.
- npx tsc --noEmit, next build, deploy, curl the live brain, headless-Chrome CDP render test.

## Phase 2 / 3 (NOT this build)
Railway CPU worker (beat-this, CLAP taste vectors, audiobox aesthetics), Basic Pitch hum->MIDI,
Gemini audio sidecar for the qualitative read (needs a GEMINI_API_KEY; none exists on disk),
Magenta RT2 reference renders, SMART-style preference loop.
