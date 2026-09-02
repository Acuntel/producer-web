# CORE · Production laws, key numbers, process checklist (system-prompt digest)

## Process
1. Load 2-3 references in the lane. Level-match within 0.5 dB. Compare drop to drop only. Store the reference's measured row (LUFS, crest, band shares, centroid, pump depth) as the session target.
2. Sketch an 8-bar loop in 30 minutes: kick + bass + one hook. Five tracks max. It must move on laptop speakers.
3. Pick sounds in this order: kick (tuned to key), sub, bass tone, hook, clap, hats, percussion. Ear candy last.
4. Arrange from the busiest 8 bars outward. Every boundary on 8 bars, big ones on 16/32.
5. Mix: kick+bass+sidechain first, then clap/hats, then hook, then FX. Keep tech house dry.
6. Check the measured row, fix only the largest deviation, re-measure, then play it out.

## Groove laws
- Tempo: tech house 125-127; UKG/speed garage 130-138; hard house/rave 142-145.
- Swing (global 0.50-0.67): tech house 0.56-0.60; garage 0.60-0.66; hard house 0.54-0.58 on hats only, kick straight.
- Kick: every beat (4x4) or 2-step (beat 1 and the "and" of 3). Fundamental 40-100 Hz, HPF 30-35 Hz, tail ≤ 250 ms at 126.
- Clap/snare on beats 2 and 4; second layer 0.02 beat early (≈10 ms). Ghost snare at velocity 40-50 on the last 16th (garage).
- Open hat on every offbeat 8th. 16th hats use a velocity ladder [110, 70, 90, 60]. Shakers 16ths [70, 55, 85, 50].
- Velocity: downbeats 110, offbeats 90, fillers 70-80, ghosts 25-50.

## Bass laws
- Two tracks: sub (sine, mono, width 0) + bass tone (saw, HPF 65-100 Hz, LP 350 Hz on tech house).
- Rolling tech house: slots 1 (short, 60% of a 16th), 5 fifth, 6 root, 7 octave, 8 root; offbeats 90-100% length, fillers 70-80%. Cutoff 200 Hz, res ~0.7, filter env 1 ms / 80 ms / 30% / 100 ms, env amount 1 octave, drive 0.2-0.4.
- Warp/reese: fatsawtooth unison 2-4, spread ±30 cents, octave -1, cutoff 650 Hz, resonance 1.5-2.5, glide 0.05-0.1 mono, drive 0.4-0.6, light crush. Notes root, ♭VI, ♭III, b3/b7 tensions, octave jumps, long held notes. Filter open in drops, closed in breakdowns.
- Kick vs bass: never the same fundamental. Kick 50 Hz → bass 70-90 Hz (or 45-55). Sub note ≥ 40 Hz. Mono below 120 Hz. Non-bass tracks HPF 120-220 Hz.
- Sidechain: tech house 5-7 dB, attack 1-2 ms, release 100-120 ms (pump 0.5-0.65); hard house 6-12 dB, release 200-350 ms at 128 (pump 0.65-0.8); garage ≤ 4-5 dB or sub-only (pump 0.3-0.45); pads/stabs 2-4 dB. Release must finish inside one beat.

## Harmony and hooks
- Tech house: minor 7 loops that need not resolve. Cm7 Cm7 Gm7 Gm7 Cm7 Cm7 Gm7 Em7; Am7 Em7 Dm7; Fmaj7 Em7. Change bar 8.
- Garage/hard house: bass-led i → ♭VI → ♭III; chord samples in parallel +5 st; rave stab with a dissonant top note; semitone key-change for drop 2 when there is a vocal.
- Stabs: min7 on offbeats, 16th syncopation off the downbeats, vary bars 4 and 8, HPF 300 Hz, decay 0.3-0.5 s, sustain 0, delay 8n at 20-30% feedback.
- Hooks: 4-bar phrase × 4 with 25% variation; one new element or mutation every 8 bars. Vocal: HPF 150-200 Hz, pitch within ±3-4 st unless formant-preserved, delay 8n/16n, filtered tease in the intro, exposed in the breakdown, chopped in the drop.

## Arrangement numbers
- 1 bar = 240/BPM s: 126 → 1.90 s (32 bars = 61 s); 140 → 1.71 s (32 bars = 55 s).
- Tech house club mix: intro 32 (drums 16 + bass 16) · breakdown 8 + build 8 · drop 1 32 (4×8 A/B/C/D) · breakdown 16 + build 8 · drop 2 40 (adds one layer) · outro 32. Drop 1 ≈ 1:31, drop 2 ≈ 3:18 at 126.
- Radio edit: first drop by 0:45, no drums-only stretch over 8 bars, ≈ 3:00.
- Speed garage / hard house: intro 16 · build 8 (silent bar before the drop) · drop 1 32 with crash + bell on beat 1 · breakdown 16 · build 8 · drop 2 32 with a new bass motif · outro 16-32. Drop 1 ≈ 0:41 at 140. Fills at the end of every 4 and 8 bars.
- Mutations: 2 bars snare double/tom; 4 bars extra open hat or rim fill; 8 bars kick-note add/remove, hat variant, clap to long reverb; 16 bars element in/out or filter step; 32 bars section.
- Devices: snare roll 1 bar of 16ths (velocity 1→127) or 8 bars (8ths×4, 16ths×2, 32nds×2, velocity 60→100%); riser 8 bars, pitch -12→0 st, cutoff 150 Hz→10 kHz, volume -20→0 dB; reverse kick 1 beat before the drop; silence 1 bar (garage) or 1 beat; micro-drop in bar 6 of the build; sub silent in bars 7-8; extra 4 bars before drop 1, 8 before drop 2.

## Mix and master numbers
- Levels vs kick: bass -1 to -3, clap -3 to -6, vocal/hook -3 to -5, stabs/pads -6 to -12, hats -8 to -14, ride ≤ -15.
- Premaster: peaks ≤ -6 dBFS; -12 to -10 LUFS for club, -18 to -16 for streaming. Drum bus glue 2-4 dB, slow attack, fast release; hard house adds 30% drive and +10 kHz.
- Club master: -8 to -6 LUFS integrated, ceiling -0.3 to -0.1 dBTP, crest 5-8 dB, LRA 3-6 LU. Streaming: -14 LUFS, -1 dBTP, crest 8-12. Clipper 1-3 dB on kick tips before the limiter.
- Diagnostics: muddy = lowMid share high, cut 200-500 Hz 2-4 dB and HPF non-bass; boxy = 500-800 Hz; harsh = 2-5 kHz, dynamic cut; thin = missing 100-250 Hz punch or 45-90 Hz power; doesn't hit = kick and bass share a fundamental, pump too shallow, sub below 35 Hz, or crest < 5; loud but small = LRA < 3, back the limiter off 2 dB.
- Band shares: no published targets; measure the references and use their medians. Hard house reads a higher centroid than tech house.

## Lane DNA one-liners
- Summit: 8-bar chord loop + vocal topline, Diva bass, ear candy last (126-127, Am/Em/C#m).
- Dolla: one chopped vocal loop as the hook, sub + grit bass channels, arrange for the floor (125-130, Cm/E♭m).
- Lake: few sounds, heavy processing, cutoff automation is the movement, full-ratio sidechain (125, G/A minor).
- Fisher: one 4-bar bass riff on two notes, escalate drums per drop (rimshots, rides, 8th/16th kicks) (125-127).
- KETTAMA: FL as MPC, four distorted loops, breakbeat top, hoover/rave stabs, fills every 4/8 bars (142-144, G#m/A♭).
- Interplanetary Criminal: triplet-grid skip, bell on the drop, echo hats, organ chords, Amen fills (130-138).
- Sammy Virji: FM/warp bass held long in F#, mix in key, jazz chords and key changes, swingy drums (132-138).
- salute: D-50/DX7 gloss, pumping sidechain, French-house euphoria at garage tempo (132-135).
