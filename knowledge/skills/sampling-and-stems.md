# SKILL: sampling, stems and one-shots from a real record

When the user brings a record (an upload or a link), the studio can separate it into stems (drums, bass, vocals, other), measure it, and slice drum one-shots. Here is how a producer uses that material and where the lines are.

## What the studio gives you
- STEMS: drums, bass, vocals, other, each as an audio clip the ears have measured (bpm, key).
- ONE-SHOTS: kick, snare or clap, hat sliced from the drums stem, each under a second, trimmed to the transient with a short fade. They arrive as library clips usable with role "audio" and clip.oneShot true.
- FACTS: the record's tempo, key, structure, best 8 bars, groove map, band shares.

## How to use a drum one-shot like a producer
- Kick: put it on the kick grid ("X...X...X...X..."), midi 60 = as recorded. Tune it so the fundamental lands on the root or the fifth of the song key (clip.semitones, stay within plus or minus 4). Layer the synth kick's click on top if the sample is soft; highpass everything else under 30 Hz.
- Hat or shaker: run it through the song groove; velocity ladder X.g.x.g. ; a little chance (0.6-0.8) on the ghosts.
- Clap or snare: on 2 and 4, 10-20 ms late pocket (clapLateMs), reverb send 0.1-0.2.
- Never loop the whole drums stem under your own drums; take the sounds, keep your grid.

## How to use a melodic stem or a vocal
- Pitch it to the song key first (clip.semitones), warp it to the tempo (clip.warp, clip.bpm from the facts).
- Vocals: highpass 150-200 Hz, an 8n delay, a phrase at bar 1 of the drop and its echo at bar 5; chops on the offbeats for garage and hard-house. A sung phrase pitched to the fifth or up an octave becomes a diva chop.
- "Other" stem (chords, pads): use it only as a reference for the progression; write your own chords.

## The lines (say these plainly if asked)
- The user's uploads and links are analyzed for their own projects. The studio keeps the stems in their account only; it never redistributes them.
- A recording that is not theirs cannot be released without clearance from the rights holders, even chopped. Say so once, without a lecture, and offer the legal equivalent: the DNA (tempo, key, arc, groove), your own notes, and the CC0 library sounds.
- Never call a rebuilt part "the original". Emulation is the craft here.
