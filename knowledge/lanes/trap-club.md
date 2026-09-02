# Lane: trap-club (Trap and hip-hop club edits: Atlanta 808s, the DJ-pool cuts that fill his crate)

Why it is here: more than a hundred of his 332 measured tracks are trap and hip-hop (Travis Scott "FE!N" measured 147.7, Playboi Carti "Magnolia" 162.9, T.I. "24's", GloRilla, Drake, Future, Lil Uzi, Kendrick). His DNA lanes "dnb-or-halftime" (160-180, n = 45: F minor 20%, LUFS -9.1, sub + low 0.59, swing 0.567) and the 136-148 half of "hard-house" are mostly these records at double time. Nothing in his crate is real drum and bass; this is the lane those numbers describe.

## Tempo and keys (write it at double time)
- Felt tempo 65-90 BPM; the studio writes 130-170 grid BPM, home 150 (felt 75). Reasons: the DNA measured his records at 136-180, the tempo op and the blueprint check expect at least 100, and at 150 the 16th grid gives the 32nd-note hat rolls as plain 16ths. NI: "130 to 200 BPM", example at 140, "industry standard 140 = felt 70". Isolate Audio: 140-180 grid, 70-95 felt.
- The snare or clap lands on beat 3 only (step 9): the half-time backbeat. That is the whole feel.
- Keys: minor. F minor (his lane's top key), Eb minor (FE!N as measured in his crate), D minor (Mask Off), E minor (Magnolia), C minor. Harmonic minor and Phrygian for darkness, minor pentatonic for flute and bell hooks. Studio default "F minor".

## Drum grid (16 steps = 1 grid bar at 150; one grid bar = half a felt bar)
```
kick     X... .... .... ..x. | ..x. .... .... ....   NI: kicks on the 1st, 8th and 10th 8th-notes of a 2-bar loop; vel 120/96/104
snare    .... .... X... ....        beat 3 every bar, vel 118; layer clap (clap track same step, vel 100, width 0.7)
hat      x.x. x.x. x.x. x.x.        straight 8ths, vel 84/70 alternating (NI)
hat roll .... .... .... 5678        16ths in the last beat of bars 2 and 4 with rising velocity (NI: 3-note rolls, middle notes quieter)
hat 32nd second hat track, stepBeats 0.125, "gxgxgxgx" in the last beat of bar 4 only (Isolate: 32nds for rapid rolls)
hat trip third hat track, stepBeats 0.1667, "xgxxgx" on the last beat of bar 8 (1/16T fills)
openhat  .... .... .... ..o. | .... .... .... ....   and-of-4 every second bar, vel 80
perc     .... ..g. .... ....        rim ghost on and-of-2, vel 45; optional snap on step 13 in bar 4
```
- Swing 0.50-0.54 (straight; the swing is velocity). velVar 0.08, clapLateMs 0-5, pocketMs 0. "Program velocity changes on every hi-hat hit, rolls accelerate low to high" (Isolate). Rolls at the ends of bars 2 and 4, never every bar.
- Fill bar (bar 4 and 8): snares replace the hat roll (NI: E2 snares in the bar-4 fill): "........ ....xxXX" on the snare track.

## Bass recipe: the 808 is the bass and the sub
- Role "bass": wave "sine", octave -1, cutoff 1500 (let the harmonics through), resonance 0.5, envAmount 0, attack 0.005, decay 0.6, sustain 0.7, release 0.25, glide 0.06, fx.drive 0.45, duck false, volume -1. No separate sub track: the 808 owns 40-60 Hz. Kick: drumTune +3, drumDecay 0.18 (short, high-passed feel) so it does not fight it.
- Pattern (2 grid bars = 1 felt bar): root on beat 1 (dur 2), pickup on a-of-3 (step 12, dur 0.25), 5th or b7 on the and-of-4 of bar 2 (step 15, dur 0.5) -> "X... .... ...x ..x." then bar 2 "x... .... .... ..x.". NI sequences C2 and G2. Slides: overlap two notes (glide fires), at most one slide per 4 bars ("glide selectively so slides feel like events", Isolate). Shorten decay to 0.35 when notes stack.
- Master sidechainDb 0-3, sidechainReleaseMs 80. Trap does not pump; kick and 808 hit together and the 808 rings.

## Harmony (dark two-to-four chord loops, 2 grid bars per chord)
| Progression | Chords in F minor | Feel |
|---|---|---|
| i - bVI | Fm Db | the default trap loop |
| i - bVII - bVI | Fm Eb Db | melodic, Travis-style |
| i - iv | Fm Bbm | brooding |
| i - bII | Fm Gb | Phrygian, drill-dark |
- Pad: wave "pwm" or "fatsawtooth", unison 2, cutoff 1400, attack 0.3, release 0.8, volume -14, reverb 0.4, width 0.9.
- Bells and plucks (role "pluck"): wave "sine" or "triangle", decay 0.4, sustain 0, fx.delay {"time":"4n","feedback":0.3,"wet":0.2}, reverb 0.45. Counter melody on root, octave, 5th, minor 7th (NI).
- Flute lead (role "lead"): wave "sine", attack 0.04, release 0.3, glide 0.05, pentatonic, one 2-bar phrase repeated with a change every 4th bar (the "Mask Off" device).

## Hook devices
1. A 2-bar melodic motif (flute, bell, or one synth stab) repeated for the whole record, one note changed every 4th bar.
2. The 808 slide as an event before the hook.
3. Chant and ad-lib one-shots (audio) answering the motif ("FE!N": one stab riff on the 808 rhythm plus a chant).
4. Hat roll plus snare fill into bar 1 of the hook; pitch-drop fx (fx role, or an audio one-shot reversed) on the bar before.
5. Drop-out bar: everything but the vocal and the 808 for one felt bar, then the full hook.

## Arrangement (radio and club edit at 150 grid BPM; grid bars = felt half-bars)
| Section | Bars | Active | Fill | Energy |
|---|---|---|---|---|
| Intro | 16 | melody alone (pad, lead), or drums-only DJ intro | none | 0.3 |
| Verse | 16 | + 808, hat, snare; lead filtered (cutoff 1200) | none | 0.6 |
| Drop (hook) | 16 | + openhat, rolls, stabs, ad-libs; energy 1 | none | 1.0 |
| Verse 2 | 16 | Drop minus stabs; hat variant | none | 0.65 |
| Drop 2 | 16 | Drop + fills + a second bell | none | 1.0 |
| Bridge | 8 | pad and vocal; no drums | riser | 0.35 |
| Drop 3 | 16 | Drop 2 + 808 slides | cut | 1.0 |
| Outro | 8 | drums and 808 stripping | none | 0.4 |
Total 112 grid bars, 2:59 at 150; first hook at bar 33 (0:51). Name the hooks "Drop" so the ears label them. A club edit adds 16 drum-only grid bars at the front.

## Mix targets
- Drop LUFS -8 to -6 (Travis Scott records sit near -8; his lane p50 -9.1). Sub + low 0.60-0.75 (808-led; measured p50 0.59 with sub 0.27, low 0.29). lowMid + mid 0.12-0.22, highMid 0.08-0.15 (crisp hats), air 0.03-0.08.
- Pump 0.10-0.30. Swing 0.50-0.54. 808 peaks 2-3 dB under the kick transient, kick short. Mud below 0.3, harshness below 0.25, width 0.9 on pads, 808 and kick mono.
- Known conflict: kickDensity reads 1.5-2 per grid bar here and the drums step check wants at least 3 in the drop; the tech-house law "kick on every beat" is also off. The integrator should lane-gate those checks.

## References
1. Future "Mask Off" (2017, 150 BPM grid, felt 75, D minor by most analyzers; Metro Boomin): a flute loop over sparse 808s and rolling hats.
2. Travis Scott and Playboi Carti "FE!N" (2023, 148 BPM, F# minor listed, Eb minor as measured in his crate): one synth stab riff on the 808 rhythm plus a chant, mosh energy.
3. Playboi Carti "Magnolia" (2017, 163 BPM, E minor listed; Pi'erre Bourne): the bounce, 808 slides, triplet hat rolls.

## Feel words
- "harder" / "knock": 808 drive 0.6, kick drumTune +2 and volume +1, clap layer +2 dB, hat velocity ladder wider (x 100, g 40).
- "darker": i - bII Phrygian pad, cutoff 900, bells an octave down, reverb 0.5, remove the openhat.
- "bouncier" / "Pi'erre": 808 pickups on steps 12 and 16, glide 0.1 on every third note, triplet hat rolls, tempo 160.
- "spacey" / "Travis": pad width 1 and reverb 0.5, delay "4n" on the lead, pitch-drop fx before the hook, ad-lib one-shots.
- "drill": tempo 140-146, sliding 808 on the and-of-3 and the 16th before 4 (steps 11 and 12 in bar 2), hats "x.xx.xx.x.xx.x.x", darker chant.
- "slow it down": tempo 130-136 grid (felt 65-68), 808 sustain 0.8, hats 8ths only, one roll per 8 bars.

## Sources
- Native Instruments, How to make a trap beat: https://blog.native-instruments.com/how-to-make-a-trap-beat/
- Isolate Audio, Trap drum patterns: https://isolate.audio/articles/trap-drum-patterns
- Audeobox, How to make trap beats (140 BPM half-time, 32nd rolls): https://www.audeobox.com/learn/ableton/how-to-make-trap-beats-in-ableton/
- Freshly Baked Studios, Average LUFS by genre (hip-hop and trap -7.3 to -9.4): https://freshlybakedstudios.com/blog/average-lufs-by-genre
- Mastering The Mix, How to mix 808s; Integraudio, How loud should bass and 808s be: https://www.masteringthemix.com/blogs/learn/how-to-mix-808s-that-bang
- Tunebat / SongBPM pages for Mask Off, FE!N, Magnolia (BPM and key).
