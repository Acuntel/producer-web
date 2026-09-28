# The vocal map

One JSON per record, numbers only, written by the worker beside the stems (`worker/vocalmap.py`) and read by the
browser through `lib/song/vocalMap.ts` (the TypeScript type is the contract; this page explains it). It is what the
producer knows about a record's voice: every phrase, every word with a time, the notes, the key, the section, how
much of a hook it is, and exactly where it sits on the record's own grid. It holds no audio, so it can be cached and
shared; the vocal audio stays with the user who brought the record (docs/MASTERPROMPT_PRODUCER.md section 7).

Where it lands:

- `result.vocalMap` on a finished stems job (and on a learn job, which keeps nothing else of the record).
- `<owner>/stems/<job>/vocal-map.json` beside the user's own stems.
- `record_cache.result.vocalMap`, so the next person who pulls the same record gets the numbers at once.

## Shape

```jsonc
{
  "version": 1,
  "source": {
    "name": "Artist - Title", "bpm": 128.0, "key": "A minor", "durationSec": 231.4,
    "grid": "beat_this",            // or "tempo": which path gave the downbeats
    "beatSec": 0.4688,               // the median beat length
    "downbeats": [0.412, 2.287, ...] // seconds, every bar line the grid found
  },
  "words": { "model": "large-v3-turbo", "language": "en", "count": 412, "lagSec": 0.33, "error": null },
  "melody": { "model": "pyin" },     // "rmvpe" once it is installed
  "sections": [ { "label": "intro", "startBar": 0, "endBar": 8, "start": 0.412, "end": 15.41, "energy": 0.31, "low": 0.12 }, ... ],
  "hook": 14,                        // the id of the phrase with the top hook score
  "phrases": [ { ...a phrase, below... } ],
  "timing": { "phrases": 0.4, "grid": 6.1, "sections": 6.4, "onsets": 7.0, "melody": 38.2, "words": 96.0, "done": 96.3 }
}
```

### A phrase

| Field | Meaning |
|---|---|
| `id` | Index in source order. |
| `start`, `end` | Seconds on the source timeline. Cut by the voice's own loudness (a port of `findPhrases` in `lib/song/vocal.ts`: open 12 dB over the room and within 30 dB of the loudest moment, close 6 dB lower, gaps under 0.22 s joined, at least 0.35 s long). Kept whole: a long phrase is not truncated here. |
| `loudest` | `[start, end]` of the loudest window of at most 6 s inside the phrase, for a capped cut. |
| `text`, `words` | Every word with `{w, start, end, p, asr}` from faster-whisper (whisper-large-v3-turbo, `word_timestamps` on, no VAD) run on the isolated vocal. A word belongs to the phrase it overlaps most, or to the nearest phrase within 0.6 s. Sung word times from Whisper run late (0.22 to 0.65 s, MIREX 2024; `asr` keeps Whisper's own time), so `start` is moved onto the voice's own onset (`worker/wordtime.py`): the first word of a phrase starts at the phrase's first strong onset, and the rest are matched in order to the onsets nearest their time less the record's lag (`words.lagSec`). `end` is the next word's start. |
| `notes` | `{start, end, midi}` runs of stable pitch (a 5-hop median over f0 every 10 ms), at most 96 per phrase. `midi` is fractional: 69.12 is A4 twelve cents sharp. |
| `keyRelToSource` | The shift, -5 to +6 semitones, that best fits the phrase's notes to the record's scale. 0 means the phrase sings in the record's key. A shift is only reported when it fits clearly better (8 points of in-scale share), because a short line fits several keys. |
| `inKey` | Share of the phrase's sung time inside the record's scale (the K term of placement). |
| `section` | The source record's section at the phrase's anchor: `intro`, `verse`, `chorus`, `build`, `drop`, `break`, `outro`. |
| `repeats` | How many times the line occurs in the record, itself included: by its words (60 percent of the words in order) when it has two or more, else by its melody (a pitch contour at least 0.75 alike and a length within 30 percent). `repeatsWords` and `repeatsMelody` are the two counts. |
| `hookScore` | 0 to 1. 0.45 x lyric repetition + 0.30 x melodic self-similarity + 0.25 x prominence (loudness against the loudest phrase over 18 dB, averaged with the mix's energy in that section). Van Balen et al., ISMIR 2015. |
| `sourceBar`, `sourceBeat` | Where the phrase STARTS on the source grid: the bar from 0 at the first downbeat (negative before it), and the beat inside that bar from 0 to 4, fractional. |
| `stressOnset` | Seconds: the stressed syllable the phrase anchors on. Of the voice's own onsets inside the phrase, the one nearest a downbeat (a Gaussian of a quarter beat), then the strongest near any beat. |
| `pickupBeats` | Beats from the phrase start to `stressOnset`: the pickup the source sings before the one. Placement keeps it: the anchor goes on the target downbeat and the phrase starts `pickupBeats` earlier. |
| `rmsDb`, `peakDb` | The phrase's mean and peak envelope level in dBFS. |

### Sections

Four-bar groups on the grid, labelled by the mix's RMS and its low end below 150 Hz (each scaled to the record's
loudest bar), then runs of one label merged. A **drop** is the kick and bass coming back: a group whose low end is
at least 0.6 (and energy at least 0.55) right after a group with under half of that low end, or 0.2 less energy. Its
start is then moved to the exact bar the low end returns on, up to three bars before the group line. It lasts while
the energy holds (within 0.1 of where it started, for at most 16 bars, or longer while it stays at 0.8 and up).
A **build** is the group before a drop. A **break** is a group with almost no low end (under
0.35) or under half energy after the record has been loud. The quiet groups at the ends are the **intro** and the
**outro**. A loud group that is not a drop is a **chorus**, and a verse that carries the record's most repeated line
(three or more times) is promoted to a chorus: the words say so when the energy cannot. allin1 is not used: it runs
Demucs weights internally, and those are research-only.

### The grid

beat_this (CPJKU, ISMIR 2024; code and weights MIT, checkpoint `final0`, no madmom) on the mix when it loads.
Otherwise the worker's tempo path: `facts.bpm` and `facts.beatOffsetSec`, with the downbeat taken as the beat
phase whose beats carry the most low end over the record. `source.grid` says which.

## Rules for readers

- A map with another `version`, or a phrase with no span, is not a map: `parseVocalMap` returns null and the caller
  falls back to finding phrases in the audio itself.
- Every time is on the SOURCE timeline. To place a phrase on our grid, move `stressOnset` to the target downbeat and
  start the phrase `pickupBeats` (converted at the source tempo, then stretched) before it.
- The words are third-party lyrics: they are used to label and match phrases, and are never shown as a lyric sheet
  or stored outside the map and the job result.
