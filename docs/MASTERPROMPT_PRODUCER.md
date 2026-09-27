# THE PRODUCER MASTERPROMPT: a whole song right away, real voices in it, nothing that glitches

You are taking over an AI music producer that already sounds like something and already schedules notes without a single late event. You have two jobs. The first is underneath the music: every sound loads in the order it will be heard, every change lands on the grid, nothing crackles, and the song runs clean from the first bar to the last. The second is the music itself: when Brady names an artist or a record, a whole song plays right away. When he names a voice, the producer finds the record, pulls out just the singer, understands the words, and puts the line where it belongs, because the brain and the ears agree on it.

Repo: `~/dev/producer-web` (Next.js 15, React 19, Tone.js 15.1.22, a Python worker on Railway, Supabase). Read this whole file before you touch anything. Every file:line below was verified on 2026-09-26 and 2026-09-27 on branch `crackle` (0a049da, plus this document), by reading the code and by measuring it in headless Chrome. Evidence: `~/dev/producer-web-progress/loading/results/*.json` (loading, playback, order, measurements and a skeptic's verdict) and `~/dev/producer-web-progress/vocals/results/*.json` (finding, isolating, placing, learning, and the open-source and legal research with URLs).

Brady, in his own words, 2026-09-26: "however we architected the music system is it's super confusing and there's a bunch of loading and cache problems. It seems like everything loads at random times... it's completely smooth end-to-end for the entire song. There's no glitches, there's no crackling noise."

And 2026-09-27: "I don't want it to be so rigid... I want it to start with kind of merging that all together, but it needs to base it off of the song. I don't want it to ask me every single time. I want it to make a song almost in the beginning, but it needs to have a process just so it knows and doesn't glitch... all these songs can always be different... the crackle needs to be fixed fully. The bars need to be fixed fully and it needs to be single loaders... 'go find Sweet Caroline, pull just the voice and isolate that'... is this a good part to put this part in? Does it make sense with the beat drop?... The most important part is being able to scrape and find the songs, isolate the vocals, and then reason with the brain, communicate with the ears, listen to it, and know where to put it... keep trying to patternize, make connections between different types of music, and keep building better songs from that connection."

---

## 0. Who you are

**The debugger.** You believe nothing you cannot show. Every load, every decode, every landing and every placement is written in a ledger. A fix is done when a probe reads the ledger and proves it.

**The creative mind.** You make the whole song first, from the song Brady named, and you make it differently every time. Then you ask like a producer: "Do you like this beat?" "What do you want to hear: a snare roll, one of those high leads, a vocal?" You put a real voice where a real producer would put it, and you listen before you say it is there.

---

## 1. The laws

1. **A whole song, right away, from the song.** "Make a song like X" plays a complete, merged draft (drums, bass, harmony, a hook, an arrangement) built from X's own tempo, key, groove, palette and structure. There is no fixed layer order and no silent build.
2. **The process is fixed and the music is free.** Every draft and every change passes through the same internal pipeline: route, compile, plan the loads, load, arm, land on the grid, listen, write the ledger. The pipeline never changes. The music never follows a fixed path.
3. **One loader.** A single asset store is the only code that fetches or decodes audio. One sound has one key at every layer, a request in flight is never repeated, and a failure is never cached.
4. **Bar 1 first, and nothing plays before it is ready.** Sounds load in the order they will be heard. A part enters on the next bar line after its buffer is decoded, never mid-bar, and never silent-then-pop.
5. **Every change has an address in musical time.** Content lands on the next bar, structure on the next phrase, mixer moves on the next beat. Only stop, pause, mute and solo act at once, and they still ramp.
6. **The desk is clean.** Nothing clips, nothing steps, nothing pops. Every gain change is a ramp at an explicit audio time.
7. **Both threads run on a budget.** The audio thread has a node budget and the main thread has 50 ms. Nothing re-renders in a loop.
8. **The voice leads.** The beat moves to the voice, not the voice to the beat. A vocal is placed where the brain and the ears agree it belongs, it is heard in our own render before it is announced, and it is never chipmunked or smeared.
9. **Ask like a producer.** Questions come after something plays, one at a time, at natural moments. Silence is not a no.
10. **The same record sounds the same on reload, and a new record is a new song.** Randomness comes from the song's seed, never from `Math.random`, a race or the network.
11. **Every verdict teaches.** "In", "next one", three quiet passes and every A/B pick are labels. The patterns they build are what make the next song better.

---

## 2. What Brady hears today, and why

The late-note counter reads 0 in every run: the scheduler itself is sound. Everything below is what is wrong around it. Full detail, with every file:line and measurement: `loading/results/verify_skeptic+critic.json` and `vocals/results/*.json`.

### RC1. There is no single loader, so sounds arrive at random times
- The warm-up warms the wrong record: `hooks/useStudio.ts:253` warms `songRef.current` before the saved record reaches the ref. A reopened sample-kit record waited 520 of its 635 ms from press to transport on a download chain after the press.
- Four caches, no in-flight map (`lib/engine/clips.ts:47-61`, `engine.ts:32`, `samples.ts:8`, `kits.ts:11-12`). `loadClipsFor` is a serial for-await (`clips.ts:84-97`), and one run decoded the same 3.5 MB clip twice before the first sound.
- Failures stick: `decodeSample` caches `.catch(() => null)` forever (`samples.ts:35-40`).
- A restored sound stays silent until an unrelated change (`hooks/useVault.ts:68-69`, `app/page.tsx:67`).
- `/samples` is served `max-age=0` (no `headers()` in `next.config.ts`), so every reload revalidates and re-decodes eight files one after another.

### RC2. Render loops steal the thread the scheduler needs
- The vault effect (`app/page.tsx:67`) depends on objects that are new every render, and it always sets new state. Any record with a chop, stem or upload re-renders up to 183 times a second and opens IndexedDB on every render: 7,044 opens in 53 s, and 390.7 ms/s of script against 27.6 on the seed. The live build has this too.
- The mic level re-renders the app 20 times a second (`hooks/useSpeak.ts:64-65`). Every move rewrites the song, chat and library in localStorage (`useStudio.ts:116-122`, `:154-158`). The Board tears down its paint loop on every move (`components/Board.tsx:56-124`).
- The first build (222 to 310 ms) runs inside the greeting's first audio chunk, which put a 149 ms hole in the first word. A song switch blocks 233 to 361 ms.

### RC3. A change has no address in musical time
- Every change lands wherever the playhead is (`engine.ts:81-86`, `rig.ts:63-64`). Measured: on "to the beat" the hats and bass came in +302 ms mid-bar, and the kick waited +590 ms for the downbeat.
- Tone's `.value` and `rampTo()` with no time act at `now()` = currentTime + 0.2 s. Any move snaps automation back (`voices.ts:159-171`): the outro fade jumped from -4.7 dB to 0. Automation end values stick: the second pass of the song played at -18.00 dB.
- A new audio loop is silent until its next section starts (`schedule.ts:102-104`), and GrainPlayers ignore pause, goto and tempo.

### RC4. The desk is not clean: this is the crackle
- The "-1 dBFS ceiling" is a hard clamp at -2.85 dBFS. A WaveShaper maps only input in [-1, 1], and `CEILING*tanh(x/CEILING)` (`lib/engine/board.ts:31`, `:49`) ends at 0.7204. The Tone Limiter in front of it has knee 30 and does not limit. Measured: 1.57 to 1.63% of the seed's samples sit flat on the clamp.
- Every sampled drum plays the previous hit's velocity: `player.volume.value` is set at `now()` inside the callback (`voices.ts:186-187`). Measured correlation with its own velocity: -0.63.
- A swapped instrument pops, then goes silent: it is disposed on a 75 ms wall timer before its fade even starts (`rig.ts:200-206`).
- The pump and the gate step instead of ramping (`rig.ts:156-159`, `:111-113`). The pre-drop gap rings (`schedule.ts:57-58`).
- There are three or four live AudioContexts: Tone's orphan from import, the studio, the voice (`useVoiceOut.ts:40`) and the mic (`useSpeak.ts:56-58`). The voice and the record sum with no shared ceiling. The seed runs on 1,769 native nodes because every voice builds its full device chain.
- The producer's voice has 0.3 to 1.8 s holes between sentences (`useVoiceOut.ts:133`).

### RC5. The song is built by a rigid, slow, LLM-worded path
- A new record is silent: "New" loads `BLANK_SONG` with zero tracks (`useStudio.ts:37`, `:282`).
- "Make a song like X" is an 8-step LLM rollout, one layer after another (`lib/brain/rollouts.ts:86-91`, `hooks/useRollout.ts:90-94`). It took about 2 minutes to reach 11 tracks, and the ritual beat is identical for every record (`lib/song/ritual.ts:97-106`).
- The heard record's real DNA (drum grids, bass, chords, structure, palette, vocal entries) never reaches the build. It reaches chat as text only (`hooks/useStems.ts:113-116`), and the artist row's kick grid, bass rhythm, progressions and structure (`lib/brain/galton.ts:54-59`) reach the LLM as a sentence, never as notes.
- Which path runs depends on a regex over Haiku's paraphrase, not Brady's words (`useStudio.ts:403`, `lib/brain/local.ts:39-49`). The build order is written in nine places that disagree. Asks get dropped by turn bumps (`useConversation.ts:64-65`) or merged in one slot (`useStudio.ts:400`). The greeting and the record flip a coin (`useStudio.ts:554`).

### RC6. The voice pipeline cannot do what Brady asked
Today, "go find Sweet Caroline and pull just the voice" does this:
- **It can take the wrong version.** The finder searches SoundCloud, Mixcloud and the Internet Archive (`worker/finder.py:122`); FMA, Jamendo and Freesound have no keys set. Shazam names the downloaded file, but nothing compares that name with the ask (`worker/app.py:314-317`). A measured precedent: "john summit where you are" became the Zedd remix (GYM_LOG:188, :198). Also, "isolate the vocal..." as a sentence start is caught as SOLO by `local.ts:151` and never finds the record.
- **It separates with research-only weights.** The worker ships Demucs htdemucs and htdemucs_6s (`worker/Dockerfile:10-11`). The Demucs author wrote on 2022-05-23: "The model weights are not covered by the MIT license, and are provided only for scientific purposes" (github.com/facebookresearch/demucs/issues/327, verified). allin1 runs the same weights internally. The vocal stem mixes lead and backing voices with reverb, as 192k MP3, on Railway CPU, in about 116 s.
- **It knows no words.** Whisper small gives lyric lines with start times only (`worker/hearing.py:194-201`). Nothing knows the hook from a verse line: the pick is loudest plus longest (`lib/song/vocal.ts:71-76`). A bug keeps the FIRST 6 s of a long phrase, not its loudest window (`vocal.ts:66-68`).
- **It chipmunks.** Retuning is varispeed (`voices.ts:271`), so +3 semitones plays 19% fast, and `leadIn` uses the unshifted length, so the last word misses the downbeat. `warp: false` (`useStems.ts:313`) lets the words drift off our grid.
- **It places once, by one rule, and never listens.** One phrase goes in the section before the first drop (`useStems.ts:288-289`), never in drop 2. The ears render only the first 2 bars of each section (`lib/engine/render.ts:59`, `:80`), so a lead-in at the end of a build is never heard. MusicFacts has no vocal field. The "measured from records" placement rests on 0 rows in `dna_vocal_drops`.
- **It cannot use Brady's own voice.** The mic audio is streamed to Scribe and thrown away (`useSpeak.ts:59-70`). Hum samples are dropped after the notes are read (`useStudio.ts:353-358`).
- **It has only been proven on sine tones.** The vocal probes use synthetic two-partial "vocals" (`tests/vocal.probe.mjs:32-45`), never a real separated singer.

---

## 3. The first draft: a whole song right away, different every time

### What happens when Brady says "make a song like X"
1. **Code resolves X, on Brady's words.** It could be an artist, a record, a lane or a feeling. The resolver uses the DNA store by name (the `/api/source` path, `app/api/source/route.ts:28-38`), then the Galton artist row and bin (`lib/brain/galton.ts:54-59`), and it never uses a regex over Haiku's paraphrase.
2. **The draft compiler (`lib/song/draft.ts`, new) writes a complete SongDoc in milliseconds, with no model call.** Inputs, best first: a heard record's DNA (worker hearing: drum grids, bass notes and rhythm, chords, blocks, CLAP palette words, vocal entries); otherwise the artist row plus its Galton bin (kick grid, bass rhythm, top progressions, structure, melody contour); otherwise the lane recipe and a seed song (`lib/song/seeds.ts`, `seedsLanes.ts`). The output has tempo and key from the source; kick, snare and hats from the grids; bass rhythm and roots; chords from the progression; a hook from the contour; the form from the heard blocks or the flow grammar (`data/flow.json`); and a kit chosen by palette. Everything is merged at once.
3. **Every record comes out different.** The per-record seed (from the song id) picks among the top candidates for each choice (Thompson sampling over the top three), so two records by the same artist never share a hook. "Next one" means a new seed on the same DNA.
4. **It plays within seconds.** The asset store loads the section the playhead starts in first, so the draft is audible under 3 s for anything the store knows. When the worker has to hear a record first, the draft starts on the store's tempo and key for that record and upgrades on the next phrase when the worker's DNA lands (under 45 s).
5. **The brain refines instead of building.** After the draft lands, one Hands call reviews it against the reference facts and returns ops, landed at phrase boundaries. The 8-step rollout no longer builds first drafts. Its steps survive as targeted refines that Brady can ask for by name ("make the drums hit harder", "rebuild the drop").

### How the producer asks
- After the draft has played 16 to 32 bars: "Do you like this beat?" "Yes" keeps it. "No" or "next one" plays a new seed on the same DNA, landed on the next phrase. A reason he gives ("too busy", "darker") steers the next seed.
- Then, when it fits, one concrete offer drawn from what this song is missing: "Want a snare roll into the drop, one of those high leads, or a vocal on it?" The options come from the draft's gaps against its reference, not from a fixed list.
- One question at a time: never more than one per 30 s, never while Brady is talking, and three quiet passes means move on, not stop. The 30 s verdict window and the patience watch already exist (`lib/ritual/patience.ts:12-15`).

### The internal process, the part that is the same every time
Every draft, refine, vocal placement and small ask passes through the same pipeline: **route** (code, on Brady's words) → **compile** (draft, ops or placement) → **plan the loads** (tiers, section-first) → **load** (one store) → **arm** (chunked build off the critical path) → **land** (on its bar or phrase, at an explicit audio time) → **listen** (off the main thread, on the window that changed) → **ledger**. That fixed pipeline is what stops the glitches. The music inside it is free.

---

## 4. How a prompt runs, end to end

1. The press stops speech only and never drops work. `engine.getPosition()` is captured at release as `nowPlaying`, so "this bar right here" means the bar Brady heard.
2. Code routes the utterance on Brady's words: **draft** ("make a song like X", "new song", "surprise me"); **voice** ("pull the voice from X", "put Sweet Caroline in it"); **take** ("record me", "put what I just said in the song"); **refine** (a named part or section); **small op** ("louder hats"); or a **question**. The Voice (Haiku) emits typed controls (`{draft}`, `{voice}`, `{take}`) instead of prose tasks.
3. Every piece of work is a **Job** in a FIFO queue: `{id, text, origin, songId, state: queued | running | landing | landed | failed | cancelled}`. A job resolves when its change has landed in the audio, not when the network returned.
4. `Engine.update(song, {boundary})` returns `{landsAtBar, landsAtTime}`. The work card says "lands on bar 17", then "landed".
5. Stop, undo, redo, new and open cancel every job whose `songId` no longer matches.
6. The leveler and verify act only at bar lines, between jobs. A failed verify becomes an offered A/B in one spoken line, never an automatic second move.
7. The bottom progress bar Brady likes shows the running job's real state: queued, working, "landing on bar 17", or "waiting for your call".

---

## 5. The voice: find, isolate, understand, fit, place, listen

This is the most important part of the product. Each stage writes to the ledger, and each stage is proven on real singers, never on sine tones.

### 5.1 Find the record (worker + browser)
- **Identity first.** Resolve the canonical artist, title, duration, tempo and key from the DNA store before searching.
- **Rank against that identity.** Score each candidate on the uploader matching the artist, a duration within 3 s of the catalog, and penalties for "cover", "karaoke", "remix", "live" and "sped up" (extend `worker/finder.py:129-139`).
- **Accept only a match.** Shazam must name the downloaded file as the asked title and artist. Otherwise the producer says one line: "I found a cover, not the original. Want it, or play the original in a tab and I'll capture it?"
- **Every route in one press.** The finder, tab capture (`lib/capture.ts`, real time), upload, a local folder (`lib/localSource.ts`) and licensed stems from Brady's own accounts all start the same way. Add a voice control for capture ("play it in a tab and I'll record it"). Wire `useStems.prefetch` (it has no caller today) to the canonical name. Fix the SOLO catch at `local.ts:151`, so "isolate the vocal from X" finds X.

### 5.2 Isolate the voice (a GPU host, vocals first)
- **Acapella: Kim Mel-Band RoFormer.** Its weights are MIT on the Hugging Face card (verified 2026-09-27). It scores 10.98 dB vocal SDR on the MVSEP Multisong set against 8.24 for htdemucs. Run it through ZFTurbo's MSST code or python-audio-separator (both MIT). The trainer says the training data is not all his, and "any commercial integration is done at your own risk": write that down in `docs/SOURCES_AUDIT.md`.
- **The other stems:** SCNet XL IHF (MIT per its trainer, trained on MUSDB18, which is academic-only; same risk note). Or the instrumental as the mix minus the vocal, plus the worker's existing band-and-transient drum split. Remove Demucs from `worker/Dockerfile:10-11`, and feed allin1 our stems so it never runs htdemucs.
- **Lead vs backing, and de-reverb:** the anvuew karaoke BS-RoFormer and dereverb Mel-RoFormer. Their weights are GPL-3.0, so they run on the worker only and never ship to the browser.
- **Where it runs:** on the Railway CPU the acapella would take 10 to 30 minutes per 4-minute record. On a serverless GPU (Modal L4 at $0.000222 a second, or RunPod) it takes about 10 to 30 s plus model load, roughly 1 to 3 cents a track. The GPU host is Brady's call.
- **Vocals first:** separate the hook region first (the worker's best-16-bars path, `worker/app.py:352-359`), then the whole vocal, then the other stems, which the browser fetches only when a track uses them. Deliver the vocal as WAV or FLAC, never 192k MP3.

### 5.3 Understand the voice (one "vocal map" JSON per record, numbers only)
Each phrase carries `{start, end, words, notes, keyRelToSource, section, repeats, hookScore, sourceBar, sourceBeat, pickupBeats, stressOnset}`:
- **Words:** faster-whisper with whisper-large-v3-turbo (MIT), `word_timestamps` on, run on the isolated vocal and segmented by our own RMS phrases. Word timing on sung vocals is off by 0.22 to 0.65 s (MIREX 2024), so words LABEL phrases and cuts come from the vocal's own onsets.
- **Melody:** RMVPE (Apache code, MIT weights) on the isolated vocal gives notes per phrase and the phrase's key relative to the record's key.
- **Sections and grid:** beat_this (MIT) gives downbeats. allin1 (MIT), fed our stems, labels verse, chorus, bridge and the rest. A dance drop comes from the energy jump plus the kick and bass returning.
- **Hook vs verse:** how many times the lyric line repeats, the melodic self-similarity, and how prominent the vocal is (Van Balen et al., ISMIR 2015). Fix the 6 s truncation (`vocal.ts:66-68`) so the cap keeps the loudest window.

### 5.4 Fit the voice to the beat
- **Move the beat to the voice.** When a vocal is wanted, the draft is compiled in the vocal's key and at its tempo (or double or half time), so the vocal moves at most 3 semitones and 12% (the limits already in `lib/sources/owned.ts:21-22`). Past that, change the beat, never the voice.
- **Stretch and shift with formants kept.** Use Signalsmith Stretch (MIT; npm `signalsmith-stretch` WASM AudioWorklet, `python-stretch` on the worker), pre-rendered once per clip, tempo and key, and cached by content. `playbackRate` stays 1. Varispeed (`voices.ts:271`) and GrainPlayer go away for vocals. Rubber Band is GPL: on the worker only, never in the browser bundle.

### 5.5 Place the voice (`lib/song/place.ts`, new; dropVocal, chops and takes all call it)
**Candidate slots:**
- the hook entering on bar 1 of the drop;
- a lead-in whose stressed last word lands on the drop's downbeat, with the family's learned gap;
- a verse line over the breakdown's pads;
- an offbeat chop of one or two syllables inside the drop;
- call and response in the lead's gaps;
- a tag at a phrase end in the build.

**The musical rules** (sources in `vocals/results/web_open-source+legal.json`):
- Phrases start on 4-bar boundaries.
- Anchor on the stressed syllable, and keep the source's pickup offset before the one.
- The hook repeats in both drops, and drop 2 adds a double, an octave or a chop, not a new line.
- Verse lines stay in the source's lyric order.
- Every cut sits in the gap between phrases, never mid-word.
- The lead never plays in the vocal's register while the vocal sings, and the mids (1 to 5 kHz) duck under the voice.
- The gap before the drop is truly silent.

**The score for each slot:**
- **H**, harmonic fit: the cosine between the phrase chroma and the target section's chroma, maximised over shifts of plus or minus 3 semitones (AutoMashUpper, Davies et al. 2014).
- **K**, in-scale ratio of the voiced notes.
- **R**, rhythmic fit: onsets within 25 ms of the 16th grid, and a stressed-syllable anchor error under 20 ms.
- **C**, stretch and shift cost: fail if it is above 1.
- **M**, masking in 1 to 5 kHz.
- **S**, section-role fit: Beta counts that start from the rules and are updated by every verdict.
- **B**, boundary fit.
- **E**, energy fit: the loudest, most repeated phrase goes in the highest-energy section.
- **G**, a CLAP "same kind of moment" check.

The learned P(in) is a logistic regression over those terms plus the lane, fitted to Brady's verdicts. An A/B pick counts as a Bradley-Terry comparison (choix, MIT). The producer offers the top slot and explores the top three.

### 5.6 Listen to the placement, then ask
`lib/ears/vocalCheck.ts` renders only the placement window (the last 4 bars of the target section plus bar 1 of the next) and measures:
- the anchor error against the downbeat;
- masking against the other parts;
- key clash with the chords at those bars;
- collision with the lead, pluck or arp;
- whether the phrase crosses a boundary.

Add a `vocal` block to MusicFacts, `factsForBrain`, `verify.ts` and the critic.

The loop: the planner ranks the slots, the check runs each one offline (cheap), and the best one lands on its bar. Then the producer says one line ("Sweet Caroline comes in on the one of the drop. Do you like where the voice sits?"), which opens the 30 s verdict window through `movedRef`. "Next one" tries the next slot.

### 5.7 Brady's own voice
- **Two mic paths.** The talk mic keeps its speech processing. The record mic asks for `{echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1}`, and takes use headphones.
- **The recorder.** An AudioWorklet in the studio context (no second context, no ScriptProcessor) starts on a bar with a one-bar count-in. The take is shifted by `outputLatency + baseLatency`, confirmed once per device with a loopback click and stored per device.
- **"Put what I just said in the song."** A rolling 30 s buffer of the push-to-talk audio is cut to the last utterance by Scribe's word timestamps. It becomes a clip within 2 s of release.
- **Cleanup and tuning.** Gate between phrases with the phrase envelope. The separator strips beat bleed if he recorded without headphones. RMVPE plus Signalsmith tunes toward the song's scale gently by default, and hard-tune only when he asks.
- From there it is just another vocal source: the same understanding, fit, placement and listen. It is the one voice the product fully owns.

---

## 6. Learning: patterns and connections across music

- **A vocal pass on every stems and learn job, numbers only.** It covers phrases, words, the position of each phrase relative to every peak and boundary, vocal share per section, hook repetition, and pitch against the key. It writes `dna_vocal_drops` rows keyed by the SOURCE record's family, tempo band and structure archetype. Today they are filed under the current song's lane (`useStems.ts:295-302`), which is a bug. Backfill the 11 `dna_heard` rows from their stored hearing. Build the rollup that was planned and never built: `tools/dna/vocal_drops.py` writing `data/dna/vocal_drops.json` (docs/MASTERPROMPT_V11.md:439-449). The planner reads it as its prior.
- **DNA becomes notes, not sentences.** The draft compiler compiles grids, progressions, contours and structures deterministically. The LLM gets the result, not the job of transcribing a sentence into notes.
- **Connections are made at the section level.** Embed every section and every vocal phrase with CLAP (already in the worker, `worker/Dockerfile:14`) and MusicFM (MIT). Nearest neighbours across lanes ("this house breakdown sits where that pop bridge sits") lend their placement priors to a lane with fewer than 8 records.
- **Cross-family drafts are experiments.** A draft that takes the floor from family A and the vocal placement or a signature timbre from family B is stored as a structured taste row with its verdict. The liked share rolls up by (A, B) pair, and the compiler samples transfers in proportion to it while still exploring.
- **Verdicts are labels.** "In" = 1, "next one" = 0, three quiet passes = 0.5. The taste pairs logged today are never read (`lib/taste.ts:112`): read them. Refit after every 20 verdicts.
- **How we know it works:** the first-offer keep rate per lane rises as verdicts accumulate. On held-out heard records, the vocal entry bar predicted from family priors beats a "bar 1 of the drop" baseline. If the keep rate is flat after 50 verdicts in a lane, go back to the rule priors and add the feature Brady names in his "next one" reasons.
- **Never on the learning path:** MERT, MuQ, CLaMP 3 audio, SongFormer, MusicGen, Music Flamingo, SongEval, torchaudio MMS_FA, madmom model files, Sucial's dereverb, or unlicensed RoFormer fine-tunes. All of them are non-commercial or unlicensed.

---

## 7. Where the voices come from: the line, said once

"Sweet Caroline" has been a Universal Music Group recording since 2022. Pulling a famous vocal into your own session to try a flip is how producers work. Releasing it needs a license. The courts are active right now:
- On 2026-08-18 a judge let UMG and Sony's DMCA 1201 claim proceed against Suno for stream-ripping YouTube with yt-dlp.
- The labels are licensing walled gardens instead: UMG with Udio (2025-10), UMG with Hook (2026-08-19), and Spotify with UMG (2026-05-21).
- No lawsuit against a stem-separation app turned up in the search.

So the product takes this shape, and it keeps every bit of the ambition:
- **A record's audio stays private to the user who brought it:** an upload, a tab capture, their own licensed accounts, or the finder for their session. It is processed and then deleted on the worker, stored only under that user or on their device, never shared across users and never trained on. The DNA store keeps numbers only.
- **The shared audio cache ends.** `supa.cache_put` copies every pulled record's stems to `shared/records/`, which every signed-in user can read (`worker/supa.py:114-123`, migration 0003). That is 135 objects and 288 MB today. Cache the numbers (facts, hearing, the vocal map), not the audio. SOURCES_AUDIT calls this part "the part that can never be defended".
- **An export that contains a third-party vocal says so,** with its source. The release path is clearance (Tracklib for its catalog), Brady's own voice, an owned vocal, or a sung re-record.
- **Demucs leaves the worker** (section 5.2).

The storage deletions in `docs/SOURCES_AUDIT.md` remain Brady's decision. Making the shared cache private should happen before any other user is invited.

---

## 8. The engine underneath (unchanged in intent from the loading work)

### 8.1 One asset store (`lib/engine/assets.ts`)
- **The API:** `get(key, {tier, why})` returns a `Promise<AudioBuffer>`. It is the only fetch-and-decode path.
- **Layers:**
  - an in-flight map;
  - a decoded LRU that pins what the current record plays;
  - IndexedDB bytes, with one cached connection, a meta store, eviction and `navigator.storage.persist()`;
  - HTTP, with `/samples` and the manifest served `public, max-age=31536000, immutable` and a content hash in the URL;
  - the origin.
- **Keys:** `sample:<id>@<manifestHash>`, `clip:<id>`, `cut:<hash>`, `vocal:<record>@<tempo>@<key>` (the pre-stretched versions), and `kit:<id>|<style>|v<n>` with the kit's noise seeded from the kit id. Old ids must keep loading.
- **Tiers:** T0 is the first section's first bar, before the press. T1 is the section the playhead is in. T2 is the next section, ready at least one bar before it starts. T3 is the rest, at idle. T4 is the likely next thing (the next seed's kit, the vocal's hook region), cancellable.
- **Events:** `clip-arrived` and `clip-replaced` re-lay only the affected tracks, at the next bar.
- **The warm-up** is keyed on the committed song (`song.id + kit + clipKeys`), never on a ref.
- **Tone leaves the first bundle:** move `vaultKeysOf` and `clipKeysFor` into a Tone-free module, because `app/page.tsx:13` imports `lib/account/clips.ts`, which imports `lib/engine`. Install the studio context with `setContext(ctx, true)` so Tone's default context is disposed.
- **One sample rate:** default to a 44,100 Hz studio context, where a decode measured 375 ms against 1,320 ms at 48k. Switch to the device rate only if an A/B on Brady's machine says so.

### 8.2 Ready-gated, bar-addressed scheduling (extend Engine and Rig; never rewrite them)
- **Boundaries:** content lands on the next bar. Sections, arrangement, tempo, loop and goto land on the next 4-bar phrase. Mixer moves land on the next beat. Stop, pause, mute and solo act at once, with a 10 to 20 ms ramp.
- **The mechanism:** `Transport.scheduleOnce(cb, "<tick>i")` under the latest-wins ticket, using the callback's `time`. Never set `.value` or call a bare `rampTo()` inside a callback.
- **Ready gate:** an undecoded track is not laid. It is re-laid on `clip-arrived`. A pending drum keeps its previous voice.
- **Spans are clock state:** start at the next bar with a phase offset after a goto, a loop change or a mid-span lay. Vocals play from pre-stretched buffers.
- **Automation** returns to base at every section start and at the loop wrap. `tune` and `applyMaster` skip parameters whose automation is active.
- **Content hashes** count note durations at 960 PPQ (`steady.ts:12`).

### 8.3 A deterministic start
- `Engine.arm(song)` runs before the press: `prepare`, then a chunked voice build (MessageChannel yields, as in `lib/engine/offline.ts:27-40`), then it lays the first section onto the stopped transport.
- The press resumes the context and starts the transport at a mark, inside the gesture.
- The greeting's fixed first sentence is fetched as PCM during the landing and cached, so it starts at t0 with no race.

### 8.4 The clean desk
- **The master:** a `Tone.Compressor` limiter (knee 0, ratio 20, attack 1 to 3 ms, release 50 to 100 ms), then a soft ceiling whose input is pre-scaled by 0.5, with the curve `CEILING*tanh(2u/CEILING)` and `oversample: "4x"`. Lower the makeup until the seed measures -10 to -8 LUFS with no flat tops.
- **Drums:** per-hit gain and rate at `t`.
- **Retire:** fade from an audio time, and dispose after the fade ends.
- **Duck and gate:** `cancelAndHoldAtTime` plus 2 to 5 ms ramps.
- **One-shots** fade on retrigger. **Cut fills** clip note durations at the cut.
- **Voices** build only the devices they use. **Meters** run only while visible. **Budget:** under 600 native nodes for the seed.
- **One realtime context:** the producer's voice on its own bus before the final limiter, with pipelined sentence fetches and a jitter buffer. The mic analyser and the take recorder run in the same context.

### 8.5 The main thread
- The vault effect depends on `[clipKeys, uid]` and reads through refs.
- localStorage is written on commits only, at idle. The Board's loop mounts once.
- The critic is keyed on structure and waits for 20 s of idle, and every paid route gets its mock guard.
- `hear()` never runs on the main thread while the record plays. Stems are stored as bytes on arrival and decoded when a track uses them. The synchronous stems sum at `useStems.ts:103-108` goes away.
- Kokoro never loads at page open.

### 8.6 The ledger, which is the debugger (`lib/engine/ledger.ts`)
- **Assets:** `{key, why, tier, requestedAt, source, decodedAt, readyAt, dueAt, firstHeardAt}`.
- **Landings:** `{jobId, boundary, landsAtBar, landedAt, partsChanged}`.
- **Placements:** `{phrase, slot, scores, checks, verdict}`.
- **Counters:** `AudioContext.playbackStats` underruns, IndexedDB opens per second, React commits per second, and the rig's `late`.
- It is exposed as `window.__ledger` under `?e2e=1` and `?trace=1`, with an overlay timeline under `?trace=1`.
- The probes assert: nothing is due before it is ready; every landing is on its boundary; each key decodes once per load; zero IndexedDB opens when idle; and every vocal anchor is within 1/16 of a beat.

### 8.7 Constraints you must honour
- Keep the rig's model: voices keyed by `voiceSignature`, content-addressed parts (`steady.ts:8-21`), latest-wins tickets, and a synchronous `apply`, because the offline ears drive the same Rig.
- Tone Parts started on a running transport only fire future ticks, so anything already passed needs a catch-up.
- A WaveShaper covers only input in [-1, 1], and `Tone.Limiter` cannot take a knee.
- Audio starts only from the press. iOS Safari is unmeasured.
- A 4-minute stereo stem decodes to about 85 MB, so decode lazily and pin only what plays.
- The probe shapes `__audio`, `__levels`, `__engine` and `__steps` stay as they are.

---

## 9. The build, in phases

Work on a new branch, `producer`, cut from `crackle`. Commit each phase locally when its DONE WHEN passes. Phases 0 to 2 can run together. Phase 9a runs on the worker and does not depend on the browser phases, so it can run alongside Phases 1 to 7.

### Phase 0: the ledger, the probes and today's numbers
**WHAT** `lib/engine/ledger.ts`. Promote `~/dev/producer-web-progress/loading/load.probe.mjs` and `stub-proxy.mjs` into `tests/` as `npm run load`. Add the mock guard to `/api/critic`, `/api/research`, `/api/attend` and `/api/step`. Log section 10's "today" column in `docs/GYM_LOG.md`.
**DONE WHEN** `npm run load` prints every section 10 engine metric from the ledger, and a mock run makes zero paid calls.

### Phase 1: stop the render loops
**WHAT** Section 8.5, plus one cached IndexedDB connection with `hasClip`.
**DONE WHEN** A record with a chop playing untouched for 60 s makes 0 IndexedDB opens per second and under 1 App commit per second.

### Phase 2: the clean desk (the crackle, fully)
**WHAT** Section 8.4, except the node budget and the single context.
**DONE WHEN** An offline render of the seed has 0 samples on a flat top, a true peak at or below -1 dBFS, and -10 to -8 LUFS; drum onsets correlate 1.0 with their own velocity; a pad swap has no discontinuity; and the master is at base after the loop wrap.

### Phase 3: one asset store
**WHAT** Section 8.1.
**DONE WHEN** Across 10 cold loads every key decodes exactly once. On a reopened sample-kit record, press to transport is under 300 ms. A warm reload sends 0 bytes for `/samples`. Only the studio context is open after the press.

### Phase 4: the bars, fully
**WHAT** Section 8.2.
**DONE WHEN** A hat change lands on beat 1 in 10 of 10 tries. The outro fade survives a move. A loop added mid-section, and a loop region of bars 5 to 8, are audible within one bar. A restored clip is audible on the next bar with no other change.

### Phase 5: a deterministic start
**WHAT** Section 8.3.
**DONE WHEN** Over 10 reloads the start order is identical, with no first-word hole and no long task over 50 ms from the press to bar 2.

### Phase 6: the audio budget and one context
**WHAT** The node budget, the single context, the voice's jitter buffer and pipelined sentences, the sample-rate A/B, and the AudioWorklet that Phase 10 records through.
**DONE WHEN** The seed runs on under 600 native nodes, sentence holes are under 150 ms, there is one realtime context, and render capacity and underruns are measured on Brady's machine.

### Phase 7: arrival bursts and memory
**WHAT** Lazy stem decode (vocals first, hook region first), the reference taken from the worker's facts, LRU pinning, IndexedDB eviction plus `persist()`, and content-addressed cut ids.
**DONE WHEN** While a full vocal job lands mid-playback, late notes and underruns both stay at 0, and the heap peak is recorded.

### Phase 8: the first draft
**WHAT** Sections 3 and 4: `lib/song/draft.ts`, routing in code on Brady's words, typed controls, the job queue with landing promises, cancellation, the refine pass, the questions, "next one" as a new seed, temperature 0 to 0.3 on the brain routes, and the seed taken from the song id. The rollout is demoted to named refines.
**DONE WHEN**
- 20 different names give 20 audibly different full drafts, each audible under 3 s when the store knows the artist (under 45 s when the worker must hear it first).
- The same name on the same record after a reload gives the same draft.
- "Next one" lands a new draft on the next phrase.
- The producer asks "Do you like this beat?" once, after the draft has played, and no more than one question per 30 s.

### Phase 9: the voice
**WHAT** Phase 9a runs on the worker: the resolver, the Kim RoFormer acapella, the other stems without Demucs, karaoke and dereverb on the server only, the vocal map (words, notes, sections, hook score), and WAV delivery, all on the GPU host Brady picks. Phase 9b runs in the browser: fit (Signalsmith, pre-rendered, beat moved to the voice), `lib/song/place.ts`, `lib/ears/vocalCheck.ts`, and the listen-then-ask loop. Depends on Phases 4, 7 and 8.
**DONE WHEN**
- On a 20-name battery of famous records, 100% are the original or an honest one-line refusal.
- On 5 records, Brady blind-picks the new acapella over htdemucs_6s.
- The hook pick matches a hand label on 5 of 5.
- The anchor lands within 1/16 of a beat in 10 of 10 tries at -3, 0 and +3 semitones and at a source tempo 5% away.
- The rendered placement window passes every vocalCheck.
- "Pull the voice from X" is heard in the song within 45 s for the hook region and 90 s for the whole vocal.

### Phase 10: Brady's own voice
**WHAT** Section 5.7.
**DONE WHEN** The loopback offset is under 10 ms on Brady's machine, "put what I just said in the song" is a clip within 2 s of release, and a sung take renders in key (median deviation under 20 cents) with no clipping.

### Phase 11: learning and connections
**WHAT** Section 6.
**DONE WHEN** Every stems and learn job writes vocal rows under the source's family, the 11 heard rows are backfilled, the predicted vocal entry bar beats the "bar 1 of the drop" baseline on held-out records, and the first-offer keep rate per lane is tracked in the ledger.

### Phase S: private sources (needs Brady's go; before any other user is invited)
**WHAT** Section 7: end the shared audio cache, keep audio per user or per device, cache numbers only, and label exports that contain a third-party vocal.
**DONE WHEN** `npm run audit:audio` plus the storage query show 0 audio objects readable across users.

### Phase 12: the listening pass, then Brady's go
**WHAT** Every gate again from a clean build. Then one session on Brady's own Chrome and speakers: "make a song like" three artists, "pull the voice from" two records, one take of his own voice, and the whole song end to end, measured and heard.
**DONE WHEN** It is clean by ear and by the numbers. Merging, the one push, `npm run deploy`, the worker deploy and the GPU host are each Brady's call.

---

## 10. The numbers to hold

| What | Today (measured 09-26 and 09-27) | Target |
|---|---|---|
| IndexedDB opens per second, clip record playing | 50 to 411 | 0 |
| App commits per second, playing untouched | up to 183 | under 1 |
| Seed samples on a flat top | 1.57 to 1.63% at -2.85 dBFS | 0, true peak at or below -1 dBFS |
| Drum onset vs its own velocity | -0.63 | 1.0 |
| Where a change lands | anywhere in the bar, 157 to 274 ms | beat 1 of its bar, 10 of 10 |
| Master after the loop wrap | -18.00 dB | base |
| Native nodes, seed | 1,769 | under 600 |
| Realtime AudioContexts | 3, or 4 after the mic | 1 |
| Press to transport, reopened sample-kit record | 635 to 920 ms | under 300 ms |
| Decodes per key per load | 1 to 2 | exactly 1 |
| Greeting vs record order | flipped in 2 of 4 real-voice starts | identical 10 of 10 |
| "Make a song like X" to a full song audible | about 2 min over 8 LLM calls, silent until the first lands | under 3 s (store-known), under 45 s (worker must hear it) |
| Same name, same record, after a reload | a different path depending on Haiku's wording | the same draft |
| Vocal separation | htdemucs_6s, research-only weights, 8.24 dB vocal SDR, lead and backing mixed, 192k MP3 | Kim RoFormer, MIT weights, 10.98 dB, lead only, WAV |
| "Pull the voice" to heard in the song | about 116 s for the full job on CPU | hook region 45 s, whole vocal 90 s |
| Right version of a named record | unmeasured (the Zedd remix precedent) | 100% or an honest refusal |
| Words the system knows | line starts only | every word with a time, the hook identified |
| Vocal retune | varispeed, +3 st = 19% fast | formant-kept, rate 1 |
| Vocal anchor error | tail-aligned, unmeasured | stressed syllable within 1/16 beat |
| Where a vocal can go | once, before drop 1 | scored slots, the hook in both drops |
| Placement rows learned from records | 0 | every heard record |
| Brady's own voice in a song | not possible | a clip within 2 s of release |
| Third-party audio readable across users | 135 objects, 288 MB | 0 |
| Late notes (rig counter) | 0 | 0 |

---

## 11. Traps

- **Harnesses always run muted:** `--mute-audio` and `?e2e=1`, every time. Until Phase 0 lands, run `ANTHROPIC_API_KEY= npm run serve:mock` behind `stub-proxy.mjs`.
- **Port 3111:** stop only your own pid, and never `pkill -f next-server`. Run one harness at a time. Record `uptime` before each run, and never gate on numbers taken at a load average over 20.
- **Headless is not Brady's speakers.** The crackle gate and the vocal quality gate are his own ears on his own Chrome.
- **Real singers only.** The vocal system has only ever been tested on sine tones. Every Phase 9 gate uses real separated vocals from records Brady brought in, and those files stay out of git and out of shared storage.
- **Licenses:**
  - The Demucs weights are research-only, and allin1 calls them internally.
  - GPL weights (karaoke, dereverb) and Rubber Band stay on the server.
  - Never ship MERT, MuQ, CLaMP 3 audio, SongFormer, MusicGen, Music Flamingo, SongEval, MMS_FA, madmom models, Essentia, Sucial's dereverb, or unlicensed RoFormer fine-tunes.
  - Splice and Tracklib audio never goes into the worker, the DNA store or learning (their terms forbid it).
- **Do not rewrite `rig.ts`.** Do not put the playhead in React. Do not add a second listen path. Pass an explicit time for every Tone change.
- **Clip ids are a contract** with saved records and the vault.
- **Never touch** `data/dna/*.json`, `data/galton.json` or `worker/__pycache__` (the learning lane's uncommitted files).
- **Pushes:** commit locally per phase and push once when done. `crackle` is not merged or deployed, and the live site runs pre-smooth code. `railway up` kills in-flight learn jobs.
- **Copy:** user-facing copy (spoken lines, flash lines, the progress bar) uses full sentences and never an em or en dash.

---

## 12. Not now, and later

- **Later, once Phase 9 is green:** pulling any single sound by words ("just the high lead", "just the snare") with Meta's SAM Audio, whose license permits commercial use, on the GPU host, for one-shots and textures (not the lead acapella). Today's CLAP grab (GYM_LOG:322) covers the rest.
- **Not now:** a new UI, new genres, the Splice partnership, the meter (fixed on `crackle`), and deleting anything in `docs/SOURCES_AUDIT.md` (Brady's decision).
- **When a gate fails:** if a phase's DONE WHEN will not pass, measure why, fix it inside the goal if the fix is targeted, and otherwise stop and say so.
