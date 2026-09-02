# Lane: melodic-house (Melodic house and techno: Afterlife, Anyma, ARTBAT, Solee)

Why it is here: his crate holds Anyma "Beautiful", Solee "Pink Panther" (measured 123 BPM), Tiesto "The Business" and the Coldplay "Sky Full Of Stars" extended, and "make it epic" is the most likely ask beyond tech-house. Numbers below are quoted from the sources at the bottom; anything marked (studio) is a translation into this studio's vocabulary, not a measured fact.

## Tempo and keys
- Range 120-126 BPM, home 124. Beatportal's guide says 122-125, NI's melodic techno build runs at 122, "Welcome To The Opera" is 125, ARTBAT "Horizon" 124, Solee "Pink Panther" 123.
- Keys: A minor is the textbook key (Beatportal), NI builds in Ab minor, both Anyma and ARTBAT references sit in F minor. Natural minor (Aeolian) for pads and bass, Dorian for a lifted vocal, harmonic minor's raised 7th only at a lead cadence.
- Studio call: default "F minor" or "A minor"; do not go major unless he asks for "happy".

## Drum grid (16 steps = 1 bar; X 120, x 92, g 45, o 88, digits = velocity tenths)
```
kick     X... X... X... X...        every beat, vel 122, drumDecay 0.30, drumTune 0 (clean, not hard)
clap     .... X... .... X...        beats 2 and 4, vel 104; second clap layer -8 dB, clapLateMs 6
hat      x.g. x.gg x.g. x.gx        8ths with 16th ghosts; NI's grid lands hats on 1, e-of-1, a-of-1, 2, e-of-2 ...
openhat  .... .... .... .... | ..o. ..o. ..o. ..o.   open hats on the offbeats every SECOND bar only (Beatportal)
perc     ...x x... ..x. xxx.        NI shaker: a-of-1, 2, e-of-2, and-of-3, 4, e-of-4, a-of-4 (shuffled percs)
```
- Swing 0.52-0.56. Melodic techno is nearly straight; the shuffle lives in the perc track, not the hats. velVar 0.08, pocketMs 0.
- Intro and breakdown variant: hats "sparse" = "..x. ..x. ..x. ..x.", no clap in the breakdown, kick out.

## Bass recipe (role "bass" + role "sub")
- Beatportal: "moog-style synth", 1/8 and 1/16 rhythms on the chord roots, sidechained to the kick. NI: root G#1 with four 16ths at the top of each bar plus an accent note on a-of-4 every second bar, root moving to B1 in bars 3-4 and C#2 in bars 6-7 (i, bIII, iv).
- Studio synth: wave "sawtooth", unison 1, cutoff 220, resonance 2, envAmount 1.8, decay 0.18, sustain 0.4, release 0.06, glide 0.02, octave -1, fx.drive 0.2, duck true.
- Pattern A "pulse" (8 beats): offbeat 8ths on the root, "..x. ..x. ..x. ..x." vel 104/96, dur 0.3; chord root changes every 2 bars.
- Pattern B "roll" (drop 2): 16ths ".xxx .xxx .xxx .xxx" with vel ladder 110/80/95/70 (digits "8697" style), dur 0.18. The beat itself stays silent so the kick owns it.
- Sub: sine on the roots, one note per bar (dur 3.5), vel 100, duck true. Master sidechainDb 8, sidechainReleaseMs 150: the pads must breathe with the kick.

## Harmony (Roman numerals in the minor key)
| Progression | Chords in A minor | Where | Source |
|---|---|---|---|
| i - bVI - bIII - bVII | Am F C G | drop, breakdown ("the sound of Tale Of Us, Anyma, Afterlife") | Beatportal, Chordoo |
| i - iv - v - bIII | Am Dm Em C | darker drop 2 ("haunting") | Beatportal |
| i - bVII | Am G | intro/groove two-chord loop | Chordoo, Myloops |
| i - bVII - bVI | Am G F | build into the drop | Myloops |
- Harmonic rhythm: one chord every 2 bars over an 8-bar loop (NI). Never faster than 1 bar.
- Pad: wave "fatsawtooth", unison 3, spread 26, cutoff 1200 rising to 2400 by automation, attack 0.6, release 1.2, volume -12, fx.width 0.9, reverb 0.35. Voicing: root-5th-octave-9th spread across octaves 3-5, no 3rd in the pad (the lead carries the 3rd).
- Arp (role "arp"): chord tones 1-5-8-10 as 16ths in octave 5, wave "sawtooth", decay 0.12, sustain 0.1, fx.delay {"time":"8n.","feedback":0.35,"wet":0.25}, reverb 0.3, volume -9.
- Stabs are rare in this lane; use "chords" with epiano only for the breakdown's "piano first" statement.

## Hook devices
1. The lead melody IS the drop. Role "lead", wave "fatsawtooth", unison 4, spread 30, cutoff 3500 (automate 1500 to 6000 across the breakdown), attack 0.05, decay 0.3, sustain 0.6, release 0.4, glide 0.06, fx.delay 8n wet 0.25 fb 0.4, reverb 0.3, width 0.9. Eight-bar phrase, long notes on the 9th and the 5th, one raised-7th (harmonic minor) approach into the tonic at bar 8.
2. Arp under the lead, locked to the chord roots, mutates every 8 bars (swap the top note, add a 16th rest).
3. Vocal-like pad line an octave above the pad at -18 dB (strings feel).
4. Reverb swell and a 16-bar master lowpass from 400 Hz to 18 kHz into the drop; automate pad cutoff 900 to 5000 over the build.
5. Solee-style pluck hook: role "pluck", wave "triangle", decay 0.25, delay "8n" wet 0.3, a 2-bar motif that changes one note every 8 bars.

## Arrangement (Beatportal 16-bar cells and Myloops long-form, compressed for the studio)
| Section | Bars | Active | Fill | Energy |
|---|---|---|---|---|
| Intro | 16 | kick, hat(sparse), perc, pad (cutoff 400 to 1400) | none | 0.3 |
| Groove | 16 | + clap, bass A, arp teaser (cutoff 800) | riser | 0.55 |
| Break | 8 | pad, lead (soft, epiano or filtered), no kick | cut | 0.4 |
| Drop | 32 | kick, clap, hat, openhat, perc, bass A, sub, arp, lead, pad (-14) | none | 1.0 |
| Breakdown | 32 | pad, lead, arp, clap(half); no kick, no bass | roll | 0.35 |
| Build | 8 | + kick, hat, master lowpass 500 to 18000 | cut | 0.75 |
| Drop 2 | 32 | Drop + bass B "roll" + pad louder or a second arp octave | none | 1.0 |
| Outro | 16 | kick, hat, bass A, pad fading | none | 0.4 |
Total 160 bars, 5:10 at 124. First drop at bar 41 (1:19). Compact default: 8/8/8/16/8/4/16/8 also works; keep the breakdown at least as long as the drop.

## Mix targets (this studio's measured terms)
- Drop integrated LUFS -9 to -7. Sub + low 0.55-0.68 (leads and pads must show: lowMid + mid 0.18-0.30). highMid 0.06-0.12, air 0.03-0.08.
- Pump 0.35-0.60 (sidechainDb 8, release 150; pads and arp duck, lead ducks less: set lead duck true but volume high). Swing 0.52-0.56.
- Mud below 0.30 (pad cutoff and the sub-octave body in chords are the risk), harshness below 0.25, width 0.6-0.9 on pads and lead, bass and sub mono.
- Non-bass elements sit above 120 Hz (Beatportal: high-pass around 120 Hz): eq low -6 on pad, arp, lead.

## References
1. Anyma and Grimes "Welcome To The Opera" (2023, 125 BPM, F minor): the drop is a melody with an orchestral build; the breakdown is longer than the drop.
2. ARTBAT "Horizon" (2020, 124 BPM, F minor): rolling bass and arp locked on the roots, one lead line, 32-bar phrases.
3. Solee "Pink Panther" (2017, 123 BPM, E major listed; measured 123 BPM in his crate): a progressive pluck hook that changes one note every 8 bars over eight minutes.

## Feel words (what he says -> the move)
- "epic" / "cinematic": pad attack 0.8, add a strings pad an octave up at -18, reverb 0.4, breakdown to 32 bars, master lowpass sweep 16 bars.
- "darker": switch to i - iv - v - bIII, pad cutoff 800, lead uses the raised 7th only once, add sub octave, hats -3 dB.
- "more emotional": slow the harmonic rhythm to 2 bars per chord, lead rests on the 9th, remove the openhat, velVar 0.1.
- "driving" / "rolling": bass to pattern B, hats to 16ths ladder "xgxg", sidechainDb +2, perc louder.
- "spacey" / "airy": arp delay 8n. wet 0.35 and width 1, open the pad cutoff to 4000, hat reverb 0.15.
- "hypnotic": two-chord loop i - bVII, no clap, ride (second openhat, drumDecay 0.5) on quarters, only automation changes for 32 bars.

## Sources
- Beatportal, Step-by-step melodic house and techno (Anyma, Miss Monique, ARTBAT, Bodzin): https://www.beatportal.com/articles/899368-step-by-step-guide-to-creating-a-melodic-house-techno-track-anyma-miss-monique-artbat-stephan-bodzin
- Native Instruments, How to make a melodic techno track: https://blog.native-instruments.com/melodic-techno/
- Chordoo, Melodic techno chord progressions: https://www.chordoo.com/blog/melodic-techno-chord-progressions-for-dark-atmosphere
- Myloops, Melodic techno chords and melodies: https://www.myloops.net/how-to-create-melodic-techno-chords-and-melodies
- Tunebat / Beatport pages for Welcome To The Opera, Horizon, Pink Panther (BPM and key).
