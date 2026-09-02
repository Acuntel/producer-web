# Lane: afro-house (Afro house: Keinemusik, Black Coffee, &ME; with amapiano and 3-step sidebars)

Why it is here: his crate carries Burna Boy, Rema, Fireboy DML, Tiwa Savage, USHER and Burna Boy "Coming Home", the Adele "Rolling In The Deep" amapiano remix (measured 113 BPM) and two Dennis Blaze afro-reggae remixes. His measured "melodic" DNA lane (110-119 BPM, n = 22) is mostly these records: tempo p50 113.5, swing p50 0.597, sub + low p50 0.634, LUFS p50 -9.3, pump p50 0.098. Afro house at 120-124 is the club version of what he already plays.

## Tempo and keys
- Afro house 118-124 BPM, home 122. NI: "110 to 125, with 118 to 122 often preferred". "Move" 120, "Muyè" 120, "I Adore You" 120, "Drive" 118.
- Amapiano sidebar 108-115, home 112 (Roland uses 112 and 108; "Mnike" 113, "Water" 117). 3-step sidebar 113-120 (Rolling Stone Africa).
- Keys: G minor (NI's whole tutorial), Ab minor (Move), A minor (Muyè), B minor (I Adore You), F# minor (Drive), F minor (Mnike), Eb minor (Water). Minor pentatonic for melodies, Dorian under vocals. Studio default "G minor" or "A minor".

## Drum grid (16 steps = 1 bar)
```
kick     X... X... X... X...        vel 116 (softer than tech-house), drumTune -1, drumDecay 0.28, drive 0.1
clap     .... X... .... X...        vel 100, clapLateMs 12 (lazy), plus a rim layer (snare -10 dB, drumTune +4)
perc     .... x.x. ..x. x...        conga clave (Roland): 2, and-of-2, and-of-3, 4; vel X on 2 and 4 -> "....X.x...x.X..."
shaker   xgXg xgXg xgXg xgXg        16ths as a perc track, drumDecay 0.05, accent on the 3rd 16th of each beat
openhat  ..o. ..o. ..o. ..o.        vel 80, volume -10
perc2    x..x ..x. .x.. x..x | ..x. .x.. x..x ..x.   bongo in 3s across 2 bars (3-over-4), drumTune -7, drumDecay 0.12
```
- Swing 0.56-0.62 (his measured lane p50 0.597), velVar 0.12 (organic is the point), pocketMs +3.
- Amapiano variant: kick "X... .... X..X ...." (sparse) or soft 4/4, shaker straight 16ths, snare rolls only as fills, the log drum carries the rhythm.
- 3-step variant: three kicks per bar (Beatportal). One common voicing is "X... ..X. ..X. ...." (1, and-of-2, and-of-3); verify by ear against Thakzin, the source does not print positions.

## Bass recipe
- Afro house bass (role "bass"): deep, round, sliding. NI runs G2 with C3 and D3 variations (i, iv, v). Studio synth: wave "triangle", unison 1, cutoff 500, resonance 1.5, envAmount 1.2, decay 0.25, sustain 0.6, release 0.15, glide 0.04, octave -1, fx.drive 0.15, duck true.
- Pattern (8 beats): root on beat 1 (dur 1.5), pickups on and-of-2 and and-of-4 to the 5th ("X... ..x. .... ..x." vel 108/84/84), bar 2 moves to iv on beat 1. Slides: write two overlapping notes so the glide fires.
- Log drum (amapiano, role "bass"): wave "triangle", cutoff 350, resonance 5, envAmount 2.5, decay 0.10, sustain 0.05, release 0.08, glide 0.03, octave -1, fx.drive 0.35. Notes E1-D2 (midi 40-50). Rhythm "..x. .x.x ..x. .x.x" (offbeat-heavy bounce), vel 110/90; it is both the bass and a drum (Roland: "bass line and punchy accent").
- Sub (role "sub"): sine on the roots, one note per bar, duck true. Master sidechainDb 4-5, sidechainReleaseMs 100: the pump is felt, not heard.

## Harmony
| Progression | Example | Use | Source |
|---|---|---|---|
| i9 (single chord groove) | Gm9 held, bass moves i-iv-v | intro, groove, most of the drop | NI |
| i - bVI - bVII | Abm Fb Gb | vocal drop, "Move" feel (studio) | Move analysis |
| i - iv (common tones) | Ebm to Abm | trance-like lift, amapiano chords | Roland |
| ii9 - V7 - Imaj9 - vi7 - VI7b9 | Cm9 F7 Bbmaj9 Gm7 G7b9 | jazz-piano amapiano (2-5-1 turnaround) | Roland |
- Chords role wave "epiano", 4-note voicings with the root omitted (3-5-7-9) in octave 4, sustained 2-4 beats, volume -12, reverb 0.25, eq low -4 (NI high-passes the atmosphere chord at 142 Hz).
- Pad: wave "fatsawtooth", unison 2, cutoff 900, attack 0.5, volume -16, width 0.7; drone on i.
- Stab on and-of-4 (step 15) once per 2 bars, epiano, vel 90, dur 0.3.

## Hook devices
1. The chant: a 2-4 syllable vocal (audio clip) repeated every 2 bars, pitched to the key ("Move", "Muyè").
2. Marimba or kalimba pluck: role "pluck", wave "triangle", decay 0.25, sustain 0, delay "8n." wet 0.2, pentatonic 2-bar motif.
3. Flute-like lead: role "lead", wave "sine", attack 0.03, release 0.3, glide 0.05, pentatonic, one phrase per 8 bars.
4. Whistles and bird one-shots (role "fx", or audio one-shots) every 4 bars (Roland: "whistles and bird sounds").
5. Polyrhythm perc2 entering at the drop: the "arrival" replaces the blast.

## Arrangement (long-form Keinemusik feel; NI's full mix arrives at bar 25)
| Section | Bars | Active | Fill | Energy |
|---|---|---|---|---|
| Intro | 16 | kick, shaker, perc, pad drone | none | 0.3 |
| Groove | 16 | + clap, bass, openhat, chant teaser | riser | 0.55 |
| Break | 8 | chords, chant, pluck; kick out | riser | 0.4 |
| Drop | 32 | kick, clap, perc, shaker, openhat, perc2, bass, sub, chords, chant, pluck | none | 0.85 |
| Breakdown | 16 | chords, lead, pad; kick and bass out | roll | 0.45 |
| Build | 8 | + kick, shaker; pad cutoff 600 to 4000 | cut | 0.7 |
| Drop 2 | 32 | Drop + lead or a second perc layer | none | 1.0 |
| Outro | 16 | kick, shaker, bass, pad fading | none | 0.4 |
Total 144 bars, 4:43 at 122; first drop at bar 41 (1:20). Afro drops are arrivals: drop 1 energy 0.85, drop 2 is the peak. Use "riser" for the first build, "cut" only for the second.

## Mix targets
- Drop LUFS -9.5 to -7.5 (his measured lane p50 -9.3). Sub + low 0.55-0.68 (measured p50 0.634). lowMid + mid 0.20-0.30 (percussion body lives here). highMid 0.06-0.12, air 0.02-0.06.
- Pump 0.20-0.40 (sidechainDb 4-5). Swing 0.56-0.62 (measured p50 0.597). Mud below 0.30, harshness below 0.2, width 0.5-0.8 on perc and chords, kick and sub mono.
- Transients per beat should read high (7+): shaker plus conga plus bongo. If pump reads above 0.6 the mix is too sparse: add the shaker and a sustained chord.

## References
1. Adam Port, Stryv and Malachiii "Move" (2024, 120 BPM, Ab minor): a chant hook over lilting percussion; the drop is an arrival, not a blast.
2. &ME, Rampa, Adam Port "Muyè" (2018, 120 BPM, A minor): the Keinemusik template, chant plus tribal perc bed plus one deep bass.
3. Black Coffee and David Guetta "Drive" (2018, 118 BPM, F# minor): deep round bass under a pop vocal at afro tempo.
- Sidebars: Tyler ICU "Mnike" (2023, 113 BPM, F minor) for the log drum; Tyla "Water" (2023, 117 BPM, Eb minor) for amapiano-pop; Thakzin "Magnificent Dance" (2022) for 3-step.

## Feel words
- "tribal" / "more drums": add perc2 (3-over-4), conga vel +10, shaker accents, swing 0.60, velVar 0.14.
- "warmer" / "deeper": bass sustain 0.7 and cutoff 400, chords cutoff 1800, reverb 0.3 on chords, remove openhat.
- "amapiano" / "log drum": tempo 112, sparse kick, log-drum bass recipe, straight shaker 16ths, epiano 2-5-1 chords.
- "3-step": tempo 116, kick "X... ..X. ..X. ....", snare-roll fills ("roll"), log drum under.
- "bouncier": bass glide 0.05 with pickups on and-of-4, clapLateMs 15, shaker accent on the offbeat.
- "spiritual" / "chant": record a hum for the chant (recordHum chords, 8 beats), pad drone on i, remove the clap, lead on the pentatonic.

## Sources
- Native Instruments, Afro house production 101: https://blog.native-instruments.com/afro-house-production-101/
- Roland, Creating amapiano tracks: https://articles.roland.com/production-hacks-creating-amapiano-tracks/
- Beatportal, Where did that kick go? An introduction to 3Step: https://www.beatportal.com/articles/807844-where-did-that-kick-go-an-introduction-to-3step
- Rolling Stone Africa, The rise of 3-Step: https://rollingstoneafrica.com/music/music-features/the-rise-of-3-step-south-africas-latest-dance-music-genre/
- Wikipedia, Move (Adam Port and Stryv song); Beatport page for Move (120 BPM, Ab minor); Tunebat pages for Muyè, I Adore You, Drive, Mnike, Water.
