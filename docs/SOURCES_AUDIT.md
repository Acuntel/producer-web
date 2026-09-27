# Sources audit: third-party audio in our storage and our training data

Run 2026-09-23 for MASTERPROMPT_SMOOTH phase 4. Read only: nothing was deleted, moved or changed, in the repository or in Supabase.

## Verdict

**Not zero.** Our training data holds no audio at all. Our storage and this repository both still hold third-party audio:

- Supabase storage, bucket `clips`: 345 objects (580.7 MB) of stems and one-shots separated from 11 named records, 10 of them commercial releases and one called "Demo Track 1" whose origin is not recorded. 135 of those objects sit in the `shared/` area that every signed-in user can read.
- This repository: 16 audio files (188.9 MB) that are not listed as ours, 15 in `tests/fixtures/` and 1 in `data/dna/raw/`. Only one of them (`tests/fixtures/voice-ask.wav`) is in git.

The audit half of the phase 4 gate does not pass. The section at the end says what would make it zero. Every one of those steps deletes something, crosses into the learning lane (masterprompt section 8), or both, so each is Brady's decision.

## How it was measured

- **The repository:** `npm run audit:audio` (`tools/audit-audio.mjs`). It walks every file except `node_modules`, `.next`, `.git`, `.claude`, `.vercel` and `__pycache__`. It finds audio by its bytes as well as its name: WAV, AIFF, ID3, two MPEG frames in a row, FLAC, Ogg, CAF, MP4, WebM and ADTS headers; headerless sample files (`.f32` and the like); audio inside zip and tar archives; base64 or data URI audio inside text files; JSON arrays of 44,100 or more plain numbers; parquet columns of raw bytes or named for sound; audio headers inside compressed single files; and whether the print store is fixed width. A file counts as ours only when its sha256 is listed in `docs/SOURCES_MANIFEST.json`. `tests/sources.test.mjs` plants a renamed MP3, headerless samples, base64 audio and a sample array in a scratch folder and checks that the audit finds each one.
- **Supabase:** SELECT statements through `psql`, inside `begin read only` transactions: `storage.objects` grouped by area, `record_cache`, `clips`, `jobs`, `dna_heard`, `dna_vocal_drops`, `taste_moves`, and every `bytea` column in the public schema.
- **Installed packages and the build:** `node_modules` and `.next` hold 0 audio files by extension.

Raw output of `node tools/audit-audio.mjs .` at load 18.30:

```
[audit] walked 20304 files under /Users/bradyschwartz/dev/producer-web (skipping node_modules, .next, .git, .claude, .vercel, __pycache__)
[audit] audio files by their bytes or their names: 56; owned and listed in docs/SOURCES_MANIFEST.json: 40; not listed: 16 (188.9 MB)
[audit]   not listed: data/dna/raw/lakh_extracted/clean_midi/Queen/ 1 files, 15.0 MB, 0 in git, wav
[audit]   not listed: tests/fixtures/ 15 files, 173.9 MB, 1 in git, headerless samples + wav
[audit] archive data/dna/raw/groove.zip: 1225 members, 0 audio, 1150 MIDI
[audit] archive data/dna/raw/lakh.tar.gz: 19458 members, 1 audio (clean_midi/Queen/temp2.wav), 17256 MIDI
[audit] archive data/dna/raw/mcgill.tar.gz: 890 members, 0 audio, 0 MIDI
[audit] text files with base64 or data-URI audio: 0
[audit] JSON arrays of 44100+ plain numbers (a second of samples or more): 0
[audit] parquet tables: 25 (1194 columns), columns of raw bytes or named for sound: 0
[audit] compressed single files: 4, with an audio header inside: 0
[audit] MIDI files (notes, not sound): 18406
[audit] print store data/prints: 2277606 records; akeys.u64 8 bytes a record, tkeys.u32 4 bytes a record, vec.i8.br 32 bytes a record, names.txt.br text, lens.u16.br 2 bytes a record, meta.bin.br 10 bytes a record; fixed width, numbers only
[audit] unrecognised binaries of 1 MB or more, for a person to read: 0
[audit] NOT ZERO: audio that is not listed as ours is still in this repository.
```

## The repository

| Path | Files | What it is | Audio | Ours |
|---|---|---|---|---|
| `public/samples/starter/` | 41 | the starter sample library and its manifest | 40 files, 3.4 MB | Yes. All 40 are CC0 1.0 (23 Freesound, 17 from VCSL, Producer Space and Sonic Pi), each listed with its sha256 in `docs/SOURCES_MANIFEST.json`, checked against `lib/samples/manifest.ts` and `lib/samples-attribution.ts` by `tests/sources.test.mjs`. |
| `tests/fixtures/*.f32` | 14 | the first 150 s of 14 commercial club records (The Weeknd, Fisher, Shouse, David Guetta, Lady Gaga, Coldplay, Anyma and others), raw float32 mono at 22,050 Hz, made from Brady's own DJ library by `tests/fixtures/make.sh` | 173.8 MB | No. Gitignored and local only. They measure the ears' tempo and key (`tests/ears.real.test.mjs`, `worker/tempo_check.py`); nothing trains on them. |
| `tests/fixtures/voice-ask.wav` | 1 | a 2.4 s spoken request ("Make the base darker and take me to the drop.") that the voice harnesses play into the microphone | 76 KB | Not listed. It is speech made for the harness, not a music recording, but how it was made was never written down. In git. |
| `data/dna/raw/lakh_extracted/clean_midi/Queen/temp2.wav` and its copy inside `data/dna/raw/lakh.tar.gz` | 1 (+1 archive member) | a 178 s stereo recording that ships by accident inside the Lakh MIDI dataset's `clean_midi` folder | 15.0 MB | No. Gitignored and local only. The DNA build reads the MIDI only. |
| `data/dna/raw/` everything else | 19,000+ | the public datasets the DNA store was built from | 0 | Numbers and notes: 18,406 MIDI files, 892 text files, CSV and parquet tables. |
| `data/dna/*.parquet`, `data/dna/*.json`, `data/dna.json`, `data/galton.json` | | the DNA store and the Galton store | 0 | Features: 25 parquet tables with 1,194 columns between them, none of raw bytes or named for sound (the byte columns are MusicBrainz ids). |
| `data/prints/` | 8 | the print store: 2,277,606 records | 0 | Fixed width numbers: 32 bytes of vector, 8 and 4 bytes of keys, 2 of length and 10 of metadata a record, plus names. A second of the smallest audio would be thousands of bytes. |
| `data/library/` | 500 | measured facts for 500 tracks of Brady's DJ library (tempo, key, groove, loudness) | 0 | Features. The tracks themselves stay in his Desktop folders. |
| `knowledge/` | 32 | 31 Markdown files and 1 JSON | 0 | Text. |
| `tools/`, `lib/`, `hooks/`, `app/`, `components/`, `worker/`, `supabase/`, `docs/` | | code, migrations and docs | 0 | |

## Our storage (Supabase)

One private bucket, `clips`. Its objects, grouped by area:

```
bucket_id | area | objects | mb | mimes
clips | <owner>/queries | 1 | 0.4 | audio/wav
clips | <owner>/stems | 210 | 292.3 | audio/mpeg,audio/wav
clips | <owner>/uploads | 1 | 2.8 | audio/mp4
clips | shared/records | 135 | 288.4 | audio/mpeg,audio/wav
```

- `<owner>/stems/<job>/` holds 210 objects from 9 stems jobs, all under one account. 8 of the 9 folders (189 objects) came from the learning lane (`jobs.source.learn = true`, 2026-09-18): Calvin Harris and Sam Smith "Promises", Cassö, Raye and D-Block Europe "Prada", Chrystal "The Days", Cyril "Stumblin' In", Disco Lines and Tinashe "No Broke Boys", Haven featuring Kaitlin Aragon "I Run", Marshmello and Bastille "Happier", and Venbee and Goddard "Messy in Heaven". The ninth is a probe job from 2026-09-07 (21 objects).
- `shared/records/<fingerprint>/` holds 135 objects for 9 records in `record_cache`, readable by every signed-in user (migration 0003, `clips_shared_read`): John Summit and Hayla "Where You Are (Zedd Remix)", Chloé Robinson and DJ ADHD "Pax (Four Tet Remix)", "Demo Track 1", and six of the learned records above.
- `<owner>/uploads/probe-mix.mp4` (2.8 MB) and `<owner>/queries/probe-ident.wav` (0.4 MB) are probe files from 2026-09-07. Where their audio came from is not recorded.
- `<owner>/vault/`, `<owner>/hear/` and `<owner>/vocals/` hold nothing today.
- The `clips` table has 204 rows pointing at these files (112 stems and 92 one-shots, 93 of them adopted from the shared cache).

Where the code writes audio to storage:

| Path | Written by | What goes there |
|---|---|---|
| `<owner>/stems/<job>/` | `worker/app.py` (the stems job) | every separated stem, drum part and one-shot of the record, and 16 bar previews |
| `shared/records/<fingerprint>/` | `worker/supa.py` `cache_put` | a copy of those files, served to anyone who asks for the same record again |
| `<owner>/uploads/` | `hooks/useStems.ts` `start({ file })` | a file the user uploads for separation |
| `<owner>/queries/` | `hooks/useStems.ts` (hum search and identify; the identify capture is removed after the call) | the user's own recordings and captures |
| `<owner>/hear/<stamp>/` | `hooks/useStems.ts` (listen back properly) | renders of the user's own record |
| `<owner>/vocals/` | `app/api/music/route.ts` | ElevenLabs Music vocals generated for the user |
| `<owner>/vault/` | `lib/account/clips.ts` `mirrorClip` | every clip the browser stores (uploads, recordings, grabs); never a library sample, and since this phase never a `splice:` key |

`app/api/learn/route.ts` says "Nothing is downloaded to stay; the studio hears a public copy once and keeps the numbers." That is not what happens: the learning lane sends each record through the ordinary stems job, which uploads every stem and copies it to the shared cache. The numbers are kept, and so are the stems.

## Our training data

Zero audio.

- **The DNA store** (`dna_*` tables and `data/dna/`): tempos, keys, chords, drum grids, energy contours, charts and fame. No `bytea` column exists anywhere in the public schema.
- **The learning lane's output** (`dna_heard`, 11 rows): numbers and text. `hearing` is at most 10,524 characters a row, with the keys `bass, blocks, chords, clap, drumGrids, lyrics, notes, perStem, report`, and no row matches a base64 audio pattern. 10 rows hold a transcription of the record's lyrics, up to 2,825 characters: third-party text, not audio. `dna_vocal_drops` has 0 rows.
- **Embeddings:** 147 `clips` rows carry a CLAP embedding of a stem or one-shot in `source.embedding`. They are vectors, derived from the stems above.
- **The Galton store and the print store:** `data/galton.json` and `data/prints/`, numbers only (see the table above).
- **The taste ledger:** 5 `taste_moves` rows of moves and verdicts. No audio.

Nothing in any of these came from Splice or Tracklib. The product has never called either service.

## Outside the repository, read because it feeds the learning loop

`~/.dictation/producer/learning/2026-09-21_2313/audio/heard/` holds 123 microphone recordings (822 MB, WAV) of the room during the session the masterprompt's section 1 is built from. The room was playing a commercial record ("What's Next") and Splice samples as the producer auditioned them, so these recordings hold both. They are local to Brady's Mac and have never been uploaded. What the loop kept from them (`LEARNINGS.md`, the timeline and the transcript) is text. Under the hard line, the raw recordings should not outlive the learnings; that deletion is Brady's call.

## What would make it zero

None of this was done. Each item names the step and why it is not this phase's to take.

1. **The shared cache and the learned stems in storage (580.7 MB, 345 objects).** Delete `shared/records/*` and the `record_cache` rows that point at them, delete the 8 learned jobs' `<owner>/stems/<job>/` folders and their `clips` rows, and make a `learn` job keep its numbers without uploading or caching a single stem. That is a Supabase delete and a change to the learning lane (section 8), so it needs Brady's go.
2. **A user's own "pull that record in".** The same stems job stores the stems of whatever record a user names, under that user, and then shares them through the cache. Whether a record the user names may be stored for that user at all is a product decision. Serving it to other users through `shared/` is the part that can never be defended, whatever the answer.
3. **`tests/fixtures/*.f32` (14 files, 173.8 MB).** Have `make.sh` write them outside the repository (for example `~/.cache/producer-fixtures`) and point `tests/ears.real.test.mjs` and `worker/tempo_check.py` there. They are measurement fixtures, not training data, and they have never been in git.
4. **`data/dna/raw/lakh_extracted/clean_midi/Queen/temp2.wav`.** Delete the stray file and its copy in `lakh.tar.gz`. The DNA build never reads it.
5. **`tests/fixtures/voice-ask.wav`.** Make it again with a method we write down (the studio's own Kokoro voice, for example) and list it in `docs/SOURCES_MANIFEST.json` as `made-here`. The speak and voice harnesses play it, so rerun both afterwards.
6. **The two probe files** in `<owner>/uploads/` and `<owner>/queries/`: delete them, since nobody recorded where they came from.

Then `npm run audit:audio` has to print `ZERO`, and the storage query above has to show only `<owner>/vault`, `<owner>/hear`, `<owner>/queries` and `<owner>/vocals`, holding nothing but the user's own recordings and renders.

## The models the worker runs (2026-09-27, MASTERPROMPT_PRODUCER Phase 9a)

Verified 2026-09-27 on the sources themselves. The worker no longer ships Demucs: the Demucs author wrote on 2022-05-23 that "the model weights are not covered by the MIT license, and are provided only for scientific purposes" (github.com/facebookresearch/demucs/issues/327). `worker/Dockerfile`, `worker/requirements.txt` and `worker/analysis.py` no longer install, pull or call it. htdemucs_6s is used only on a developer machine, only to measure the new separator against it (docs/GYM_LOG.md 2026-09-27).

| What | Weights, and their license as stated at the source today | Code | Where it runs |
|---|---|---|---|
| The acapella: Kim Mel-Band RoFormer | `KimberleyJSN/melbandroformer` `MelBandRoformer.ckpt`, Hugging Face revision `ac9b0614ab3cd7f77219e18ba494dfd93956c348` (lastModified 2026-04-22), sha256 `87201f4d31afb5bc79993230fc49446918425574db48c01c405e44f365c7559e`. The card says `license: mit` (read through the Hugging Face API on 2026-09-27). It was GPL-3.0 from 2025-06-17 until that revision. The training data is not disclosed. | lucidrains `BS-RoFormer` 0.3.10 (MIT), which loads the checkpoint with no missing and no unexpected keys; our chunking in `worker/chunked.py` | the worker (CPU), or the GPU function in `worker/gpu/modal_app.py` (written, not deployed) |
| Drums, bass and other (optional) | SCNet XL IHF, ZFTurbo MSST release v1.0.15, `model_scnet_ep_36_sdr_10.0891.ckpt`. The release says it was trained only on MUSDB18, which sigsep licenses for academic use. | ZFTurbo `Music-Source-Separation-Training` (MIT), pinned at `84b1eac` | only when `MSST_DIR` and `SCNET_CKPT` are set; otherwise a model-free split (harmonic and percussive separation plus a crossover), which carries no weights at all |

The risk note, in the trainer's own words. On 2026-09-25, in MSST issue #245 (github.com/ZFTurbo/Music-Source-Separation-Training/issues/245), ZFTurbo answered a request to declare the licence of the checkpoints he trained: "I have released the model weights ... under the MIT License ... However, please note that I do not hold the copyright to all audio data used to train this model. As explicitly stated in the MIT License, the software and model weights are provided "AS IS", WITHOUT WARRANTY OF ANY KIND. I cannot provide any legal guarantees or indemnification regarding potential claims related to the training data. You are completely free to use the model under the terms of the MIT license, but any commercial integration is done at your own risk." He added that he is not the author of every model on his list. The Kim model is Kimberley Jensen's, and its MIT grant is her Hugging Face card; its training data is undisclosed, so the same at-our-own-risk reading applies to it. The karaoke and de-reverb RoFormers (anvuew, GPL-3.0) are not installed; if they are added they stay on the worker and never ship to a browser.
