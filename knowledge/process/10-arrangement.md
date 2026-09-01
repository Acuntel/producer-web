# 10 · Arrangement: bar-accurate templates, drop timing, mutation rules

Grid: 4/4, 1 bar = 4 beats = 240/BPM seconds. Sections in the studio are `{bars, tracks, fill, variant, automation[]}`; a section boundary is always a multiple of 8 bars.

## Seconds per phrase (for drop-time targets)

| BPM | 1 bar | 8 bars | 16 bars | 32 bars | 64 bars |
|---|---|---|---|---|---|
| 124 | 1.94 s | 15.5 | 31.0 | 61.9 | 123.9 |
| 126 | 1.90 s | 15.2 | 30.5 | 61.0 | 121.9 |
| 128 | 1.88 s | 15.0 | 30.0 | 60.0 | 120.0 |
| 130 | 1.85 s | 14.8 | 29.5 | 59.1 | 118.2 |
| 136 | 1.76 s | 14.1 | 28.2 | 56.5 | 112.9 |
| 140 | 1.71 s | 13.7 | 27.4 | 54.9 | 109.7 |
| 145 | 1.66 s | 13.2 | 26.5 | 53.0 | 105.9 |

## Phrase law

- Dance music moves in 8-bar phrases; changes faster than that disorient [S40]. DJs mix in 16/32-bar phrases and start a blend 32 bars before a drop or outro, so every structural event must sit on an 8-bar boundary, big ones on 16 or 32 [S72].
- Intros of 16 or 32 bars are the DJ contract: 16 gives one phrase, 32 gives options [S23][S72]. Tech house commonly uses a full 32-bar intro (two 16-bar halves) [S23]. Drops are 32 bars, built as four 8-bar cells A/B/C/D [S23]. Breakdown + build = 8-16 bars [S22][S41].
- Drop 2 is the same length or longer than drop 1 and develops it with a fresh element [S41]; a common device is 4 extra build bars before drop 1 and 8 before drop 2 [S42].

## Template T1: tech-house extended / club mix (126 BPM, 176 bars, 5:35)

| Bars | Section | Active tracks | What happens |
|---|---|---|---|
| 1-16 | Intro A | kick, hat, openhat, perc | drums only; one new element every 8 bars [S40] |
| 17-32 | Intro B | + bass (filter.cutoff 300→full), + hook teaser filtered | bass enters bar 17; hook teased bar 25 [S23] |
| 33-40 | Breakdown 1 | hook, pad, vocal; kick out | strip to the hook; reverb send rises [S37] |
| 41-48 | Build 1 | + hat/perc bars 3-4, + counter bars 5-6, + snare roll + riser bars 7-8 | 8-bar build recipe [S37]; sub silent bars 47-48 [S37]; last beat silent or reverse kick [S29][S39] |
| 49-80 | Drop 1 | all; cells A/B/C/D of 8 bars | A = full groove, B = hat variant, C = bass variant, D = fill-heavy [S23] |
| 81-96 | Breakdown 2 | vocal/hook exposed, chords | the "song" section; longest exposed vocal [S3] |
| 97-104 | Build 2 | as Build 1 plus 8-bar snare roll (8ths×4, 16ths×2, 32nds×2) [S37] | filter 40%→100% over bars 97-103 [S37] |
| 105-144 | Drop 2 | all + one new layer (rimshot/ride/extra bass note) | 40 bars = 32 + 8 [S41][S59] |
| 145-176 | Outro | mirror of Intro B then Intro A | remove elements every 8 bars [S72] |

Drop 1 lands at bar 49 = 1:31; drop 2 at bar 105 = 3:18 at 126 BPM. Fisher's "Losing It" (125 BPM, 6:40) instead opens with only 8 bars of filtered kicks, then runs breakdown→build→drop three times with a different final build, adding rimshots in drop 2 and rides in drop 3 [S59].

## Template T2: tech-house radio edit (126 BPM, ~3:05)

Beatportal's timeline: intro 0:00-0:30, breakdown 0:30-0:45, drop 0:45-1:15, main 1:15-3:30, outro 3:30-4:00 [S22]. Bar-accurate version: intro 8 (0:00-0:15), vocal 8 (0:15-0:30), build 8 (0:30-0:45), drop 1 16 (0:45-1:15), verse 16 + build 8 (1:15-2:01), drop 2 24 (2:01-2:47), outro 8 (2:47-3:02). Rule: first drop inside 45 s, no drums-only stretch longer than 8 bars.

## Template T3: speed garage / hard house (140 BPM, 128-144 bars, 3:40-4:07)

| Bars | Section | Active tracks | What happens |
|---|---|---|---|
| 1-16 | Intro | kick or breakbeat top loop, hat, perc, bass filtered | 16-32 bar intro with filtered drums and vocal [S24] |
| 17-24 | Build | + vocal chop, bass filter opens, hat high-frequency automation | 24-bar run-up; beat removed for bar 24 (1 bar of silence before the drop) [S29] |
| 25-56 | Drop 1 | all; crash + bell/impact on beat 1 | drop on bar 25 [S29]; church bell on first downbeat [S18]; crash on first beat of drop [S25] |
| 57-72 | Breakdown | bass filter closes, vocal, swell FX, siren | "open the filter during drops, close it during breakdowns" [S24] |
| 73-80 | Build 2 | snare roll, noise downlifter, backspin, reversed kick | [S25][S39] |
| 81-112 | Drop 2 | all + alternating bass motif / octave-jump variant, breakbeat fills | second drop uses fresh motif and vocal chops [S24][S25] |
| 113-144 | Outro | bass out first, then vocal, drums last | 16-32 bars [S24]; NI example goes bassless at bar 73 of ~80 [S29] |

Drop 1 at 0:41, drop 2 at 2:17 at 140 BPM. Garage records run short (NI's demo is ~80 bars, ≈2:30 at 132 [S29]); KETTAMA's hard-house / rave cuts are loop pieces that live on fills at the end of every 4 and 8 bars [S58], with a kick-repeat variation every 8 bars and an extra tom every other bar [S57].

## Mutation rules ("something changes every 8 bars")

| Every | Change (pick one) | Sources |
|---|---|---|
| 2 bars | snare double; tom on an offbeat; extra syncopated kick | [S12] |
| 4 bars | extra open hat on the 4-bar turn; rim fill on 16th-triplets; stab rhythm varied in bar 4 | [S12][S18][S32] |
| 8 bars | add or remove kick notes on the last beat; kick-repeat pattern; hat pattern variant; clap thrown to a long reverb on the last beat; drum fill; stab rhythm varied in bar 8 | [S44][S57][S58][S32] |
| 16 bars | element in or out; filter cutoff step; bass pattern variant (Losing It cycles four 4-bar bass variants) | [S43][S59] |
| 32 bars | section change | [S43] |

Studio mapping: `variant` on the drum tracks every 8 bars, `fill: cut|roll|riser` at bars 8/16, `automation` ramps that span the 16-bar cell.

## Transition devices with lengths

| Device | Length | Where it ends | Numbers | Sources |
|---|---|---|---|---|
| Snare roll, short | 1 bar of 16ths | beat 4.4 or last 16th | velocity ramp 1→127 or pitch/filter rise; variant ends at beat 2.4 leaving a gap | [S36] |
| Snare roll, long | 8 bars | last 16th before drop | 8ths for 4 bars, 16ths for 2, 32nds for 2; velocity 60%→100%; pitch -1 to -2 st across the roll | [S37] |
| Riser | 4-16 bars (8 typical) | beat 1 of drop | pitch -12→0 st over 8 bars; cutoff 150 Hz→10 kHz; volume -20→0 dB; reverb 6 s at 40% for long risers | [S38] |
| Reverse kick / reverse crash | 1 beat | ends exactly on drop beat 1 | reversed kick placed on the beat before the drop | [S39] |
| Silence gap | 1 bar (garage) or 1 beat (house) | beat 1 of drop | remove the beat one bar before the drop | [S29] |
| Micro-drop | bar 6 of an 8-bar build | bar 7 | near-silence, then the build re-accelerates | [S37] |
| Crash | beat 1 (or beat 2 for a delayed hit), 1 beat short variant | — | white-noise crash fades over 4-8 bars, low cut 1 kHz, boost 7 kHz | [S39] |
| Filter sweep intro | first 2 bars of a section | bar 3 | high-pass automated off after bar 2 down to ~80 Hz | [S18] |
| Hangover | tails only | fades into the drop | cut the source, let reverb/delay tails carry over, tame with volume automation | [S39] |
| Extra bars | +4 before drop 1, +8 before drop 2 | — | tension by phrase extension | [S42] |

## Executable section blocks (studio JSON)

```
{ "name":"introA","bars":16,"tracks":["kick","hat","openhat","perc"],"fill":"none","variant":0 }
{ "name":"introB","bars":16,"tracks":["kick","hat","openhat","perc","bass"],"fill":"cut",
  "automation":[{"track":"bass","param":"filter.cutoff","from":300,"to":8000}] }
{ "name":"build1","bars":8,"tracks":["chords","vocal","hat","perc","snare","fx"],"fill":"roll",
  "automation":[{"track":"chords","param":"filter.cutoff","from":800,"to":12000},
                {"track":"fx","param":"volume","from":-20,"to":0}] }
{ "name":"drop1","bars":32,"tracks":"all","fill":"cut","variant":[0,1,2,3] }
```
