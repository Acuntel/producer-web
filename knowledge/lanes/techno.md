# Lane: techno (Peak-time and driving techno: Adam Beyer, Eli Brown, Charlotte de Witte; hypnotic and Berlin as the sub-lane)

Why it is here: it is the "make it harder and darker" request that sits between his tech-house (124-130) and his KETTAMA hard-house lane (140-145). Crate evidence is thin (the Charli XCX and FISHER "Guess" bootleg at 130, the Skrillex "Show Me Love" remix at 130, the Kobosil mix of Anyma), so this is a request lane with numbers from the sources, not from his DNA. The nearest measured lane is hard-house (sub p50 0.347, LUFS -8.8).

## Tempo and keys
- Peak-time 128-136, home 132. Beatportal: "Peak Time Techno thrives in the 126-132 BPM range", start at 128; Attack Thumping Techno 130-135; "Your Mind" 126, "Doppler" 135, "Diamonds On My Mind" 136. Hypnotic and dark Berlin 120-130 (Attack). Above 145 hand over to hard-house.
- Keys matter less than in house: root drones. B minor (Your Mind), Bb minor (Diamonds), C minor, A minor, F minor. Phrygian (bII) and natural minor for stabs; one-note basslines on the root. Studio default "A minor".

## Drum grid (16 steps = 1 bar)
```
kick     X... X... X... X...        vel 127, drive 0.35, drumDecay 0.36, drumTune -1 (tougher, longer)
clap     .... X... .... X...        peak-time: 2 and 4, vel 108, width 0.7; Berlin: "....X..........." (2 only, Attack Dark Berlin)
snare    ..g. ...g ..g. ...g        thumping: offbeats and 16ths, not 2 and 4 (Attack), vel 55, drumTune -10 (pitched down)
hat      ..x. ..x. ..x. ..x.        offbeat 8ths, vel 88, drive 0.2
hat2     gxgx gxgx gxgx gxgx        second closed hat, 16ths, velocity-driven noise layer (Attack), volume -12
openhat  ..o. ..o. ..o. ..o.        vel 82
ride     x... x... x... x...        quarters, same pattern as the kick (Attack); second openhat track, drumDecay 0.5, volume -12
tom      .... .... .... ..x.        final offbeat of each bar (Attack Thumping); perc, drumTune -12, drumDecay 0.2
tom B    .... ..x. .... ..x.        dark Berlin: low tom at steps 7 and 15, every other bar, lowpassed
rim      xx.. .... x... ....        tuned 909 rims low and high at the bar start (Attack); perc, second hit drumTune +7
```
- Swing 0.50-0.55 (Berlin 50-55, Thumping 50-60; Attack's progressive techno at 135 uses more). velVar 0.06, clapLateMs 0, pocketMs 0.
- Intro variant: kick, rumble, hat only; one element every 8 bars. Breakdown: no kick, tom B and rim keep time.

## Bass recipe: the rumble is the bass
- Rumble (role "sub"): sine on the root, one note per bar (dur 3.9), vel 110, duck true, fx.drive 0.3, fx.reverb 0.25, fx.filter lowpass 140. The duck IS the rhythm: master sidechainDb 10-12, sidechainReleaseMs 200-260. (Mastrng, Producer School, Studio Brootle: kick through reverb or delay, lowpassed, sidechained to the kick; Drum Buss "Boom" style.) Bus kick and rumble as one low-end voice.
- Rolling bass (role "bass", peak-time): wave "sawtooth", unison 1, cutoff 320, resonance 3, envAmount 1.5, decay 0.12, sustain 0.2, release 0.05, octave -1, fx.drive 0.3, duck true. Pattern A offbeat 8ths "..x. ..x. ..x. ..x." vel 104; pattern B 16ths with the beat silent ".xxx .xxx .xxx .xxx" vel 70/100/85 (Beatportal: "16th notes with occasional syncopation"; Studio Brootle at 138 doubles the kick note every 4th bar).
- Peak-time riff (Drumcode): the bass track at octave 0, one or two notes, cutoff automated 300 to 2500 over 16 bars; that riff is the record.

## Harmony (minimal)
| Device | Notes | Use |
|---|---|---|
| i drone | pad on the root, no 3rd | everything |
| i - bII | Am Bb stabs (Phrygian) | drop stabs |
| i - bVII | Am G | breakdown |
| i5 stab | root and 5th only, fatsawtooth | rave stab |
- Stab (role "stab"): wave "fatsawtooth", unison 3, spread 40, decay 0.25, sustain 0, fx.delay {"time":"8n","feedback":0.4,"wet":0.25}, reverb 0.2, volume -8; on steps 7 and 15 ("...... x. ...... x.") or one hit per 2 bars.
- Pad (role "pad"): wave "sawtooth", unison 3, spread 30, cutoff 600, attack 1.5, release 2, volume -16, width 1; the drone.
- Acid (role "arp"): wave "sawtooth", resonance 8, envAmount 3, cutoff 200 automated to 3000 across 16 bars, 16ths on root and octave with accents.

## Hook devices
1. A one-bar stab or riff rhythm: the hook is rhythm, not melody.
2. A filtered vocal phrase (audio) with delay "8n" wet 0.3 fb 0.5, high-passed (fx.filter highpass 400).
3. The acid line rising over 16 bars, then cut.
4. The rumble alone for 8 bars (kick + rumble only) before a drop: the "Your Mind" tension device.
5. "Diamonds" device: a big sung hook over a 136 groove; "Doppler" device: a 2-note bleep arp that phases over 16 bars with only filter automation.

## Arrangement (Beatportal's 8-step timeline at 132: intro to 1:00, build to 2:00, drop at 2:00, breakdown 2:30-3:30, second drop 3:30-4:30, outro)
| Section | Bars | Active | Fill | Energy |
|---|---|---|---|---|
| Intro | 32 | kick, rumble, hat; + openhat at 9, + hat2 at 17, + rim at 25 | none | 0.35 |
| Groove | 16 | + bass A, clap, ride | none | 0.6 |
| Break | 16 | stab or vocal filtered, pad; kick out at bar 9; riser | cut | 0.45 |
| Drop | 32 | kick, clap, hat, hat2, openhat, ride, tom, rumble, bass B, stab | none | 1.0 |
| Breakdown | 32 | pad, stab, tom B, rim; kick and bass out; reverb swell | roll | 0.3 |
| Build | 16 | + kick (cutoff 400 to 18000 on master), snare 8ths then 16ths | cut | 0.75 |
| Drop 2 | 32 | Drop + acid or vocal + open filter | none | 1.0 |
| Outro | 32 | strip one element every 8 bars, rumble last | none | 0.35 |
Total 208 bars, 6:18 at 132; first drop at bar 65 (1:58). Studio compact: 16/8/8/16/16/8/16/16 (104 bars, 3:09). Sections are 16 or 32 bars; nothing changes faster than 8.

## Mix targets
- Drop LUFS -8 to -6. Sub + low 0.60-0.75 (rumble-led). lowMid + mid 0.12-0.20 (empty mids by design), highMid 0.06-0.12, air 0.03-0.07.
- Pump 0.40-0.70 (sidechainDb 9-12, release 200-260). Swing 0.50-0.55. Mud below 0.30 (the rumble's reverb stays under 140 Hz), harshness below 0.25, crest 10-12 dB (the kick dominates). Kick, sub and bass mono; hats, stabs and pad width 0.7-1.
- Beatportal: check the kick in mono; saturate it (drive) and compress fast. In this studio: kick drive 0.35, master compThreshold -16, limiter -0.8.

## References
1. Adam Beyer and Bart Skils "Your Mind" (2018, 126 BPM, B minor): one filtered riff and a vocal phrase, the Drumcode peak-time template.
2. Eli Brown "Diamonds On My Mind" (2023, 136 BPM, Bb minor): a pop vocal hook over a hard driving groove.
3. Charlotte de Witte "Doppler" (2019, 135 BPM, Bb major listed): a hypnotic two-note motif, phasing and filter builds, KNTXT dryness.

## Feel words
- "harder": kick drive 0.5 and drumDecay 0.4, tempo +3, snare layer on the clap, sidechainDb 12, hats to 16ths.
- "darker" / "Berlin": clap on 2 only, tom B at 7 and 15, pad cutoff 400, stab reverb 0.35, swing 0.52, tempo 128.
- "rolling" / "groovier": bass pattern B, swing 0.55, ride on quarters, rim pair, hat2 louder.
- "hypnotic" / "loopier": no clap, 2-note arp with delay "8n." wet 0.4, 32-bar sections, only automation changes, 16-bar filter sweeps.
- "acid": arp wave sawtooth, resonance 9, envAmount 3.5, cutoff automation 200 to 4000, 16ths.
- "rave" / "stabs": stab unison 4, spread 45, on steps 7 and 15, delay "8n", volume -5; "industrial": crush 8 on the rim, drive 0.6 on hats, snare offbeats.

## Sources
- Beatportal, Step-by-step peak time techno (Layton Giordani, Eli Brown, Adam Beyer): https://www.beatportal.com/articles/783088-step-by-step-guide-to-producing-techno-peak-time-driving-in-the-style-of-layton-giordani-eli-brown-and-adam-beyer
- Attack Magazine, Beat Dissected: Thumping Techno: https://www.attackmagazine.com/technique/beat-dissected/thumping-techno/
- Attack Magazine, Beat Dissected: Dark Berlin Techno: https://www.attackmagazine.com/technique/beat-dissected/dark-berlin-techno/
- Studio Brootle, Rolling techno bassline and techno rumble in Ableton: https://www.studiobrootle.com/rolling-techno-bassline-ableton/
- Mastrng, Techno rumble; The Producer School, Techno rumble kicks for 2025: https://www.mastrng.com/techno-rumble/
- Tunebat pages for Your Mind, Diamonds On My Mind, Doppler (BPM and key).
