# Lane: jersey-club (Jersey club: MCVertt, DJ Sliink, UNIIQU3, and the R-You / DJ TAJ / BERGE edits he plays)

Why it is here: his crate has DJ TAJ "WORK (Jersey Club Remix)" (measured 139.7 BPM, B major), two BERGE "Cool Off" Jersey club remixes (143.6), the R-You "TGIF" slam edits (139.7), Lil Uzi Vert "Just Wanna Rock" (150), and Ice Spice. They land in his measured hard-house DNA lane (136-148 BPM, n = 53: sub p50 0.347, sub + low 0.591, LUFS -8.8, swing 0.579, pump 0.078). This is the lane for "flip this" and "Jersey it".

## Tempo and keys
- 130-150 BPM, home 140. NI builds at 142, Orphiq: "130 to 140, a lot of tracks at or near 140", "Just Wanna Rock" 150, Drake "Sticky" 137, Ice Spice "Munch" (Jersey drill) 166.
- Keys come from the source vocal: B major, F# minor, D major, Bb minor are common in his edits. Chants are minor pentatonic; many records have no chords at all. Studio default "F minor" (NI's bass sits on F2).
- Straight time. Swing 0.50-0.52; the bounce is written into the kick placement, not the swing.

## Drum grid (16 steps = 1 bar). The kick IS the genre.
```
kick     X... X... X..X ..X.        five kicks at 16th steps 1, 5, 9, 12, 15 (gaps 4-4-3-3-2); vel 120,112,116,104,96
snare A  .... .... X..X ....        bars 1 and 3: steps 9 and 12, vel 100 (NI)
snare B  .... .... X.xX ....        bars 2 and 4: steps 9, 11 (vel 84), 12 (NI)
hat      .... x... .... x...        closed hats on beats 2 and 4 only (NI; Orphiq: "sparse compared to trap")
squeak   ..x. ..x. ..x. .x..        bed squeak between the kicks: perc track drumTune +10, drumDecay 0.05, pan 0.3 (or an uploaded one-shot)
crash    X... .... .... ....        first beat of the drop only (role "fx" or openhat drumDecay 0.6, vel 110)
roll     8th-triplet hat fill in the last beat of bars 4 and 8: grid stepBeats 0.3333, "........ ...xxx" style, vel ladder 5,7,9
```
- Orphiq: "nudge the fourth and fifth kicks and vary velocities"; the fifth kick "is doing the work of a pickup, so give it the shortest tail" (write it dur 0.08). The 808 doubles the kick for sub weight.
- velVar 0.06, clapLateMs 0, pocketMs 0. Snare sits "against the kick run rather than on a flat backbeat".
- Baltimore variant (triplet feel): kick on an 8th-triplet grid, stepBeats 0.3333, "X..X..X.X.X." for one bar; verify by ear.

## Bass recipe (the kick is the bass; the 808 follows the kick rhythm)
- 808 (role "bass"): wave "sine", octave -1, cutoff 1200, resonance 0.5, envAmount 0, attack 0.005, decay 0.35, sustain 0.5, release 0.2, glide 0.05, fx.drive 0.4 (distortion is how it survives phone speakers), duck false, volume -2.
- Notes on the kick steps 1, 5, 9, 12, 15 (dur 0.2, 0.2, 0.2, 0.15, 0.1), root for four bars, then bIII for one bar and bII for one bar (NI: F2 bars 1-4, G#2 bar 5, G2 bar 6). Slides: overlap the last two notes so the glide fires into the downbeat.
- Sub (role "sub"): sine root on steps 1 and 9 only, dur 0.6, vel 96, duck false. Master sidechainDb 2, sidechainReleaseMs 80. Nothing pumps; the kick density is the energy.

## Harmony (minimal by design)
| Device | Notes | Use |
|---|---|---|
| Root-octave hits on the kick rhythm | lead plays F3 and F4 following the kick minus the final note per bar (NI) | drop |
| One chord | i (minor triad) or i5 held under the chant | groove |
| Pop source loop | I - V - vi - IV or vi - IV - I - V from the flipped song | breakdown only |
| Chant tones | minor pentatonic, 2-3 notes | hook |
- Stabs (role "stab", wave "fatsawtooth", unison 2, decay 0.15) land ON the kick grid; melodic elements follow the 4-4-3-3-2 rhythm. Bells and plucks play one-note riffs.
- Pad only in the breakdown (fatsawtooth, cutoff 1200, -14 dB, width 0.8).

## Hook devices
1. Vocal chop stabs: one or two syllables in staccato runs (Orphiq); NI places them on steps 3 and 7 of bar 1, adding step 4 at vel 68 in bar 2. Audio oneShot, warped to the song tempo, pitch ±2.
2. The bed squeak (sampled from Trillville "Some Cut", 2004): a rhythm, not a decoration; it fills gaps between kicks.
3. Chant call and response over 2 bars ("Just Wanna Rock": chant plus kick plus 808 and almost nothing else).
4. Sirens, horns and "counting" one-shots as fx every 4 bars (NI's "Counting Comets" on the final bar).
5. The flip: warp any pop or rap vocal to 140, cut two-syllable stabs, keep 8 bars, restate every 8 with one change.

## Arrangement (NI: 8-bar sections, elements added each 8, chops drop out at bar 41 and return at 49, then strip every 8)
| Section | Bars | Active | Fill | Energy |
|---|---|---|---|---|
| Intro | 8 | kick, squeak | none | 0.35 |
| Groove | 8 | + snare, hat, 808, sub | none | 0.6 |
| Build | 8 | + chops teased, stabs; riser | riser | 0.75 |
| Drop | 16 | kick, snare, hat, squeak, 808, sub, chops, lead, crash | none | 1.0 |
| Groove 2 | 8 | Drop minus chops (lead only) | none | 0.8 |
| Break | 8 | vocal over pad; kick and 808 out | roll | 0.4 |
| Drop 2 | 16 | Drop + triplet rolls + siren + a second chop | none | 1.0 |
| Outro | 8 | kick, squeak, 808 stripping | none | 0.4 |
Total 80 bars, 2:17 at 140; first drop at bar 25 (0:41). Jersey records are short; edits for DJs add 16 drum-only bars to the intro.

## Mix targets
- Drop LUFS -8 to -6 (NI masters to Ozone's EDM target). Sub + low 0.50-0.65 (kick plus 808; measured lane sub 0.347, sub + low 0.591). lowMid + mid 0.15-0.25, highMid 0.08-0.15 (chops and squeak are bright), air 0.03-0.08.
- Pump 0.15-0.35 (no real sidechain). Swing 0.50-0.52. Kick drive 0.35, kick volume +1, drumTune 0, drumDecay 0.2 (five kicks per bar need short tails). Mud below 0.3.
- The ears' kickDensity will read 5 per bar; the drums check passes (it asks for at least 3). Transients per beat 5-7.

## References
1. Lil Uzi Vert "Just Wanna Rock" (2022, 150 BPM, F# minor listed; producer MCVertt): chant, kick and 808 and almost nothing else; the minimal Jersey template that went top ten.
2. Drake "Sticky" (2022, 137 BPM, F# major listed, Bb minor by other analyzers): a rap vocal on a Jersey grid, the crossover shape.
3. Cookiee Kawaii "Vibe (If I Back It Up)" (2019, listed at 160 BPM, A# major; feels like 80): the viral vocal-first Jersey record.
- DJ Frosty "Ride That Wave" is NI's example of the signature kick pattern; founders DJ Tameil, Mike V, DJ Tim Dolla (Orphiq).

## Feel words
- "bouncier": add a ghost 16th before the fifth kick (step 14, "g"), 808 glide 0.08, fifth kick vel 90, squeak on the offbeats.
- "harder" / "slam": kick drive 0.5, drumTune -2, snare layer +3 dB, crash on every drop bar 1, master sidechainDb 3.
- "Jersey drill": tempo 145-166, sliding 808 (glide 0.12) on beat 1 and the and-of-3, hats as 8th triplets, darker chant.
- "flip this": warp the uploaded vocal to 140, chop two-syllable stabs on steps 3 and 7, keep the source chords for the breakdown only.
- "more squeak": squeak track on steps 3, 7, 11, 14, vel 100, pan 0.3, drumDecay 0.05.
- "Baltimore" / "triplet": kick on the 8th-triplet grid (stepBeats 0.3333, "X..X..X.X.X."), hats every triplet at vel 60, verify by ear.

## Sources
- Native Instruments, How to make a Jersey club track: https://blog.native-instruments.com/jersey-club/
- Orphiq, What is Jersey club? Sound, BPM and kick pattern: https://orphiq.com/resources/what-is-jersey-club
- Plugg Supply, How to make Jersey club beats (the 5-count kick): https://plugg-supply.net/articles/how-to-make-jersey-club-beats
- BeatsToRapOn, How to make a Jersey club beat: https://beatstorapon.com/blog/how-to-make-a-jersey-club-beat/
- Wikipedia, Just Wanna Rock; Tunebat / SongBPM pages for Just Wanna Rock, Sticky, Vibe, Munch (BPM and key).
