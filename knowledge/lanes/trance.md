# Lane: trance (Uplifting trance at 136-140 and the hard-trance revival at 145-150)

Why it is here: the John Summit "Shiver" Rivas "Sandstorm" edit and Tiesto "The Business" are in his crate, his tech-house picks lean on euphoric string lifts, the hard-trance revival (Marlon Hoffstadt, Panteros666, Liberation at Fabric, Defqon.1 stages) sits next to his KETTAMA lane, and the engine already has fx.gate (a trance gate in 16ths). Numbers are quoted from the sources; (studio) marks translations.

## Tempo and keys
- Uplifting 136-140, home 138 ("138 BPM is the pocket", Myloops; "Sandstorm" 136; "Adagio For Strings" extended 140). Hard trance 145-150, home 147 (Internet Tattoo; "It's That Time" 146). Progressive trance 128-134 is closer to the melodic-house lane.
- Keys: harmonic minor for leads ("the raised 7th creates the exotic, emotional tension", Theory Helper), natural minor for pads and bass. A minor (Myloops), B minor (Sandstorm), Bb minor (Adagio extended), E minor, F minor. Studio default "A minor".

## Drum grid (16 steps = 1 bar)
```
kick     X... X... X... X...        vel 124, drumDecay 0.30, drive 0.25; tune the tail to the root or 5th (Myloops: 45-65 Hz, "F1 or G1") via drumTune
clap     .... X... .... X...        vel 108 plus a snare layer -6 dB, width 0.8
hat      xgxg xgxg xgxg xgxg        16ths, QUIET: "at least 12 dB below the kick" (Myloops); vel x 70 g 45, volume -14
openhat  ..o. ..o. ..o. ..o.        offbeats, vel 84, enters bar 25 of the intro
ride     x.x. x.x. x.x. x.x.        8ths in drops; second openhat track, drumDecay 0.45, volume -12; hard trance: offbeat ride ..x...x. with shuffle
shaker   xgxg xgxg xgxg xgxg        one perc loop in the intro (Myloops), perc, drumDecay 0.05, volume -12
roll     snare roll in the build: 8ths for 4 bars, 16ths for 2, 32nds (stepBeats 0.125) in the last bar, rising velocity 4 to 9
```
- Swing 0.50-0.53 uplifting; hard trance 0.54-0.58 on hats and ride only (kick straight). velVar 0.05, clapLateMs 0, pocketMs 0.
- Build ending: "second half of bar 232: silence, two full beats of nothing" (Myloops) = fill "cut".

## Bass recipe: the offbeat bass (the genre's engine)
- Intro pattern: kick on the beat, "a short 1/8-note bass on the offbeats, sidechained so the bass ducks cleanly under each kick" (Myloops): "..X. ..X. ..X. ..X." dur 0.3.
- Drop pattern (uplifting 138): "kick on every quarter, bass on every 16th between the kicks" = the e, and, a of every beat: ".XxX .XxX .XxX .XxX" with the "and" 8-12 velocity points lower (X 100, x 90), dur 0.12 (Myloops: decay 30-60 ms, sustain 0). Every 4 bars vary the last note of the bar.
- Synth (role "bass", the mid layer): wave "sawtooth", unison 1 (mono, no detune), glide 0.01, cutoff 900, resonance 1, envAmount 0.8, attack 0, decay 0.05, sustain 0, release 0.05, octave -1, fx.drive 0.3, fx.eq low -3 (Myloops: highpass 90-100 Hz, lowpass 4-6 kHz, saturate until it thickens).
- Sub (role "sub"): sine, same pattern or the offbeat 8ths, duck true. Master sidechainDb 10 (Myloops: 8-12 dB of reduction, ratio 4:1, attack fastest, release 100-140 ms at 140), sidechainReleaseMs 120.
- Hard trance: offbeat 8ths bass louder (volume +2) plus a hoover riff on the stab track.

## Harmony
| Progression | Chords in A minor | Use | Source |
|---|---|---|---|
| i - bVI - bIII - bVII | Am F C G | main drop | Myloops |
| bVI - bIII - bVII - i | F C G Am | breakdown teaser (same chords, new start) | Myloops |
| i - iv - bVII - V | Am Dm G E | bridge reharmonization (harmonic minor V) | Myloops |
| vi - IV - I - V, i - III - VII - IV, i - VI - III - VII, I - V - vi - IV | | Theory Helper's four | Theory Helper |
- Pads (role "pad"): wave "fatsawtooth", unison 4, spread 30, cutoff 2400 (automate 800 to 6000 over the breakdown), attack 0.8, release 1.5, volume -11, width 1, reverb 0.35 (Myloops: 3-4 s decay, damping 5 kHz), fx.eq low -6. Chords change every 2 bars in drops.
- Gated pad in builds: fx.gate 2 (8ths) then fx.gate 1 (16ths) for the last 4 bars.
- Supersaw stabs (role "stab"): wave "fatsawtooth", unison 4, spread 40, decay 0.25, on the offbeat 8ths with the bass, fx.delay {"time":"8n","feedback":0.4,"wet":0.3}.
- Plucks (role "arp"): wave "sawtooth", decay 0.15, sustain 0, 16ths on chord tones, delay "8n." wet 0.3; strings = a second pad an octave up at -16.

## Hook devices
1. The supersaw lead (role "lead"): wave "fatsawtooth", unison 4, spread 35, cutoff 4500 (automate 1500 to 6000 across the breakdown), attack 0.02, decay 0.3, sustain 0.7, release 0.5, glide 0.03, fx.delay "8n" wet 0.3 fb 0.45, reverb 0.3, width 1, volume -5. An 8- or 16-bar melody in harmonic minor, long notes on chord 9ths and 5ths; play it first on "epiano" in the breakdown (Myloops: "piano, plucked synth, soft-attack lead" first), then full.
2. The Sandstorm riff: a single-pitch 16th pluck line with octave jumps ("xxxx xxxx xxxx xxxx" on the arp track, accents every 3rd note, root then octave every 2 bars).
3. Counter-melody in the drop (arp on the 3rd and 5th), plus a key-change lift (transpose +1) for drop 2 if he wants "bigger".
4. Riser stack (Myloops bars 217-232): 8-bar white-noise riser (fill "riser"), gated pad 8ths, snare roll halving note values, a sub sine sliding down two octaves (sub with glide 2 over 2 bars), then two beats of silence (fill "cut").
5. Hard trance: hoover stab riff (stab unison 4, spread 60, drive 0.4) with a chanting vocal (audio) and a 909 offbeat ride.

## Arrangement (Myloops' 8-minute blueprint, and the studio's club edit)
| Section | Full (bars) | Club edit | Active | Fill | Energy |
|---|---|---|---|---|---|
| Intro | 32 | 16 | kick, offbeat bass 8ths, shaker; hats at 17, openhat at 25 | none | 0.3 |
| Groove | 32 | 16 | + ride, filtered pluck, bass to 16ths | none | 0.55 |
| Break | 16 | 8 | pad, pluck; kick out; fx sweep | riser | 0.4 |
| Breakdown | 48 | 32 | lead on epiano (first third), + strings and chords, + filtered kick (last third) | none | 0.35 |
| Build | 16 | 8 | riser, gated pad, snare roll, sub slide, 2 beats silence | cut | 0.8 |
| Drop | 32 | 32 | kick, clap, hat, openhat, ride, bass 16ths, sub, lead, counter, pads | none | 1.0 |
| Bridge | 16 | 8 | filtered lead, pad | none | 0.45 |
| Drop 2 | 32 | 32 | Drop + one layer (strings octave or arp) | none | 1.0 |
| Outro | 32 | 16 | kick, bass, hats stripping | none | 0.35 |
Full: 256 bars, 7:25 at 138, first drop at bar 145 (4:11). Club edit: 168 bars, 4:52, first drop at bar 81 (2:21). Trance is patient: energy stays under 0.5 for the first 40 percent.

## Mix targets
- Drop LUFS -8 to -6 (hard trance -7 to -5). Sub + low 0.50-0.65 (supersaws own the mids: lowMid + mid 0.22-0.32), highMid 0.08-0.15, air 0.04-0.09 (bright lane).
- Pump 0.50-0.75 (the offbeat bass plus 8-12 dB of duck reads as pump by design). Swing 0.50-0.53. Mud below 0.30 (eq low -6 on pads and leads; Myloops: bass-bus notch at the kick fundamental 55-65 Hz), harshness below 0.3, width 0.9-1 on lead and pads, kick, sub and bass mono.
- Hard trance: kick drive 0.45, sub + low 0.60-0.70, hats swung.

## References
1. Darude "Sandstorm" (1999, 136 BPM, B minor by most analyzers; the Rivas edit is in his crate): the single-pitch 16th riff, the hoover build, the DJ-tool shape.
2. Tiesto "Adagio For Strings" (2005, 140 BPM extended, Bb minor listed): a strings melody as the whole breakdown, a three-act build into one drop.
3. Marlon Hoffstadt / DJ Daddy Trance "It's That Time" (2024, 146 BPM, A minor listed): the hard-trance revival: gated vocal, hoover stab, 909 offbeat ride.

## Feel words
- "euphoric" / "bigger": pad unison 4 spread 35 width 1, lead octave layer at -6, reverb 0.4, breakdown +16 bars, snare roll to 32nds, drop 2 transpose +1.
- "harder" / "hard trance": tempo 147, kick drive 0.45 and drumTune +1, offbeat 8th bass +2 dB, hoover stab riff, offbeat ride with swing 0.56.
- "old school" / "Sandstorm": tempo 136, single-note 16th pluck riff with octave jumps, hoover stab, i - bVI - bVII only.
- "dreamy" / "breathier": fx.gate 2 on the pad, delay "8n." wet 0.4, 16-bar cutoff sweep, hats -16 dB, lead attack 0.1.
- "psy" / "rolling": tempo 140-142, bass 16ths pattern with resonance 3, kick drumDecay 0.22, no clap, filtered noise perc.
- "more drop": counter-melody arp, ride 8ths, strings octave, check sub + low lands 0.55-0.65 after the supersaws.

## Sources
- Myloops, Uplifting trance arrangement: the 8-minute blueprint bar by bar: https://www.myloops.net/how-to-arrange-an-uplifting-trance-track-from-start-to-finish
- Myloops, How to program an uplifting trance bassline that rolls: https://www.myloops.net/how-to-make-an-uplifting-trance-bassline
- Theory Helper, Best scales for trance: https://www.theoryhelper.com/genres/trance/scales
- Internet Tattoo, Hard trance DJs pushing the genre (145-150 BPM, hoover, 909 rides): https://www.internettattoo.com/blog/best-hard-trance-djs-right-now
- OBSCUUR, The complete guide to trance (2025 revival): https://obscuur.io/blogs/news/trance-music-from-90s-euphoria-to-2025s-epic-revival
- Tunebat / Beatport pages for Sandstorm, Adagio For Strings, It's That Time (BPM and key).
