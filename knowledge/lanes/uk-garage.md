# Lane: uk-garage (UK garage 2-step: MJ Cole, Artful Dodger, PinkPantheress, Conducta, Y U QT)

Why it is here: the shipped hard-house lane covers speed garage and 4x4 at 140-145 (KETTAMA, Interplanetary Criminal, Sammy Virji). When he says "garage but skippy" or names PinkPantheress (Troye Sivan "Rush" ft PinkPantheress is in his crate), he means 2-step at 128-138: the kick leaves beat 3, the snare stays on 2 and 4, and everything swings. Attack's UKG, Rolling 2-Step and Garage Shuffle dissections are already summarized in knowledge/process/20-drums.md; this doc adds the lane numbers and the studio recipe.

## Tempo and keys
- 128-138 BPM, home 132. NI builds at 132, MusicRadar at 127, "Re-Rewind" 130, "Boy's a liar" 133, MJ Cole "Sincere" 132 as played (databases list 66). Attack: UKG 124-132, rolling 2-step 122-128.
- Keys: A minor (NI's vocal), E minor (Re-Rewind), F major (Boy's a liar), Ab major (Sincere), Bb minor. Jazzy minor 7 and 9 chords; R&B key changes up a semitone for the last drop. Studio default "A minor".

## Drum grid (16 steps = 1 bar; swing applies to every offbeat 16th)
```
kick     X... .... ..X. ....        beat 1 and the and-of-3 (NI, MusicRadar); vel 118/104, drumDecay 0.22
kick B   .... .... ..X. ...x        bar 2 of a rolling 2-step: no kick on beat 1 (Attack Rolling 2-Step)
snare    .... X... .... X...        beats 2 and 4, vel 110; layer clap -6 dB and a late clap (clapLateMs 8)
ghost    .... .... .... ...g        ghost snare on the last 16th, vel 45 (Attack Garage Shuffle)
openhat  ..o. ..o. .... ..o.        halfway through beats 1, 2 and 4 (NI), vel 90, swung
hat      x... ...g xg.. ....        on 1 and 3 plus hits "slightly after the 8th and 10th 16ths" (NI); the swing supplies the lateness
rim      ...x .... ...x ....        rimshot call and response (Attack UKG), perc, second hit drumTune +2
shaker   gxgx gxgx gxgx gxgx        optional cabasa brightness, perc, vel x 70 g 40
```
- Swing 0.60-0.66 (MPC 68/69 maps to 0.66; MusicRadar sets 50-60%). velVar 0.1, clapLateMs 8, pocketMs 0.
- Sparse variant for intro: kick, hat, openhat only. Breakdown: no kick, snare stays.

## Bass recipe (sub-led; the bass is the second hook)
- A "Dred" reverse-swell bass (NI: a jungle-style bass with an opening lowpass so it "sounds like it's playing in reverse"): role "bass", wave "sawtooth", unison 1, cutoff 180, resonance 4, envAmount 2.2, attack 0.12, decay 0.3, sustain 0.5, release 0.1, glide 0.02, octave -1, fx.drive 0.2, duck true. A three-note riff looped over 8 bars (NI): root, b7, 5th (A1, G1, E1) on beat 1 (dur 1), and-of-2 (0.5) and the a-of-3 (0.5): "X... ..x. ...x ....".
- B "organ bass" (MusicRadar: square an octave down with ring mod and drive): role "bass", wave "organ", octave -1, attack 0.005, sustain 0.8, release 0.05, cutoff 1500, fx.drive 0.15. Offbeat 8ths with pickups: "..X. ..X. ..X. .xX." vel 104/100/100/80/104, dur 0.22.
- Sub (role "sub"): sine two octaves down (MusicRadar), roots only, dur 2 on beat 1 and a-of-3, duck true, volume -4. Master sidechainDb 3-4 (little pump; the skip is the groove), sidechainReleaseMs 90.
- "Elongated notes in F#" is the Virji speed-garage trick; it belongs to the hard-house lane, not here.

## Harmony (jazzy, R&B-derived)
| Progression | Chords | Use |
|---|---|---|
| i9 - iv9 | Am9 Dm9 | groove and drop loops (studio, from the jazz-chord convention in DJ Mag's Virji feature) |
| i7 - bVImaj7 - bIII - bVII | Am7 Fmaj7 C G | vocal drop |
| ii7 - V7 - Imaj7 | Bm7 E7 Amaj7 (A major) | R&B breakdown, then modulate up 1 semitone for drop 2 (transpose op +1) |
| I - V - vi - IV | F C Dm Bb (F major) | pop-garage, "Boy's a liar" family |
- Chords role wave "epiano" or "organ", 4-note 9ths in octave 4, stabs on and-of-2 (step 7) and the 16th before beat 4 (step 12): ".... ..x. ...x ....", dur 0.3, vel 100/88, delay "8n" wet 0.12 fb 0.35, reverb 0.2, volume -9.
- Pad under at -14 (fatsawtooth, cutoff 1200, attack 0.4). Glassy pluck (role "pluck", wave "pwm", decay 0.2, delay "16n" wet 0.2) skipping 16ths on chord tones.

## Hook devices
1. Chopped vocal (audio, oneShot): one or two syllables pitched -2 to +5 semitones, placed on the skip (steps 3, 6, 11, 14); NI uses "two vocal chops", one "accenting the second beat" and one "stuttered, swung motif".
2. Todd Edwards micro-chop: many 1/16 vocal pieces stepping through pitches (audio oneShot notes at midi 58-65).
3. Wobbly organ riff (bass B doubled an octave up on "stab" wave "organ").
4. Rim call and response with loose timing (velVar 0.12 on the rim track).
5. Hats sent to a 1/8 echo (fx.delay "8n" wet 0.12 fb 0.4 on the hat track), the Interplanetary Criminal move.

## Arrangement (NI's build: drop at bar 25, beats out for the bar before it, bassless outro at bar 73)
| Section | Bars | Active | Fill | Energy |
|---|---|---|---|---|
| Intro | 16 | kick, hat, openhat, filtered vocal chop | none | 0.3 |
| Groove | 8 | + snare, rim, bass A, sub | none | 0.55 |
| Build | 8 | + chords, second vocal chop; hats cutoff up; last bar silent | cut | 0.7 |
| Drop | 32 | kick, snare, ghost, openhat, hat, rim, bass A, sub, chords, chops | none | 1.0 |
| Breakdown | 16 | chords, pad, vocal, snare; kick and bass out; bass cutoff closes | roll | 0.35 |
| Build 2 | 8 | + kick; snare roll; backspin fx | cut | 0.75 |
| Drop 2 | 32 | Drop + bass B or an octave variant + new chop; optional transpose +1 | none | 1.0 |
| Outro | 16 | drums and chops, then bass out (bassless last 8) | none | 0.4 |
Total 136 bars, 4:07 at 132; first drop at bar 33 (0:58). PinkPantheress short form: drop at bar 9, total 64 bars.

## Mix targets
- Drop LUFS -9 to -7. Sub + low 0.55-0.72 (sub-led; the nearest measured lane, his hard-house 136-148, has sub p50 0.347 and sub + low 0.591). lowMid + mid 0.15-0.25, highMid 0.06-0.12 (rims, hats), air 0.03-0.07.
- Pump 0.15-0.35 (sidechainDb 3-4). Swing 0.60-0.66. Kick short (drumDecay 0.22) so the sub owns 45-60 Hz. Clap width 0.8, chords width 0.7, bass and sub mono. Mud below 0.3.
- Kick density reads 2 per bar; that is correct for this lane. The tech-house law "kick on every beat" does not apply.

## References
1. Artful Dodger and Craig David "Re-Rewind" (1999, 130 BPM, E minor): the 2-step skip under an R&B vocal, the template.
2. MJ Cole "Sincere" (1998, 132 BPM as played, Ab major): jazz chords, rolling bass, sampled vocal cuts.
3. PinkPantheress "Boy's a liar" (2022, 133 BPM, F major): 2-step revival, a tiny pluck hook, a two-minute pop structure.
- MusicRadar's picks: Sweet Female Attitude "Flowers" (2000) as the prototype, Y U QT "U BELONG 2 ME" (2022) as the modern one.

## Feel words
- "skippy" / "more shuffle": swing 0.64, add ghost hats "g" on steps 6 and 14, rim call and response, velVar 0.12.
- "darker" / "dubby": bass A cutoff 150 resonance 6, remove the epiano, sub an octave down, reverb 0.25 on the snare.
- "bubbly" / "happy": major key, epiano 9ths, vocal chop +3 semitones, openhat +2 dB, pluck hook.
- "4x4 it": kick on every beat; hand the drums to the hard-house / speed-garage recipe and keep the chords.
- "old school" / "90s": organ bass B, organ chords, tempo 130, vinyl crackle (perc track with crush 8, vel 30, every 16th).
- "PinkPantheress": tempo 133, pluck hook on 16ths, breathy vocal audio, drop at bar 9, total under 2:30.

## Sources
- Native Instruments, Everything you need to know about UK garage: https://blog.native-instruments.com/uk-garage-music/
- MusicRadar, How to make a UK garage beat: https://www.musicradar.com/how-to/uk-garage-tutorial
- Attack Magazine, Beat Dissected: UK Garage, Rolling 2-Step, Garage Shuffle (summarized in knowledge/process/20-drums.md).
- DJ Mag, Sammy Virji cover feature (jazz chords, R&B key changes): https://djmag.com/features/sammy-virji-global-garage-phenomenon-interview
- Tunebat pages for Re-Rewind, Sincere, Boy's a liar (BPM and key).
