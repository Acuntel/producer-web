# 40 · Harmony and hooks: progressions, stabs, pads, hook construction, tension

Studio: `chords`, `stab`, `pad`, `pluck`, `arp`, `lead`, `audio` (vocal). Notes `[midi, startBeat, durBeats, velocity]`.

## A. Progressions that dominate each lane

Tech house (keys: G, A, F, F# minor; Phrygian for a darker edge) [S21][S23]
| Progression | Roman numerals | Example | Sources |
|---|---|---|---|
| Static minor 7 with one surprise chord in bar 8 | i · i · v · v · i · i · v · ♯iii | Cm7 Cm7 Gm7 Gm7 Cm7 Cm7 Gm7 Em7 (120 BPM) | [S32] |
| Two-chord loop, no resolution needed | ♭VI maj7 → v7 (or IV → iii in a major reading) | Fmaj7 → Em7 | [S33] |
| Minor cycle | i7 → v7 → iv7 | Am7 → Em7 → Dm7 (drop the 7th an octave for close voicing, descending top line E-D-C) | [S33] |
| Chromatic bass hook | i → ♭ii (bass only) | "Losing It": 4-bar bass loop on G and G# | [S59] |
| Masters at Work reference | i7 → ♭III maj7 → v7 | Fm7 → A♭maj7 → Cm7 | [S33] |

Rules: minor 7 chords are the default; 7ths, 9ths, 11ths (the 2nd, 4th, 6th above the octave) give flavor [S34][S32]; progressions do not need to resolve to the tonic [S33]; make bar 8 different to make the loop catchy [S32]. Kerri Chandler's "Where Is Love?" is the min9 reference [S34].

Speed garage / bassline / hard house (keys: A minor, Bb minor, B minor, C#/Db, F# for the sub) [S25][S60][S4]
| Device | Numerals | Example | Sources |
|---|---|---|---|
| Bass-led i / ♭VI / ♭III | i → ♭VI → ♭III | A, F, C in A minor with octave jumps | [S25] |
| Two chord samples, second transposed +5 st | i → iv (parallel motion) | IC-style layered chord samples | [S18] |
| Organ / rave stab on one chord, dissonant top note | i (add ♭9 or ♯4 colour) | KETTAMA stabs with an A# rub against A | [S58] |
| Jazz chords and R&B key changes | ii7 → V7 → Imaj7, up a semitone for drop 2 | Virji's "Peach" key-change emphasis | [S4] |
| Glossy D-50/DX7 keys, French-house major-7 loops | IVmaj7 → V → iii7 → vi7 | salute | [S9] |

## B. Stab programming

- Rhythm: syncopated 16ths that avoid the downbeats; change the rhythm in bar 4 and again in bar 8 [S32]. Deep/dusted house: the chord on the first offbeat of each bar (beat 0.5) as a rhythmic one-shot [S14]. Tech house: on the offbeats with duplicated variations [S56].
- Voicing: Cm7 root position (C, E♭, G, B♭); Gm7 in third inversion (F, G♯→A♭, D above); add the 11th (F on Cm7, C on Gm7) or the 9th an octave up for lift [S32]. Piano-house: bass note anchoring the chord, better inversions beat more notes [S82].
- Length: short, plucky; amp envelope with no sustain (studio: `decay 0.3-0.56, sustain 0, release 0.15`) [S21][S56]. Filter envelope decay 556 ms, release 156 ms, cutoff 209 Hz base [S56].
- Studio stab, C minor 7 on offbeats (C3 = 48):
```
stab: [48,0.5,0.25,100] [51,0.5,0.25,100] [55,0.5,0.25,100] [58,0.5,0.25,100]
      [48,1.75,0.2,90] [51,1.75,0.2,90] [55,1.75,0.2,90] [58,1.75,0.2,90]
      [48,2.5,0.25,100] ... [48,3.25,0.2,85] ...   (bar 4: shift the second hit to 1.5; bar 8: add a hit on 3.75)
```
- Space: high-pass stabs from 300 Hz [S19]; delay 1/8 at 20-30% feedback, 20-40% wet; plate reverb under 1 s [S21]; ping-pong delay synced [S56]; duck subtly (2-4 dB) [S46].

## C. Pad voicings and register

- Register: root between C3 and C4, extensions above; keep the pad out of 100-300 Hz (high-pass 200-300 Hz) so the bass owns it [S46][S19].
- Voicing: min9 / maj9 spread over two octaves; drop the 7th an octave for a close voicing and a moving top line [S33][S34].
- Motion: slow cutoff LFO (≈0.12 Hz, ≤15% depth) or a section ramp; sidechain pulse at 1/4 so the pad breathes with the kick [S55][S83].
- Salute-style euphoria: glossy digital (D-50/DX7) pads with pumping sidechain [S9]; tech house keeps pads as background "ear candy" added last [S1].

## D. Hook construction

Repetition / variation ratios
- Fisher: one 4-bar bass loop with four subtly different patterns; the lead is also a 4-bar phrase driven by automation, not melody [S59]. Lake-style leads: simple repeating patterns, a variation every 4-8 bars [S21].
- Attack stabs: 8-bar loop where bars 4 and 8 change rhythm [S32]. Summit: an 8-bar chord loop is the seed; ear candy (plucks, pads, chops) comes last [S1].
- Rule of thumb from these: 75% identical / 25% varied at the 4-bar level; one new sound or a mutation every 8 bars (see 10-arrangement).

Call and response
- Two rimshots with different velocities and loose timing [S15]; chopped percussion loops rearranged across bars for call-and-response [S57]; bass motif alternating with vocal chop across the drop [S24].

Vocal chop technique
- Slice to the syllable; pitching changes timing, which is fine for tiny slices [S63]. Pitch moves over 3-4 semitones sound unnatural without formant preservation [S62]; formant shifts of a few semitones make a sample unique without sounding processed [S62].
- Chain: high-pass 150-200 Hz [S24]; heavy compression, gate, parallel distortion, and a doubled copy an octave down for weight [S23]; saturation for grit [S1]; delay synced to 1/8 or 1/16 [S24]; low-pass automation opening into the drop [S24]; dynamic cut around 3.2 kHz if it bites [S46].
- One-phrase energy: Dolla builds tracks around a single dusty vocal loop chopped and pitched into a new hook [S3]; Virji elongated the "Ripgroove" vocal and changed the bass notes under it [S4]; speed garage uses time-stretched or pitched-up vocals [S67][S24]. The vocal is teased filtered in the intro, exposed in the breakdown, chopped in the drop [S3].
- Studio: `audio` track with `filter {lowpass 800}` in intro, full in breakdown, `delay {time 8n, feedback 0.3, wet 0.2}` in drops.

## E. Tension devices before drops (harmonic and textural)

| Device | Numbers | Sources |
|---|---|---|
| 8-bar build recipe | bars 1-2 one element; 3-4 tops; 5-6 counter-melody; 7-8 roll + riser; lead cutoff 40%→100%; reverb send up bars 1-6 then cut in bar 7; sub silent bars 7-8; snare 60%→100% velocity, pitch -1 to -2 st; kick returns bar 9 beat 1 | [S37] |
| Snare roll | 1 bar of 16ths, velocity 1→127, or 8ths×4 bars, 16ths×2, 32nds×2 | [S36][S37] |
| Riser | 4-16 bars; pitch -12→0 st; cutoff 150 Hz→10 kHz; volume -20→0 dB | [S38] |
| Silence | remove the beat one bar before the drop (garage) | [S29] |
| Hoover / rave stab | pitch envelope diving ~8 st at note start, high resonance; keep for hard house drops | [S30][S31] |
| Harmonic lift | hold the v chord for the last 4 bars of the build, resolve to i on the drop; or a semitone key-change for drop 2 | [S32][S4] |
| Micro-drop | bar 6 of the build goes near-silent, then re-accelerates | [S37] |
| Hangover | cut the source, let the reverb/delay tail run into beat 1 | [S39] |
