# 30 · Bass: rolling tech-house bass, reese/warp bass, sub management, kick-vs-bass rules

Studio vocabulary: `bass` (top/tone layer) and `sub` (sine, mono) as separate tracks, both `duck:true`. Notes `[midi, startBeat, durBeats, velocity]`, one 16th = 0.25 beat.

## A. Rolling offbeat tech-house bass

Pattern (the 3-note pattern, 16th slots 1-16 per bar) [S19]
```
slot 1  tonic (under the kick, short)        slot 9  tonic (under the kick)
slots 2-4 rest / sub only                     slots 10-12 rest / sub only
slot 5  fifth   slot 6 tonic                  slot 13 fifth  slot 14 tonic
slot 7  octave  slot 8 tonic                  slot 15 octave slot 16 tonic
```
Studio (A minor, A1 = 33, E2 = 40, A2 = 45), one bar:
```
[33,0.00,0.15,110] [40,1.00,0.24,90] [33,1.25,0.19,75] [45,1.50,0.24,90] [33,1.75,0.19,75]
[33,2.00,0.15,110] [40,3.00,0.24,90] [33,3.25,0.19,75] [45,3.50,0.24,90] [33,3.75,0.19,75]
```
- Note lengths as a fraction of a 16th: downbeats 60%, offbeats 90-100%, fillers 70-80% [S19]. Velocities: downbeats 110, offbeats 90, fillers 70-80 [S19]. Swing 56-58% [S19].
- Chris Lake-style variant: syncopated notes on 1.2.3 and 1.4.3 (studio beats 1.5 and 3.5), light swing, pitch slides between notes, LFO on the cutoff synced to 1/8 or 1/16 [S21]. Warehouse variant: almost every 16th on the root with the first 16th of every beat empty so the kick owns the downbeat [S35].
- Octave: C2-A2 region for the tone layer [S35][S19]; body 50-250 Hz, "rolling" character 80-250 Hz [S19].

Patch (studio params) [S19][S21][S20][S23]
```
bass: wave sawtooth (or fatsawtooth unison 2, spread 5-8 cents), octave 0, glide 0-0.03
      attack 0.001  decay 0.20  sustain 0.6  release 0.08
      cutoff 200 Hz (150-300)  resonance 0.7 (5-10%)  envAmount 1.0 octave (40% of range)
      filter env: attack 0.001 decay 0.08 sustain 0.3 release 0.1  (velocity → cutoff on)
      fx: drive 0.2-0.4, filter {type lowpass 24 dB}, eq {low 0, mid -1 at 100 Hz, high 0}, width 0, duck true
sub:  wave sine, octave -1, level ~70% of bass, attack 0.001 decay 0.3 sustain 0.8 release 0.05, width 0, duck true
```
- Lake's Serum 2 version: wavetable pitched down two octaves, amp decay ~1.2 s, sustain -10 dB, steep velocity-to-cutoff, asymmetric distortion, OTT at 15%, sidechain at 100% ratio [S20]. Dom Dolla runs the same MIDI on two channels, one for sub, one for top grit [S3]. Fisher's "Losing It" bass is a 4-bar loop on G and G# with four subtle variants [S59].
- Saturation: 20-40% drive for harmonics [S21]; keep it sparing on the sub [S22]. Legato with glide for slides [S23].
- Filter placement: a high-pass around 65 Hz and low-pass around 350 Hz on the tone layer, slight cut at 100 Hz, slight boost at 330 Hz [S35]; the sub takes everything below.

## B. Reese / warp bass for speed garage and bassline

Core patch (two detuned saws) [S28][S27][S25]
```
bass: wave fatsawtooth, unison 2 (up to 4 for a wider warp), spread 30 cents each way (±0.30 st; mellow ±0.15)
      octave -1, glide 0.05-0.10 (mono legato), attack 0.005 decay 0.4 sustain 0.9 release 0.15
      cutoff 650 Hz  resonance 1.5-2.5 (≈14% and up; high resonance for the "warp")  envAmount 0.5
      fx: drive 0.4-0.6 (Decapitator-style), crush 8-10 bits at a low mix, filter {lowpass}, width 0 (mono below 120 Hz), duck true
sub:  sine, octave -2 or -1, high-passed nothing, LP 80 Hz, width 0, duck true (sub-only ducking)
```
- Alternative timbre: osc A triangle, 1 voice, one octave down, width 0; osc B same wave, 2 voices, +7 semitones; a 1-bar LFO on the second filter; vibrato on the upper voice; mono legato [S27]. An 8-voice saw unison is the thicker option [S27].
- Movement: automate the filter open during drops and closed during breakdowns [S24]; a slow notch sweep adds motion [S28]; a 1-bar cutoff LFO [S27]. In this studio use section `automation` on `filter.cutoff` (e.g. 400 → 2500 Hz across the drop's first 8 bars).
- Speed-garage layering: main layer = two saw wavetables, one detuned far down, high-resonance filter, distortion on a macro, bit-crush; second layer = two detuned sines with added harmonics, high-passed, at low volume for harmonic support [S25]. Sammy Virji's "Never Let You Go" bass is FM [S70]; salute's are D-50/DX7 gloss with pumping sidechain [S9].
- Processing chain: Decapitator + OTT multiband; sidechain only the sub band with Kickstart 2 "Bend" mode so the mid growl stays present while the low end pumps [S24].

Note choices (A minor context) [S25][S81]
- Primary tones: root, bVI (F) and bIII (C); octave jumps such as F5 → F6; glide notes for movement [S25]. The minor pentatonic (1, b3, 4, 5, b7) supplies the rest; b3 and b7 are the "garage" tensions [S81].
- Rhythm: long held warp notes (Virji "elongates" notes in F# because "F-sharp is the best note to rattle a sub") [S4] alternating with an offbeat motif; IC uses short bass hits high-passed at 100 Hz plus separate sub samples at D#2, C#2, D#1 [S18].
- Executable warp phrase, 2 bars, A minor (A1 = 33):
```
[33,0.0,1.5,110] [33,1.5,0.5,95] [41,2.0,1.0,100] [45,3.0,0.5,90] [33,3.5,0.5,90]
[33,4.0,1.0,110] [40,5.0,0.5,95] [41,5.5,0.5,95] [53,6.0,0.5,100] [41,6.5,1.5,100]   (F5→F6 style jump = 41→53)
```

## C. Sub management

- Keep everything below 100-120 Hz mono [S46][S47]; the 50-120 Hz band is the bulk of the low end [S47]. Mid/side: cut the sides below 120 Hz [S47]. Studio: `width 0` on `sub` and `bass`, `width` ≥ 0.5 only on hats/FX/pads.
- Non-bass tracks high-pass at 120-220 Hz [S46]; chord stabs from 300 Hz up [S19]; bass hits high-passed at 100 Hz when a separate sub carries the fundamental [S18].
- Sub note lengths: sub tails should fill the gaps between bass notes (sub sustain 0.8, release ≤ 0.05) but never overlap the next kick; the IC pattern uses separate short sub samples per note [S18]. The Attack sub layer is a low-passed (80 Hz) note lengthened to cover the beat [S35].
- Below 35-40 Hz: high-pass; it only eats headroom [S46]. Kick HPF 30-35 Hz [S10][S48].

## D. Sidechain per lane (studio `duck:true` pump depth 0-1 in brackets)

| Lane | Gain reduction | Attack | Release | Ratio / shape | Pump depth | Sources |
|---|---|---|---|---|---|---|
| Tech house rolling | 5-7 dB | 1-2 ms | 100-120 ms (110 ms at 124 BPM) | 4:1-6:1, knee 3-6 dB | 0.5-0.65 | [S19] |
| Tech house, Lake-style | full duck | fast | fast | 100% ratio | 0.7-0.8 on bass only | [S20] |
| Techno / hard house pump | 6-12 dB | 1-10 ms | 200-350 ms at 128 (max ≈ 60000/BPM = 468 ms) | 4:1-10:1; LFO tools at 60-80% depth | 0.65-0.8 | [S45] |
| Club subtle (pads, stabs) | 2-4 dB | fast | 80-140 ms | — | 0.25-0.4 | [S46] |
| UK / speed garage | 4-5 dB max | minimum | short | compressor keyed to kick; or sub-only "bend" ducking | 0.3-0.45 | [S18][S24] |
| Multiband (any lane) | 8-12 dB below 200 Hz, 2-4 dB 200 Hz-2 kHz, none above 2 kHz | as above | as above | — | apply to `sub` and `bass` separately | [S45] |

Release rule: the duck must fully recover before the next kick (≤ one quarter note) [S45]; Lake-style tech house recovers within an 8th so the offbeat bass note pops.

## E. Bass-vs-kick tuning rules

1. Tune the kick's sub component to the key [S47][S68]; then place the bass power off the kick fundamental: kick 50 Hz → bass 70-90 Hz or 45-55 Hz [S46].
2. Do not put the bass root on the kick's fundamental frequency; carve the other one with EQ [S47]. Example: kick G1 (49 Hz) with the bass at C2-A2 [S35][S21].
3. Leave the first 16th of every beat empty in the bass when the kick is long [S35]; otherwise sidechain (table above).
4. Phase-align the sub with the kick where they overlap (invert or shift the sub until the waveforms line up) [S47].
5. Cut the bass mud zone 180-300 Hz before boosting the sub [S46]; cut kick 150 Hz (-1 to -2 dB) when a sub layer is present [S48].
6. Virji: pick the sub note for the room; F# rattles subs [S4]. Keep the sub note register ≥ 40 Hz (E1 = 41 Hz) so it survives the 35-40 Hz high-pass.
