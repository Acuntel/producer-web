# GYM LEDGER, round 1 (2026-09-02)

Measured, not judged. Every line below comes from the ears running on real renders in a real
browser, or from the unit suites. Recommendations are recommendations: the user decides.

## What round 1 shipped
Research: 5 DAW feature specs, 8 new lane recipes (melodic, afro, deep, UK garage, jersey club,
trap club, techno, trance), a verified sample-source license table, and a 40 sound CC0 starter
pack with full provenance. Builds merged on objective gates only: multi-lane producer, DAW
features (groove pool, pattern playlists, note chance and velocity deviation), and the sample layer.

## Gates after integration
42 unit tests, 8 ears tests, tsc clean, next build clean, local browser run passed, local
conversational battery 11 of 11, deployed to production, manifest served on the alias.

## Sample layer, proven in a real browser (no model needed)
Manifest loads 40 samples and 4 kits. The house kit assembles in about 30 ms from six real files
with zero fallbacks. Drop measurements per kit, against the medians of the user's own collection:

| variant | LUFS | sub+low | mids | top | centroid |
| --- | --- | --- | --- | --- | --- |
| tech-house, synth drums | -8.9 | 0.88 | 0.07 | 0.04 | 2253 |
| tech-house, starter kit | -7.3 | 0.89 | 0.05 | 0.06 | 2493 |
| tech-house, 808 kit | -10.2 | 0.70 | 0.07 | 0.23 | 4251 |
| hard-house, synth drums | -6.6 | 0.77 | 0.14 | 0.10 | 2835 |
| hard-house, starter hard kit | -5.0 | 0.62 | 0.09 | 0.29 | 4311 |
| tech-house, kit + vocal clip + e-piano | -6.8 | 0.83 | 0.12 | 0.05 | 2312 |
| the user's collection (tech-house p50) | -8.8 | 0.57 | 0.27 | 0.13 | 2484 |

Read: sampled kits fix the top end (0.04 to 0.29 air and high mids, centroid up to 4311 Hz) and
pull sub plus low toward the collection (0.88 to 0.62). Real one-shots do in one move what the
synth voices could not do at all.

## Open recommendations, ranked by measured distance
1. Mids remain the gap everywhere (0.05 to 0.14 against a 0.27 median). The top end is now solved
   by samples; the mid band is chords, stabs and keys. Next experiment: sampled or richer keys and
   stabs carrying the 250 Hz to 2 kHz range, measured the same way.
2. Tech-house sub plus low still reads 0.89 against 0.57. The 808 and hard kits already land at
   0.70 and 0.62, so the fix is kit choice and level, not another synth tweak.
3. Loudness varies by kit from -5.0 to -10.2. A per-kit makeup calibration would make kit swaps
   level neutral, so a kit change is heard as tone, not volume.

## Not proven in round 1
- Live conversational scoring across the eight new lanes. Blocked: the production Anthropic key's
  account ran out of credits mid run. The same code passed 11 of 11 locally minutes earlier.
- Groove map extraction from real DJ tracks (synthetic mixes only so far).
- A real voice session with the taste ledger on.
