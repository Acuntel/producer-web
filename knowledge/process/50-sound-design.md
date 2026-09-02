# 50 · Sound design: patch recipes in the studio's parameter vocabulary

Params: `wave (sawtooth|square|triangle|sine|fatsawtooth|fatsquare|pwm)`, `unison 1-4`, `spread` cents, `attack/decay/sustain/release` s, `cutoff` Hz, `resonance` Q, `envAmount` octaves, `glide` s, `octave`; fx `filter, drive 0-1, crush bits, delay {time, feedback, wet}, reverb 0-1, eq {low, mid, high dB}, comp, width 0-1, pan, gate`. The studio has no pitch envelope and no noise oscillator; workarounds are marked.

## 1. Club kick (sub + click, two tracks) [S10][S12][S46][S48][S68]
```
kick (body): wave sine, octave -2 (note = key root, e.g. G1=31 → 49 Hz; target 40-100 Hz fundamental)
             attack 0.001, decay 0.30 (tech house 0.25-0.40; 140+ lanes 0.15-0.25), sustain 0, release 0.05
             pitch drop workaround: precede each hit with a 20 ms note +12 st and glide 0.02 → [43,0,0.02,127][31,0.02,0.4,127]
             fx: drive 0.25, eq {low +2 at 50-60 Hz, mid -2 at 300, high 0}, filter {highpass 30-35}, width 0
click layer: wave square, octave +1, attack 0.001, decay 0.03, sustain 0, release 0.01
             fx: filter {highpass 760}, drive 0.5, crush 10; velocity 90-100; same pattern as kick
```
Numbers: main kick saturated below/above a 77 Hz split [S10]; second layer +3 st, everything below 220 Hz removed, decay shortened, HPF 760 Hz [S10]; 808 sub layer tuned to the main kick and lengthened [S12]; no useful content above 10 kHz [S48].

## 2. Tech-house pluck bass [S19][S21][S20]
```
bass: wave sawtooth (fatsawtooth unison 2, spread 6 for width above 120 Hz only), octave 0 (notes A1-A2), glide 0.02
      attack 0.001, decay 0.20, sustain 0.60, release 0.08
      cutoff 200 (150-300), resonance 0.7, envAmount 1.0  (filter env 1 ms / 80 ms / 30% / 100 ms)
      fx: drive 0.3, filter {lowpass 350 on the tone layer}, eq {mid -1 at 100 Hz}, width 0, duck true
sub:  wave sine, octave -1, attack 0.001, decay 0.30, sustain 0.80, release 0.05, width 0, duck true
```
Velocity → cutoff so accents open the filter [S19][S20]; OTT-style multiband at ~15% [S20]; LFO or ramp on cutoff at 1/8 or 1/16 for movement [S21].

## 3. Warp / reese bass (speed garage, bassline) [S28][S27][S25][S24]
```
bass: wave fatsawtooth, unison 2 (3-4 for wider), spread 30 (±0.30 st; ±0.15 mellow), octave -1, glide 0.08 (mono legato)
      attack 0.005, decay 0.40, sustain 0.90, release 0.15
      cutoff 650, resonance 1.8 (high; warp), envAmount 0.5
      fx: drive 0.5, crush 9 at low mix, filter {lowpass}, width 0, duck true (sub-only ducking preferred)
      automation: filter.cutoff 400 → 2500 over the drop; closed (300) in breakdowns
sub:  sine, octave -2, filter {lowpass 80}, width 0, duck true
alt:  wave triangle unison 1 octave -1 + second track wave triangle unison 2 at +7 st, 1-bar cutoff ramp on the second track
```
Speed-garage extras: a second layer of two detuned sines high-passed for harmonic support [S25]; Decapitator + OTT chain [S24]; notes root / ♭VI / ♭III with octave jumps and glide [S25].

## 4. Hoover / rave stab [S30][S31]
```
stab (hoover): wave pwm, unison 3, spread 40, octave 0; second track same patch octave -1 (the three-saws-an-octave-apart stack)
               attack 0.01, decay 0.3, sustain 0.7, release 0.25
               cutoff 3500, resonance 3.5-5 ("resonance 10" on a 0-10 scale), envAmount 0.3
               pitch dive workaround: each note preceded by a 30 ms note +8 st with glide 0.06 → [69,0,0.03,120][61,0.03,0.5,120]
               fx: width 1.0, delay {time 16n, feedback 0.15, wet 0.15} (chorus substitute), drive 0.2, reverb 0.15
```
Original: three PWM saws, oscillators 1 and 2 detuned 40 cents against each other, osc 3 at -12 st, pitch envelope 8 st, resonance 10, fast PWM LFO, heavy chorus [S30]; exact record values are unpublished, tune by ear against a reference [S31]. Kettama-style rave stabs add a dissonant top note (A# over A) [S58].

## 5. Tech-house stab (minor 7 chord) [S56][S21]
```
stab: wave sawtooth (fatsawtooth unison 2, spread 8), octave 0, chord notes C3 E♭3 G3 B♭3
      attack 0.0, decay 0.45, sustain 0, release 0.15
      cutoff 400 base, resonance 0.8, envAmount 2.0  (filter env 0 / 556 ms / 0% / 156 ms; base 209 Hz in the source)
      fx: drive 0.22, filter {lowpass 24 dB, highpass 300}, delay {time 8n, feedback 0.25, wet 0.3} (ping-pong), reverb 0.15 (plate <1 s), width 0.7, duck true (2-4 dB)
pluck lead variant: wave sawtooth + (no noise osc; use crush 12 at low mix for grit), attack 0.01, decay 0.30, sustain 0, release 0.1, cutoff 1200, envAmount 1.5, delay 8n 20-30% feedback 20-40% wet, plate reverb <1 s [S21]
```

## 6. Euphoric pad [S55][S83][S9]
```
pad: wave fatsawtooth, unison 4, spread 15-25 (source: 7 saw voices at 3 cents + 5 sine voices at 4 cents one octave down)
     octave 0 (root C3-C4), attack 0.3-0.8, decay 1.0, sustain 0.8, release 0.7-1.5
     cutoff 800-2000, resonance 0.5-1.0 (10-20%), envAmount 0.3
     fx: width 0.9-1.0, reverb 0.3, drive 0.1 (20% mix warm), eq {low -6 below 200, high +2}, delay {time 8n., feedback 0.2, wet 0.15}, duck true (1/4 pulse)
     automation: filter.cutoff slow ramp (LFO ≈ 0.12 Hz, ≤ 15% depth) across 16 bars
second layer: wave sine unison 4 spread 4, octave -1, same envelope, cutoff 600 (fills the body)
```
Chorus in the source: 16 ms delay, 0.22 Hz, 50% depth, 12% feedback, 60% wet [S55]. Glossy alternative: D-50/DX7-style digital bell layer [S9].

## 7. Piano-house piano (as far as the synth goes) [S82][S33]
```
chords: wave fatsquare, unison 2, spread 4 (two instances tuned ±3-5 cents and panned hard L/R is the classic M1 trick)
        octave 0, attack 0.002, decay 0.60, sustain 0.25, release 0.30
        cutoff 4000, resonance 0.5, envAmount 1.2 (fast bright attack), glide 0
        fx: width 0.8, reverb 0.2, eq {low -3 below 200, mid +1 at 1k, high +2}, delay {time 8n, feedback 0.15, wet 0.1}
        voicing: bass note (root, octave -1) + min7/maj7 close voicing; stabs on offbeats, held chords in breakdowns
```
Reference sound: Korg M1 "Piano16" comped stabs; sits under a 4x4 kick without fighting [S82].

## 8. Riser [S38][S39]
```
fx (riser): wave fatsawtooth, unison 4, spread 50 (noise substitute; or pwm unison 4), octave +1
            attack 0.5, decay 0, sustain 1, release 0.5; one held note spanning the build
            pitch: two notes with glide → [60,0,16,90] then [72,16,16,110] with glide 4.0 (covers -12→0 st over 8 bars)
            automation: filter.cutoff 150 → 10000 over 8 bars; volume -20 → 0 dB; resonance 1.0-1.5
            fx: reverb 0.4 (6 s tail for long risers, 2-3 s for short), delay {time 8n., feedback 0.3, wet 0.25} (375 ms at 128), width 1.0
```
Length 4-16 bars, ends on the drop's beat 1 [S38]. Pair with a snare roll (see 40-harmony-hooks §E).

## 9. Impact / drop hit [S39][S18][S25]
```
fx (impact): layer A crash on beat 1 (or beat 2 for a delayed hit; 1-beat short variant)
             layer B reverse crash / reversed kick: 1 beat long, ends exactly on the drop's beat 1
             layer C sub drop: wave sine, octave -1, [36,0,2,120] with glide 1.5 from +12 st → dives across 2 beats; width 0; no duck
             layer D bell / one-shot: on beat 1 of the drop (garage), reverb 0.3
             white-noise crash substitute: pwm unison 4 spread 60, filter {highpass 1000}, eq {high +3 at 7k}, volume ramp to -inf over 4-8 bars
```

## 10. Vocal chop treatment (`audio` track) [S24][S23][S62][S46]
```
audio: filter {highpass 150-200}; comp {threshold -20, ratio 4}; gate on; drive 0.2 (parallel-style grit)
       pitch: keep within ±3-4 st unless formant-preserving; a doubled copy an octave down for weight
       delay {time 8n or 16n, feedback 0.3, wet 0.2}; reverb 0.15; eq {mid -2 at 3.2k dynamic}
       section automation: filter.cutoff 800 (intro tease) → 12000 (breakdown) ; delay.wet 0.1 → 0.35 into the drop
```

## Cross-cutting numbers

| Setting | Value | Sources |
|---|---|---|
| Supersaw detune | 6-8 voices at 15-25 cents; too much = wide mush, too little = phasing | [S83] |
| Pad filter | 1.8-2.2 kHz, resonance 10-20% (common practice) | [S83] |
| Reese detune | ±0.30 st; mellow ±0.15; LP ~650 Hz, res ~14% | [S28] |
| Rolling bass filter | 200 Hz, 24 dB, res 5-10%, env amount 40% | [S19] |
| Stab filter env | 0 / 556 ms / 0 / 156 ms | [S56] |
| Riser sweep | 150 Hz → 10 kHz, 8 bars, -12 → 0 st | [S38] |
| Hoover pitch dive | 8 st down at note start | [S30] |
