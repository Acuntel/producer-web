# Ears test fixtures

Real DJ-tagged club tracks converted to raw float32 mono 22050 Hz (first 150 s).
The `.f32` files are gitignored (about 13 MB each). Regenerate with:

    zsh tests/fixtures/make.sh

Ground truth comes from the source filenames in `~/Desktop/Good Music From Slop/`,
which are tagged "BPM CAMELOT - Artist - Title" (for example `125 10A` = 125 BPM, B minor).
The two Anyma files are tagged 172 and are used only as an unasserted octave check.
Mono downmix note: BS.1770 loudness of a mono average sits about 3 dB under the
stereo measurement of the same master; the real-track test tolerances allow for it.
