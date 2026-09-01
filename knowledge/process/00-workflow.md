# 00 · Workflow: how the top producers in these lanes actually build a record

Scope: tech-house (Summit / Dolla / Lake / Fisher, 124-130) and hard-house / speed-garage (KETTAMA / IC / Virji / salute, 132-145).
Source markers [Sn] resolve in 80-sources.md. Numbers are quoted; where a value is common practice rather than a measured fact it says so.

## 0. The loop (six stages, time-boxed)

| Stage | Output | Time box | Exit test |
|---|---|---|---|
| A Reference | 2-3 reference tracks, level-matched, drop sections cued | 10 min | You can name what each ref does better than your last track [S52] |
| B Sketch | one 8-bar loop: kick + bass + one hook element | 30 min max [S1] | Loop survives 20 repeats without boring you; groove reads on laptop speakers [S1][S2] |
| C Sounds | final kick, bass (sub + top), hook patch, hats/clap | 60-90 min | Kick+bass alone hit like the reference at matched loudness |
| D Arrange | full timeline copied down from the busiest section [S40] | 60 min | Something changes every 8 bars; drops land on phrase boundaries (see 10-arrangement) |
| E Mix | levels, sidechain, mono low end, bus glue | 60 min | Kick/bass drop peaks near -6 dBFS pre-limiter, nothing clips [S46] |
| F Check | LUFS, crest, band balance, A/B vs refs, second listening system | 20 min | Within lane targets in 60-mix-master; then test in a DJ set [S3] |

Total: one working day for a club-ready demo. Summit's rule: 30 minutes for the sketch, then months of "producing it out" on the road, adding layers and ear candy last [S1]. Dolla and Lake both finish entire releases on a laptop with headphones or built-in speakers [S2][S3]; Lake released "I Remember" barely changed from the first laptop mix [S2]. The lesson for a browser studio: the sketch and the groove are 80% of the record; do not stall on the mix.

## A. Reference (what to compare, how)

1. Pick 2-3 references in the same lane and tempo. Aim at a consensus, not one track's quirks [S52].
2. Level-match. Louder always sounds better for the first seconds; match integrated or short-term LUFS before any judgment [S52]. Common practice: match within 0.5 dB using a loudness meter on the drop [S53].
3. Line up like for like: your drop against their drop, never your drop against their intro [S52].
4. Compare four things in this order: tonal balance (how much sub/low/mid/high), mix balance (kick vs bass vs hook vs vocal), stereo width per band, dynamics (are you far less dynamic than the ref?) [S52].
5. In this studio: measure the ref and the sketch with the same analyzer (LUFS, crest, band shares, centroid, pump depth) and keep the ref numbers as the session's target row. Replace "sounds thin" with "lowMid share 4 points below ref".

Failure modes: comparing at unequal loudness (fix: match first); using a streaming master as the club target (club masters are 4-8 LU louder, see 60-mix-master [S49]); referencing a track from a different tempo lane.

## B. Sketch loop (8 bars, 30 minutes)

- Summit starts from an 8-bar chord progression or a Splice sample, draws MIDI by mouse, then adds bass and groove, then arrangement and transitions [S1].
- Lake's modern sound is few sounds, heavily processed: the record is kick + bass working together; everything else orbits them [S20]. Fisher's "Losing It" is a 4-bar bass loop on two notes plus automation [S59].
- KETTAMA works FL Studio "like an MPC", loop-based, sample-heavy, "whatever comes out, comes out" [S6][S7]. Virji: "if it sounds good, it's good" [S4].
- Decision points in the sketch: (1) tempo and lane, (2) key (tech-house favors G/A/F minor [S21][S23]; Virji favors F# for sub rattle [S4]), (3) the one hook element (vocal chop, stab, or bass riff), (4) whether the bass is the hook (Lake/Fisher) or the vocal is (Summit/Dolla).
- Listen for: does the offbeat bass make the kick feel bigger, not smaller; do hats have a velocity shape; does the loop have one surprise per 4 bars.
- Failure modes: too many elements (fix: mute until only 4 tracks remain and it still moves); loop only works loud (fix: check on laptop speakers, Summit's and Lake's first pass [S1][S2]); bass and kick fight (fix: see 30-bass tuning rules).

## C. Sound selection

- Kick first, tuned to key (Lake: kick on G with energy at 50-60 Hz [S21]; Attack: kick pitched -2 st to F# [S12]). Then the bass sits either above (70-90 Hz) or below (45-55 Hz) the kick fundamental, never on it [S46].
- Bass as two channels: one sub, one top grit or tone (Dolla) [S3]. In this studio: `sub` role sine, `bass` role saw/wavetable high-passed 65-100 Hz [S35][S18].
- Hook element next, then hats/clap, then percussion. Ear candy (pads, plucks, vocal chops) last [S1].
- Speed garage: choose the reese/warp bass preset first, disable any noise-osc modulation, then build the drums around it [S24].

## D. Arrangement (see 10-arrangement for the templates)

Build the busiest 8 bars first, copy the timeline, then remove elements backwards to create intro, breakdowns and builds [S40]. Dolla arranges with the dancefloor in mind: when to tease the vocal, when to drop the drums, tension then relief [S3]. Fisher repeats breakdown-build-drop three times, each drop adding one drum element (rimshots in drop 2, rides in drop 3) [S59].

## E. Mix (see 60-mix-master for numbers)

- Order: kick and bass balance and sidechain, then hats/clap against kick, then hook, then FX. Tech house is dry; keep reverb and delay minimal and widen only hats and FX [S22].
- Bus: gentle glue on drums (2-4 dB) [S10][S13][S18]; master peaks near -6 dBFS before the limiter [S46]; premaster at -12 to -10 LUFS for a club master, -18 to -16 for a streaming master [S49].
- Monitoring switch: laptop speakers for balance, headphones for the "nitty-gritty" [S1]; Dolla rotates four headphones and earbuds [S3].

## F. Check, then test

1. Measure: integrated LUFS, crest, band shares, pump depth, swing, kicks per bar, drop time. Compare to the reference row.
2. Fix the largest single deviation only, re-measure.
3. Play it in a set before sending to a label (Dolla) [S3].

## Lane deltas (what changes between the two lanes)

| Decision | Tech house 124-130 | Hard house / speed garage 132-145 |
|---|---|---|
| Sketch seed | 8-bar chords or vocal sample [S1] | Bass preset + top drum loop [S24][S25] |
| Groove | swing 0.56-0.60, offbeat bass [S19][S10] | swing 0.60-0.66 skippy hats/rims [S15][S16], 4x4 kick with distortion [S25] |
| Hook | vocal or plucky bass | warp bass riff, organ/rave stab, sped-up vocal [S8][S67] |
| Sidechain | 5-7 dB pump, release ~110 ms at 124 [S19] | shallow 2-5 dB or sub-only ducking [S18][S24] |
| Drops | 32 bars as 4x8 [S23] | 32 bars, rewind-friendly crash + bell on beat 1 [S18][S25] |
| Master | -8 to -6 LUFS club [S49] | same target; more distortion on drum bus (30% mix, +10 kHz) [S58] |

## Session checklist (executable)

- [ ] refs loaded and measured; target row stored
- [ ] tempo, key, lane chosen; kick tuned; bass root placed off the kick fundamental
- [ ] 8-bar loop with ≤ 5 tracks that moves on laptop speakers
- [ ] hats have a velocity ladder; clap sits early by a few ms [S10][S14]
- [ ] one surprise every 4 bars in the loop, one change every 8 bars in the arrangement
- [ ] drops on 8/16/32-bar boundaries; intro ≥ 16 bars for DJ use [S23][S24]
- [ ] mono below 120 Hz; non-bass tracks high-passed 120-220 Hz [S46][S47]
- [ ] premaster -12 to -10 LUFS, peaks ≤ -6 dBFS, limiter ceiling -0.3 to -0.1 [S35][S49]
- [ ] measured row within lane targets; largest deviation fixed; re-measured
