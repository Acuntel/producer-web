# Lane: deep-house (Deep house and piano house: MAW, Kerri Chandler, Duke Dumont, Route 94, Shouse)

Why it is here: his crate holds the Shouse "Love Tonight" bootleg (measured 123 BPM, C minor), Bob Sinclar "World Hold On", Robin Schulz "Sun Is Shining", the Oliver Heldens "Gecko" bootleg, a Jax Jones remix and Cherub "Doses and Mimosas". These are deep and piano house at 120-125, one lane under his tech-house. The engine already has "epiano" and "organ" waves for it.

## Tempo and keys
- 120-125 BPM, home 123. Attack "Stripped Deep House" 120-125, "Rolling Deep House" 125, "Love Tonight" 123, "Need U (100%)" 124, "My Love" 120.
- Keys: C minor, F minor, A minor, Ab major, G minor. Minor 7 and minor 9 chords are the identity; Dorian under vocals. Studio default "C minor" or "F minor".

## Drum grid (16 steps = 1 bar)
```
kick     X... X... X... X...        vel 116, drumDecay 0.30, drumTune -1 (round, mid-range body; Attack adds an 808 under it)
clap     .... X... .... X...        vel 102, clapLateMs 10, reverb 0.2 (short room)
openhat  ..o. ..o. ..o. ..o.        vel 86 (the standard offbeat open hat, Attack)
hat      x.gx x.g. x.gx x.g.        closed hat "adds shuffle on the 8th and 16th divisions" (Attack Stripped)
shaker   xgxg xgxg xgxg xgxg        perc track, vel x 80 g 50, drumDecay 0.05
tom      ..x. .... x.x. ....        909 tom on the 3rd, 9th and 11th 16ths (Attack Rolling), perc, drumTune -5, drumDecay 0.12
afro     .x.. .... .x.. ....        afro hit on the 2nd and 10th 16ths (Attack Rolling), perc, drumTune +3, optional
```
- Swing 0.56-0.62. Attack quotes 50-60 for stripped and 60-70 for rolling; cap at 0.62 in this studio. velVar 0.1, pocketMs 0.
- Sparse variant for intro and breakdown: hat "..x. ..x. ..x. ..x.", no tom, no afro.

## Bass recipe
- Two flavors. A "deep walk" (role "bass"): wave "triangle", unison 1, cutoff 400, resonance 2, envAmount 1.5, decay 0.2, sustain 0.3, release 0.08, octave -1, fx.drive 0.15, duck true. Notes per bar: root on 1 (dur 1.5), root on and-of-2 (0.5), 5th on and-of-3 (0.25), b7 on a-of-3 (0.25) -> steps 1, 7, 11, 12. Pattern "X... ..x. ..xg ....".
- B "M1 organ bass" (piano house, Robin S "Show Me Love" family): role "bass", wave "organ", octave -1, attack 0.005, decay 0.1, sustain 0.8, release 0.05, cutoff 1200, fx.drive 0.1. Pattern on the offbeat 8ths with 16th pickups: "..X. ..X. X.X. ..xx" (steps 3, 7, 9, 11, 15, 16), vel 104/100/96/96/80/84, dur 0.22.
- Sub (role "sub"): sine on the roots, dur 1.5 on beat 1 and 0.5 on and-of-2, duck true, volume -6. Master sidechainDb 5, sidechainReleaseMs 120.

## Harmony
| Progression | Chords | Key | Source |
|---|---|---|---|
| i7 - bIIImaj7 - v7 | Fm7 Abmaj7 Cm7 | F minor, MAW "To Be In Love" (1997) | Attack Deep House Chords |
| i7 - v7 - iv7 | Am7 Em7 Dm7; Kerri Chandler G#m7 D#m7 C#m7 ("Come Home") | A minor / G# minor | Attack |
| bVImaj7 - v7 | Fmaj7 Em7 | A minor two-chord loop | Attack |
| i9 held | Cm9 | groove sections | Attack, Kerri Chandler guides |
- Voicings: minor 9 with the root omitted (3-5-7-9) in octave 4; drop the 7th an octave for a descending inner line (Attack); parallel third-inversion 7ths for movement (Kerri Chandler guide). Keep every chord's 7th.
- Rhodes stabs (role "stab" or "chords", wave "epiano"): on and-of-1 and and-of-3 (steps 3 and 11), dur 0.3, vel 96/84, fx.delay {"time":"8n.","feedback":0.25,"wet":0.15}, reverb 0.22, volume -8, fx.eq low -3 (the 250-400 Hz body is the mud risk).
- Piano house: epiano stabs on every offbeat 8th "..x. ..x. ..x. ..x." with a sustained chord change every 2 bars; organ chords (wave "organ", -10 dB, width 0.8) for the 90s lift.
- Pad under the chords at -14, wave "fatsawtooth", cutoff 1400, attack 0.5.

## Hook devices
1. One vocal phrase (audio clip, 2-4 bars) looped for the whole record with elements dropping in and out ("Love Tonight": one line, four chords, seven minutes).
2. Piano riff answering the chords: role "pluck", wave "epiano", octave 5, single-note 2-bar riff on chord tones, delay "8n" wet 0.2.
3. Filtered chord loop: chords cutoff automation 300 to 4000 across the build (the classic deep-house reveal).
4. Organ bass B as the hook itself (Duke Dumont, Robin S): the bass riff repeats unchanged; everything else moves.
5. Tom and afro perc entering at drop 2: the "jackin" lift.

## Arrangement (flatter than tech-house: grooves, not blasts)
| Section | Bars | Active | Fill | Energy |
|---|---|---|---|---|
| Intro | 16 | kick, hat(sparse), shaker, chords (cutoff 400) | none | 0.3 |
| Groove | 16 | + clap, openhat, bass, sub, stabs | riser | 0.6 |
| Break | 8 | chords, vocal, pad; kick out | riser | 0.4 |
| Drop | 16 | kick, clap, openhat, hat, shaker, bass, sub, stabs, vocal | none | 0.9 |
| Groove 2 | 16 | Drop minus vocal, plus tom | none | 0.75 |
| Breakdown | 16 | chords, vocal, pad, clap; no kick, no bass | roll | 0.35 |
| Build | 4 | + kick, hat; master lowpass 700 to 18000 | cut | 0.7 |
| Drop 2 | 24 | Drop + piano riff or organ chords + afro perc | none | 1.0 |
| Outro | 16 | kick, hat, bass, chords fading | none | 0.4 |
Total 132 bars, 4:17 at 123; first drop at bar 41 (1:20). Drop 1 energy 0.9, groove sections 0.75, no hard cut before drop 1.

## Mix targets
- Drop LUFS -10 to -8 (one to two LU under tech-house). Sub + low 0.52-0.66, lowMid + mid 0.20-0.32 (chords and Rhodes body), highMid 0.06-0.12, air 0.03-0.07.
- Pump 0.25-0.45 (sidechainDb 5, release 120). Swing 0.56-0.62. Mud below 0.32 (eq low -3 on chords and stabs), harshness below 0.2, width 0.6-0.9 on chords and hats, kick, bass and sub mono.
- Attack's stripped recipe: an 808-style low layer under the kick with the highs rolled off; in this studio that is the sub track playing the kick's root on beat 1, dur 0.4, vel 90.

## References
1. Shouse "Love Tonight" (2017, 123 BPM, C minor; in his crate as a bootleg): one vocal line and four chords looped for seven minutes.
2. Duke Dumont and A*M*E "Need U (100%)" (2013, 124 BPM, F minor): piano-house stabs, a vocal chop hook, organ-style bass.
3. Route 94 and Jess Glynne "My Love" (2014, 120 BPM, Ab major): sub-heavy deep bass, Rhodes chords, filtered vocal, the "deep" template.
- Masters At Work "To Be In Love" (1997) for the Fm7 Abmaj7 Cm7 loop (Attack).

## Feel words
- "deeper": chords wave epiano cutoff 1400, bass A sustain 0.5 and longer notes, remove the openhat, LUFS target -10, add pad at -16.
- "piano house" / "90s": epiano stabs on every offbeat 8th, organ bass B, vocal chop, tempo 124, organ chords in drop 2.
- "soulful": m9 voicings, a 7th on every chord, vocal audio phrase, clap reverb 0.25, swing 0.6.
- "jackin" / "bouncier": swing 0.60, tom perc in, bass A pickups as 16ths, clapLateMs 12, hats "x.gx" ladder louder.
- "smoother": velVar 0.05, remove the tom, pad at -14 under the chords, stabs dur 0.4.
- "summer" / "sunset": major key (Ab major), IVmaj7 - iii7 - ii7 - Imaj7 loop, openhat +2 dB, delay on the stabs wet 0.25.

## Sources
- Attack Magazine, Passing Notes: Deep House Chords: https://www.attackmagazine.com/technique/passing-notes/passing-notes-deep-house-chords/
- Attack Magazine, Kerri Chandler Chords guide: https://www.attackmagazine.com/technique/passing-notes/kerri-chandler-chords/
- Attack Magazine, Beat Dissected: Stripped Deep House: https://www.attackmagazine.com/technique/beat-dissected/deep-house-stripped-workout-beat-dissected/
- Attack Magazine, Beat Dissected: Rolling Deep House: https://www.attackmagazine.com/technique/beat-dissected/rolling-deep-house/
- MusicRadar, Chicago house spread piano chords; Gearspace, 90s house piano (M1 Organ 2, Robin S): https://www.musicradar.com/how-to/how-to-create-classic-chicago-house-spread-piano-chords
- Tunebat pages for Love Tonight, Need U (100%), My Love (BPM and key).
