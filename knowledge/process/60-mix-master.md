# 60 · Mix and master: levels, band balance, sidechain, loudness, diagnostics

Studio: per-track `volume`, `eq {low, mid, high}`, `comp {threshold, ratio}`, `width`, `drive`; master `compThreshold, makeup, limiter, filter`. Measured: integrated LUFS, loudness range, crest, band shares (sub <60, low 60-250, lowMid 250-500, mid 500-2k, highMid 2-6k, air >6k), centroid, pump depth, kicks per bar.

## A. Level targets per element (relative to the kick)

| Element | Level vs kick | Notes | Sources |
|---|---|---|---|
| kick | 0 dB reference; peaks around -6 dBFS on the master before limiting | drop peaks of kick/bass ≈ -6 dBFS; never above -3 dBFS pre-limit | [S46] |
| bass + sub | -1 to -3 dB below kick (common practice) | sub and bass together should not exceed the kick's peak | [S84] |
| clap/snare | -3 to -6 dB | high-passed 120-180 Hz | [S10][S13] |
| hats / openhat | -8 to -14 dB | NI's garage kit sits at -3 dB, the loop at -13.9 dB | [S29] |
| vocal / hook | -3 to -5 dB | NI vocal -4.5 dB, lead synth -3 dB, bells -10 dB | [S29] |
| stabs / pads | -6 to -12 dB | ducked 2-4 dB | [S46] |
| FX / risers | ramp -20 → 0 dB into drops, then out | [S38] |
| ride | "almost subliminal" | -15 dB or lower | [S11] |

Premaster: -12 to -10 LUFS integrated for a club master, -18 to -16 LUFS for a streaming master, with 6 dB of headroom before the limiter [S49]; peaks ≤ -6 dBFS [S46]; K-20 average around -20 dBFS RMS with peaks 10-15 dB above (crest 10-12 dB) [S51].

## B. Band balance of finished club masters (in the system's bands)

Published numbers for energy shares do not exist; every tool (iZotope Tonal Balance Control) uses genre curves with a broad "Low / Low-Mid / High-Mid / High" pass-fail view [S85]. What is sourced: sub mono below 100-120 Hz [S46][S47]; bass power 45-55 or 70-90 Hz [S46]; mud 180-300 Hz to cut [S46]; boxiness 500-800 Hz [S46]; harshness 2-5 kHz [S46]; air above 10 kHz, cut steeply on kicks [S46][S48].

Procedure (not a guess): measure the three lane references with the studio analyzer, store the median band shares and centroid as the target row, and judge the master by deviation from that row. Expected shape from the zones above: sub+low carry most of the energy, lowMid is the smallest of the low bands after mud cuts, mid and highMid decline, air is small. A tech-house master should read a lower centroid than a hard-house master because hard house boosts the drum bus around 10 kHz and distorts tops [S58].

## C. Sidechain settings (see 30-bass §D for the full table)

Tech house: 5-7 dB, attack 1-2 ms, release 100-120 ms, 4:1-6:1 [S19]. Techno / hard house pump: 6-12 dB, release 200-350 ms at 128, max ≈ 60000/BPM [S45]. Subtle club duck on pads/stabs: 2-4 dB, release 80-140 ms [S46]. Garage: ≤ 4-5 dB, attack at minimum, or sub-only ducking [S18][S24]. Multiband: 8-12 dB below 200 Hz, 2-4 dB 200 Hz-2 kHz, nothing above [S45]. Studio pump depth: tech house 0.5-0.65, hard house 0.65-0.8, garage 0.3-0.45.

## D. Loudness and true-peak targets

| Deliverable | Integrated LUFS | True peak | Crest / LRA | Sources |
|---|---|---|---|---|
| Club / DJ master (tech house, hard house, speed garage) | -8 to -6 | -0.1 dBTP (ceiling -0.3 is the safer Attack value) | crest 5-8 dB typical for EDM; LRA 3-4 LU for loop-based dance, 6-12 LU acceptable | [S49][S35][S50][S86] |
| Club master, more dynamic | -9 to -7 | -0.5 to -0.1 | crest 8-10 | [S87] |
| Streaming master | -14 (Spotify/Beatport), -16 (Apple) | -1.0 dBTP | crest 8-12 dB is iZotope's "works everywhere" range | [S49][S50] |
| Mix bus into mastering | -12 to -10 (club) / -18 to -16 (streaming) | ≤ -6 dBFS peaks | crest 10-12 | [S49][S46][S51] |

Two masters are the standard: one for club, one for streaming [S49]. A -10 LUFS master with 6 dB of headroom often sounds bigger on streaming than a -6 LUFS brick [S49]. iZotope: EDM crest factors of 3-5 dB are common but below 9-10 dB flags over-processing [S50].

## E. Limiter and clipper practice

- Chain: soft clipper before the limiter shaving 1-3 dB of only the kick/snare tips, then a true-peak limiter; the clipper reduces peaks 2-4 dB before the limiter sees them [S88].
- Ceiling: -0.3 dBFS [S35]; -0.1 for club files [S21][S49]; -1.0 for lossy delivery, 0.3 for lossless [S51].
- Studio master: `compThreshold -12 to -8` (2-4 dB of glue), `makeup` to hit the LUFS target, `limiter` ceiling -0.3, `filter` high-pass 30 Hz.
- Per-lane: hard house / KETTAMA tolerates 30% drive on the drum group and a +10 kHz lift [S58]; tech house stays dry and clean with widening only on hats/FX [S22][S21].

## F. What the complaints measure as, and the first fix

| Complaint | Measures as | Zone | First fix | Sources |
|---|---|---|---|---|
| Muddy | lowMid share high; low band crowded; centroid low | 200-500 Hz (worst 200-350); bass mud 180-300 | cut 2-4 dB with Q 1-2 on the offending tracks, high-pass non-bass at 120-220 Hz, then boost sub if needed | [S89][S46] |
| Boxy | mid share high | 500-800 Hz | narrow cut on kick (300 Hz -3 dB) and pads | [S46][S48] |
| Harsh | highMid share high; centroid high | 2-5 kHz (worse at club volume) | dynamic cut 2.5-4 kHz on leads/vocals, tame hats, lower drive | [S46] |
| Thin | low share low; crest high | missing 100-250 Hz punch or 45-90 Hz power | kick punch 100-250 Hz, bass power at 70-90 Hz, check the sub is mono and on a note ≥ 40 Hz | [S48][S46] |
| Doesn't hit | pump depth low; kick masked; crest too low | kick fundamental vs bass root overlap; sub below 35-40 Hz eating headroom | tune kick off the bass root, sidechain 5-7 dB (tech house), high-pass 35 Hz, un-squash (crest ≥ 8) | [S47][S19][S46][S50] |
| Weak top / dull | air share low; centroid low | above 6-10 kHz | +2 dB high shelf on drum group, hat velocity, 10 kHz lift for hard house | [S58][S21] |
| Loud but small | LUFS at target, LRA < 3, crest < 5 | over-limited | back the limiter off 2 dB, clip the kick instead, restore the drop-vs-breakdown contrast | [S49][S50] |
| Flat arrangement | section energy contour flat | — | see 10-arrangement mutation rules; drop 2 must read louder than drop 1 by 0.5-1 LU short-term (derived rule) | [S41] |

## G. Reference-check procedure (every export)

1. Level-match to the reference within 0.5 dB and compare drop to drop [S52][S53].
2. Read: integrated LUFS, crest, LRA, band shares, centroid, pump depth. Fix the largest single deviation.
3. Mono check: bass and kick unchanged in mono; width only on hats/FX/pads [S21][S47].
4. Laptop-speaker pass for balance, headphones for detail [S1][S3].
