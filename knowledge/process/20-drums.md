# 20 · Drums: kick, hats, clap pocket, garage skip, groove numbers, drum bus

Studio grid: notes `[midi, startBeat, durBeats, velocity]`; one 16th = 0.25 beat; swing is global 0.50-0.67. Attack Magazine swing percentages map 1:1 (60% → 0.60). MPC "68/69" exceeds the studio ceiling; use 0.66-0.67.

## Kick

Selection and tuning
- 909 family for tech house [S10][S13]; 808/909 hybrid for chugging grooves [S11]; "tougher techno kick, extended length with noticeable pitch" for hardgroove/hard house at 138+ [S57]; distorted 909 with extra bite for KETTAMA-style rave [S58]; distorted four-to-the-floor for speed garage [S25].
- Fundamental lives at 40-100 Hz [S48]; a 50 Hz kick with the bass parked at 70-90 Hz (or 45-55 Hz) is the club default [S46]; "knock" at 90-110 Hz [S46]. High-pass at 30-35 Hz [S10][S48]; sub below 35-40 Hz only eats headroom [S46].
- Tune the sub/decay part to the key; the click's pitch is irrelevant once layered [S68]. Examples: kick pitched -2 st to F# [S12]; +3 st in a garage kit [S15]; kick on G with its EQ peak at 50-60 Hz (Lake-style) [S21]. Tune so the fundamental is not on the bass root's frequency [S47].
- Decay: sustain 0, decay sets the length [S68]. Club energy wants a "boomy tail" [S23]; secondary layers get shortened sustain/decay [S10]. Derived rule for this studio: at 126 BPM a 16th is 119 ms and an 8th is 238 ms; the kick tail must be out of the way before the offbeat bass note, so a 200-300 ms audible tail is the ceiling for rolling tech house and 150-250 ms for 140+ lanes (derived from grid math, not a quoted value).

Layering recipe (three tracks in the studio)
1. `kick` main: 909 body, HPF 30 Hz, saturate low band separately (Saturn split at 77 Hz, tape, ~85% drive above the split) [S10].
2. `sub` layer: 808 tuned to the same note, note length longer than the main kick, on every beat [S12]; or LP at 80 Hz, attack at minimum, 35% overdrive [S35].
3. click layer: same pattern pitched +3 st, everything below 220 Hz removed, decay shortened, distorted, then HPF 760 Hz [S10]; or a 707 hit for snap [S16]; or a shaker layered on the kick for texture [S13][S17].

EQ moves that recur: cut 150 Hz -1 to -2 dB and 300 Hz -3 dB for box; +6 dB at 1.5 kHz to add definition, -7 dB at 1.5 kHz to remove click from an 808 layer; nothing useful above 10 kHz [S48].

## Hi-hats (909 school)

Tech house / hard house
- Open hat on every offbeat 8th: beats 0.5, 1.5, 2.5, 3.5 [S13][S57]. Pedal-style closed hat on the offbeats with two decay lengths alternating [S11]. Closed 909 hats with 1/16 swing moved by hand [search consensus, S79].
- 16th closed hats "with reduced velocities on certain beats" [S10]. Forum-consensus ladder per beat: 1st 16th full, 2nd low, 3rd medium, 4th lowest [S79]. NI's house pattern: closed 8ths plus one swung 16th before beat 3 at velocity 86 [S65].
- Shaker on 16ths with velocity variation and swing quantize [S13][S57]; ride on quarters ducked by the kick [S57] or ride 8ths [S12]; ride on-beat "almost subliminal" [S11].
- Hat processing: remove sustain and lows, chorus/flanger at a low mix, sweep EQ to 4 kHz [S10]; boost 2-5 kHz on hats/claps [S21].

Executable tech-house top (1 bar, velocities 1-127)
```
openhat: [42,0.5,0.2,105] [42,1.5,0.2,100] [42,2.5,0.2,105] [42,3.5,0.2,100]
hat 16ths: velocities per 16th [110,70,90,60] repeating; drop the 16th on 0.5/1.5/2.5/3.5 if the open hat is loud
shaker 16ths: [70,55,85,50] repeating; ride quarters at 45 with duck:true
```

Garage / speed garage
- Hats on every offbeat with a short decay between closed and open [S16]; open hats halfway through beats 1, 2 and 4, swung "slightly after" the 8th and 10th 16ths; closed hats after the 2nd, 4th and 6th 16ths plus on beats 1 and 3 [S29]. Extensive ghost hits on hats [S17]; cabasa on offbeats for brightness [S15]; 16th tambourine where the velocity shape carries the roll [S16].
- Hat send to a 1/8 echo at ~40% feedback, send level -25 dB [S18].

## Clap / snare: layering and pocket

- Placement: beats 2 and 4 (studio beats 1.0 and 3.0) in every lane [S10][S13][S16][S29].
- Layers: snappy snare + short mono clap + wide clap [S71]; LinnDrum + Drumtrax claps + a snare [S12]; two snares + one clap [S11]; three snares (two DM5 + pitched 808) [S16]; primary clap pitched -4 st with hard L/R duplicates for width [S10].
- EQ: snare HPF 180 Hz, bell at 250 Hz; clap decay shortened [S10]; 707 clap/snare HPF from 120 Hz [S13]. Reverb: 0.4 s decay at 15% wet [S20], or a hall with pre-delay synced to tempo for a "rebound" [S11].
- Pocket: claps nudged forward (early) by a few ms [S10][S14]; three claps spread a few ms before and after the beat give a "whip" into the downbeat [S71]. Studio execution: main clap at 1.00 and 3.00, a second clap layer at 0.98 and 2.98 (≈10 ms early at 126 BPM), optional third at 1.02.
- Secondary snare: a subtle hit just before the 3rd and 7th kicks, pushed late by the swing [S11] → `[38,2.75,0.1,55]` and `[38,6.75,0.1,55]` over 2 bars; snare doubles every two bars as a fill [S12]; a tighter higher snare on unusual positions at low level as ghost hits [S13].

## Garage skip: 2-step and 4x4 patterns

2-step (NI, 132 BPM, A minor) [S29]
```
kick:   [36,0.0,0.3,100] [36,2.5,0.3,100]
snare:  [38,1.0,0.2,100] [38,3.0,0.2,100]
openhat:[46,0.5,0.2,100] [46,1.5,0.2,100] [46,3.5,0.2,100]   (swung)
hat:    [42,0.0,0.1,80] [42,0.5,0.1,70] [42,1.0,0.1,80] [42,1.5,0.1,70] [42,2.0,0.1,80] [42,2.5,0.1,70]
```
Variations: kick on 1 plus the offbeat of 3, with a double hit at the start of bar 2 [S15]; no kick on beat 1 of bar 2 in a rolling 2-step [S16]; ghost snare on the last 16th of the bar at velocity 40-50 [S17]; two rimshots in call-and-response with loose timing (±0.03 beat) and the second +2 st [S15]; ghost notes at 25-40% velocity between main hits [S26].

Speed garage 4x4 (138-140) [S25]
```
kick:   every beat, distorted
snare/clap: 1.0 and 3.0, plus a skippy top loop with offbeat snares at low level (e.g. [38,1.75,0.1,60] [38,2.25,0.1,55] [38,3.75,0.1,60])
openhat: offbeats; breakbeat loop underneath, high-passed; crash on beat 1 of the drop
```
Interplanetary Criminal style at 128: kick and rim fills on a 16th-triplet grid with dynamic velocities, kick entering on bar 3, bell on the first downbeat, Amen slices at -1 and -4 st as fills [S18]. The studio grid is straight, so approximate the triplet feel with swing 0.66 on the fill tracks.

## Groove numbers per lane

| Lane | Swing (studio 0.50-0.67) | Velocity ranges | Sources |
|---|---|---|---|
| Tech house, clean | 0.55-0.65 (Naughty 55-65) → use 0.56-0.60 | downbeats 110, offbeats 90, filler 70-80 | [S10][S19] |
| Tech house, chugging | 0.60-0.75 quoted → cap at 0.65 | ghost hits 50-60 | [S11] |
| Deep tech / dusted | 0.60-0.65; dusted 0.70-0.80 → cap 0.67 | ghost hats 40-60 | [S13][S14] |
| UK garage / 2-step | 0.60-0.65; MPC16 68/69 → 0.66 | main 100-110, ghosts 25-50 | [S15][S16][S17][S26] |
| Speed garage | 0.60-0.66 on hats/rims; kick straight | snares in top loop 50-65 | [S25][S18] |
| Hardgroove / hard house 138-145 | swing on hats and shaker only, kick and ride straight → 0.54-0.58 | shaker ladder 50-90 | [S57] |

Bass-line swing sweet spot for tech house is 56-58%; under 54 feels stiff, over 62 drags [S19].

## Percussion roles

| Role | Job | Placement | Sources |
|---|---|---|---|
| ride | subliminal on-beat lift, or 8ths | quarters (duck:true) or 8ths at low velocity | [S11][S12][S57] |
| conga / tom | 2-quarter repeat cycle; tom on an offbeat every 2 bars pitched high | hardgroove, dirty tech house | [S57][S12] |
| bell / impact | marks the drop | beat 1 of the drop | [S18][S25] |
| breakbeat / Amen | '90s character, fills | high-passed under the kit; sliced fills at bar ends | [S58][S18][S25] |
| vinyl crackle | glue | whole drop at low level | [S18][S25] |
| cabasa / shaker | brightness without harshness | offbeats / 16ths | [S15][S13] |

## Drum bus processing

| Setting | Value | Sources |
|---|---|---|
| Glue compressor | 2 dB gain reduction, slow attack, fast release; a second stage at ~10 dB in parallel | [S10] |
| SSL-style bus | very subtle; ~4 dB peak reduction to gel | [S11][S13] |
| Garage glue | 2-3 dB max, slowest attack, then a safety limiter | [S18] |
| Generic starting point (common practice) | attack 10-30 ms, release 50-150 ms or auto, ratio 2:1-4:1, 2-4 dB GR; parallel copy 8:1 at 10-12 dB blended ~30% | [S80] |
| Drive | Ableton Drum Buss drive 25%, crunch 27%, 80% wet [S15]; Decapitator with low cut and parallel glue [S12]; KETTAMA: ~30% distortion mix across four layered loops and a boost around 10 kHz on the drum group [S58] |
| Headroom | leave room for bass, synths and FX after the bus | [S11] |

Studio mapping: drum group `comp {threshold: -18, ratio: 3}`, `drive 0.15-0.3` (garage/hard house 0.3-0.4), `eq {high: +2}` for KETTAMA-style tops, hats `width 0.6-0.8`, kick and sub `width 0`.
