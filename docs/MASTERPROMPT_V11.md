# THE PRODUCER V11 MASTERPROMPT: music as a solvable science

Written 2026-09-13 from Brady's thirty-minute brief, after re-reading every instruction he has given this project since 2026-07-31 (docs/BRADY_ASKS.md, 179 messages), the ten laws (docs/VISION.md), the gym log, and the code as it stands at commit a214b44. This document is the contract for V11. Everything below is either his words condensed, a decision with its reason, or a measurable proof line.

## 0. The brief, condensed to what it means

1. **One screen, one control.** A loading page with New project and Existing project, then a black stage with a glowing Siri-style edge and one Speak button at the bottom. No other buttons. No mouse, no keyboard. Every Ableton capability lives behind the scenes and is driven by voice. You watch the system move things around; you never touch them.
2. **Conversational speed.** The reply starts in about half a second, like a voice-mode chat. Long musical work happens in the background while the conversation keeps going.
3. **The ritual.** Every session opens with "who are we chasing" (an artist, a song, a feeling). The moment he names one, research runs in the background while the producer keeps asking preview questions. By the time the questions are done, the producer knows the artist.
4. **Agentic playback.** The producer plays what has been made, announced ("I am going to play thirty seconds of what we have"), and asks for a verdict. "Stop" interrupts anything, mid-sentence or mid-audition.
5. **The brain is data.** Music is a solvable science. The system needs a store of every song it can get, condensed into a compact format, sorted by a machine (his image: the pinball board where each pin sends the ball left or right until it lands in a bin) so that any request ("afro reggae and rap") lands in the right bin instantly with every related song beside it.
6. **Mass ingestion, fast.** Speed to scrape, speed to grab, speed to process. Millions of songs is the target; the base is built from whatever can be pulled fastest today.
7. **Find why hits work.** Which openings go viral, which never do, what tempo, key, structure, era and culture have to do with it. Be inquisitive. Make connections nobody has made (physics, history, technology, nature).
8. **Feel.** Teach the machine emotion: happiness is the sun, a warm yellow rush; sadness is the gut. The system should love music, read the feel of a song, and choose by feel as well as by numbers.
9. **Cost.** A song should cost under five dollars in API spend. The expensive model does the hard parts, the cheap model does the repetitive parts.
10. **Keep the good pieces.** The current build is twisted away from the vision (two-sided layout, tools on screen, a base that started from push-to-talk dictation). Keep only the pieces that are genuinely good; rebuild the layout, the style, the flow and the brain around this document.
11. **Not for him alone.** This is a product. Tomorrowland's values (unity, euphoria, escape, everyone welcome) are the mood; its brand is not. Black, hot pink, electric green, explosive.

## 1. The history, deconstructed

Every era of his prompts was reaching for one thing that the build of that era did not give him.

| Era | What he was reaching for | What the build gave him | Lesson carried into V11 |
| --- | --- | --- | --- |
| 07-31 crate scraping | His taste on record, organized by tempo and genre | A DJ USB | Taste is data. The 332 measured tracks and the lane DNA came from this. |
| 08-23 to 08-24 Sweet Caroline in Ableton | Groove, not rigidity; "study the top 100" | A robotic house track | Humanization must be structural (accent waves, pocket, medium syncopation), never random jitter. Hit data is the reference, not intuition. |
| 08-24 to 08-27 the Mac producer | A producer in the laptop you talk to while music plays; never pauses; interviews you; auditions sounds | A system that could not hear him and stopped constantly | The conversation loop is the product. Every failure he called "broken" was latency, hearing, or a pause. |
| 08-29 the roommate paste and the pivot | A consumer product in a browser; hum and it just knows; layer one by one; remembers everything | producer-web V1 | Consumer surface, memory, and the one-element-at-a-time ritual. |
| 08-30 to 08-31 V2 to V7 | Every Ableton feature, start and stop only, visible proof (notes, beats) | SongDoc, the engine, lanes, the visible music | SongDoc v3 and the engine are the IP. They stay. |
| 09-01 the listening restart | "It cannot hear, isolate or change the music"; listen before touching | Ears, stems, the hearing report | Perception is numbers first (tempo, key, chords, loudness, bands, structure) plus a plain-English read. That layer stays. |
| 09-03 to 09-07 the $10k product rounds | Glitch-free, accounts, own key, pull real sounds, identify, tracklists, cost | Accounts, worker, finder, identify, tracklist, cost tiers | The worker and accounts stay. The layout and the always-open mic go. |
| 09-13 this brief | One control, sub-second voice, the data brain, feel, five dollars | (this document) | |

**The three failure clusters** in his complaint log were: cannot hear him or keep talking (Mac era); brain blocked by keys and a bare UI (web V1); the music itself cannot listen, isolate or match a drop, and the platform reads as glitchy (V8 to V10). V11 answers each with a mechanism, not a promise: a speak button with manual commit (hearing), a two-lane brain that speaks in under a second (talking), the Galton store plus ears (the music knows things), and one screen with one control (nothing to glitch).

## 2. The laws, revised for V11

The ten laws from docs/VISION.md stand. Three are amended by today's brief.

1. Conversational and instant. **Amended:** the first spoken word lands within about one second of the button release, every time, or the turn is a defect. Musical work that takes longer runs behind the conversation and reports back when done.
2. He never touches the tools. **Amended:** there is exactly one control, the Speak button. Landing page choices (New, Open) are the only other tappable things, and they are voice-selectable too.
3. Visible proof. The stage shows the transcript, the song moving, and what the producer is doing right now (pulling an artist, building drums, listening back).
4. Genius producer, not servant. The ritual: who are we chasing, one preview question at a time, decisive move, announced audition, verdict, next element.
5. Human, not perfect.
6. Science, not guesses. **Amended:** the science is a store of real songs condensed into DNA records and a router that lands any request in the right bin. Research runs in the background at the moment a name is spoken.
7. Ableton's power, radically simplified.
8. Nothing is ever lost.
9. Emulation on command.
10. Ever-learning.
11. **New: Feel.** Every render and every reference gets a feel read (valence, arousal, tension, warmth) beside the numbers, and the producer chooses by feel as well as by measurement.
12. **New: Five dollars.** Every brain call is metered. A voice-built song targets five dollars at the median. The expensive model decides what the record is; the cheap model does everything else.

## 3. The product

### 3.1 Landing
Black. A small mark. Two choices: **New project** and **Open a project** (the list of projects appears under it, newest first). Tapping either enters the stage. Saying "new project" or "open glow" does the same.

### 3.2 The stage
- The whole viewport is black. When the producer listens, thinks, or speaks, the edge of the screen glows (the Siri-style band: pink, violet, green, animated). Listening is pink. Thinking is violet. Speaking is green. Idle is dark.
- Center: the song, visible. Sections as blocks along a timeline with the playhead; each track a lane whose hits light up as they fire. When there is no song yet, the center holds the last two lines of conversation in large type.
- Under the song: the transcript ribbon. "You:" and "Producer:" in two colors, the last few exchanges, the interim words appearing live while the button is held.
- Work cards: when the producer is doing something in the background (pulling Elvis Presley, building drums, listening back) a card slides in with the task and its progress, and slides out when done.
- Bottom center: the Speak button. Hold to talk. Release to send. Tap once to toggle if holding is awkward. Space bar does the same on a keyboard.
- One status line, small: BPM, key, lane, and the running cost of this record.
- Nothing else. No mixer, no faders, no undo buttons, no verdict buttons, no attach menu. All of those are voice moves.

### 3.3 The opening ritual
1. New project. The producer speaks first: "Who are we chasing tonight? An artist, a song, or a feeling."
2. He names someone. The research lane starts immediately (the store lookup lands in under a hundred milliseconds; a web search backs it up when the store is empty). The producer asks the next preview question without waiting: "Elvis. The swagger side or the ballad side?" Then tempo or energy, then one sound he wants in the room.
3. By the third question, the research is in the producer's context. It talks knowledgeably: "Most of his number ones sit in G and E major, I IV V, around a hundred and twenty. We will keep that skeleton and put it on a modern floor."
4. The blueprint builds in the background (rollout), and the producer announces the first audition: "I have the drums and the bass. I am going to play sixteen bars. Say stop any time." It plays, stops, asks "in or out?", and moves to the next element.

### 3.4 Interrupts
- Pressing Speak while the producer talks stops the voice at once and listens.
- Saying "stop", "hold on", "wait", "pause" during an audition or while it speaks stops it. A small local recognizer listens only for these words while the producer has the floor; the full engine is not needed for that.
- The music itself keeps playing unless he asks for silence. Auditions are announced and bounded (a number of bars or seconds) so he always knows what he is hearing.

## 4. The architecture

### 4.1 The voice loop, version 3
- **Push to talk with manual commit.** The realtime engine (ElevenLabs Scribe v2) runs with commit_strategy=manual. The button press opens the stream; the release sends the commit. The end of the utterance is known exactly, so there is no 0.7 second silence wait. Measured target: committed transcript within 300 milliseconds of release.
- **Web Speech fallback** does the same with stop() on release.
- **Streaming voice out.** The producer's voice arrives over the ElevenLabs stream-input WebSocket as PCM chunks and is scheduled straight into Web Audio, so speech starts as the first sentence closes rather than after a whole MP3 downloads. Music ducks 6 dB under speech and returns after.
- **Free voice option.** Kokoro 82M runs in the browser (kokoro-js, Apache weights, WebGPU or WASM). It is the zero-cost path for users without an ElevenLabs key and the fallback when the network is slow. Voice af_heart or bf_emma.
- **Stop-word listener.** While the producer speaks or auditions, a local Web Speech recognizer listens for the stop vocabulary only.
- The always-open mic, the wake word and the attention classifier from V10 are retired. With a button, everything heard is for the producer.

### 4.2 The two-lane brain
Every utterance goes to two places.

**Lane 1, the Voice (Haiku 4.5, streamed).** A small prompt (about 1,500 tokens): who the producer is, the current state in a few lines (title, tempo, key, lane, track names, section names, now playing, the last six exchanges, research that has landed, work in flight). It answers in one or two spoken sentences and emits one control line: `{"task": ...}` naming what the Hands should do, if anything, or `{"audition": ...}`, or `{"research": "Elvis Presley"}`, or nothing. First token in under 500 milliseconds. Cost about a quarter of a cent a turn.

**Lane 2, the Hands (Sonnet 5 by default, Opus 5 for the blueprint and verdict).** The existing chat route with the full studio contract, the mind, the ears, the taste ledger, the lane recipe and the Galton recipe. It returns ops or a rollout and a report line. When it finishes, the Voice speaks the report if the user has not moved on ("The bass is darker now. Listen to bar three.").

**Lane 3, Research (no model).** Deterministic lookups against the store: artist, song, genre, era, feel words. Returns a recipe: tempo band, keys, mode share, progression grammar, structure archetype, drum and bass grammar, energy contour, hit statistics, exemplars. When the store is empty for a name, one web search (Haiku with the web_search tool) fills the gap and the answer is cached in Supabase for everyone.

**Local moves** (transport, mute, solo, volume, tempo numbers, undo, A and B) resolve in the browser in zero milliseconds as before and are reported to both lanes.

**The cost governor.** Every call writes a usage row (owner, project, route, model, tokens in, cache read, cache write, tokens out, cost). The stage shows the record's running cost. A per-record soft target of five dollars turns the router down a tier (Opus to Sonnet for blueprints) with one spoken line; a hard cap of twenty dollars on the house key stops brain calls with a plain message and the path to the user's own key.

### 4.3 The Galton brain (the pinball board)

**The DNA record: the condensed music file.** One song is one row of about one to two kilobytes:

```
id, title, artist, year, source, genres[], lane
tempo, key, mode, time_signature, duration_sec
energy, danceability, valence, loudness, acousticness, speechiness, instrumentalness (0..1 priors when known)
chart: peak_pos, weeks_on_chart, first_chart_week, last_chart_week, hit_tier (number1 | top10 | top40 | charted | none)
structure: section string ("I V C V C B C O"), section_count, first_chorus_bar, chorus_share
harmony: progression (Roman numerals relative to key, condensed), top_move, chord_vocab_size, borrowed_chords
groove: kick_grid, snare_grid, hat_grid (16-step, from MIDI), bass_rhythm (8-step), syncopation_index, swing
hook: melody_contour (arch | rise | fall | flat | wave), interval_mean, range_semitones, repetition_ratio
feel: valence_read, arousal_read, tension_read, warmth_read (derived)
embedding (512-d CLAP) when audio was heard
```

Every field that can be measured from audio maps one to one onto what lib/ears already produces for a rendered song, so the store and the ears speak one language. Every field that comes from a symbolic source (MIDI, chord sheets) maps onto SongDoc, so a recipe can be written straight into a blueprint.

**The store.** Postgres in the existing Supabase project: `dna_songs` (one row per song), `dna_artists` (one row per artist with medians and counts), `dna_buckets` (the Galton bins, see below), `dna_patterns` (drum, bass and hook archetypes with frequencies), `research_cache` (web answers). Text search on artist and title (trigram), an index on lane, decade, tempo. A compact `data/galton.json` (the bin medians, about 300 KB) ships in the repo so the brain has the grammar even with no database.

**The router (the board).** Each pin is a binary or small-branch decision, applied in order, so every song falls to one bin and every request can be dropped down the same board:

1. Tempo band (halved or doubled into 60 to 180, then binned: under 90, 90 to 110, 110 to 122, 122 to 132, 132 to 145, 145 to 160, over 160).
2. Meter feel (four on the floor, backbeat, broken, halftime, swung).
3. Mode (major, minor, modal or ambiguous).
4. Era (decade).
5. Genre family (from the source's tags folded into twelve families).
6. Structure archetype (verse chorus, loop based, build drop, through composed).
7. Harmony archetype (the condensed progression class: I V vi IV family, i VI III VII family, blues, two chord vamp, static, other).
8. Hit tier.

The bin holds medians and spreads for every numeric field, the top progressions, the top drum and bass grids, the top hook contours, the energy contour, and up to twelve exemplars by name. A request like "afro reggae and rap" is dropped down the board once per named family, and the recipe is the intersection where it exists and the union where it does not, with the differences named so the producer can say which choice it made.

**What "millions" means today, honestly.** The store is built first from license-clear structured sources that can be pulled in minutes, not from downloading recordings:

| Source | What it gives | Rows | Size | License | Ships? |
| --- | --- | --- | --- | --- | --- |
| Billboard Hot 100, 1958 to now (utdata mirror) | Every chart week: title, performer, position, peak, weeks | 340,000 chart rows, about 30,000 songs | 20 MB | Facts (chart positions are not copyrightable) | Aggregates and per-song hit facts |
| Spotify audio features (HF maharshipandya) | Tempo, key, mode, energy, danceability, valence, loudness, genre for 114,000 tracks | 114,000 | 20 MB | Unstated (Kaggle derived) | Aggregates only; per-song priors kept server side |
| Chordonomicon (HF ailsntua) | 680,000 chord progressions with sections, genre, decade, artist ids | 680,000 | 264 MB | CC BY-NC 4.0 | Aggregates only (progression grammar by genre and decade); rows never ship in the product |
| Lakh MIDI, clean subset | 17,000 named MIDI files: drum grids, bass rhythms, melodies, structure | 17,000 | 234 MB | CC BY 4.0 (the dataset) | Derived grids and contours |
| Groove MIDI (Magenta) | 13.6 hours of human drummers with real microtiming and velocity | 1,150 takes | 3 MB | CC BY 4.0 | Humanization statistics (the "human not perfect" numbers) |
| McGill Billboard | Expert chord annotations of 890 chart hits 1958 to 1991 | 890 | small | Research | Aggregates only |
| Brady's measured library | 332 DJ tracks heard by the ears, with CLAP embeddings on the worker | 332 | in repo | His | Yes |

That is roughly 1.2 million data rows on the first pass, all of it pulled and processed on this Mac in under an hour of compute. The non-commercial sources feed statistics only; the statistics are the product's knowledge, the rows are not. Brady decides before a commercial launch whether to re-derive those statistics from a licensed source (this is the one constraint stated once, and it does not block anything today).

**The path to ten million.** The worker already fingerprints, identifies and hears any audio it is given. The store gains a row for every record any user analyzes, every reference they upload, every tracklist entry it names, and every song the producer builds. AcousticBrainz's public dumps (about 30 million low-level feature submissions, computed with Essentia, CC0) are the next mass source for audio-derived fields; MusicBrainz gives the identity spine. That is a follow-on job for the Railway worker, not this Mac.

### 4.4 Feel
lib/brain/feel.ts turns numbers into a read a person would give:

- valence from mode (major up), harmonic tension (fewer borrowed and diminished chords up), brightness (centroid up), tempo in the walking band, lyric sentiment when words exist;
- arousal from tempo, loudness, energy, event density, spectral flux;
- tension from dissonance, harshness, unresolved progressions, builds;
- warmth from low-mid weight, acoustic share, slower attacks.

Each is a number from 0 to 1 and a word. The words are his: sun, warm, rush, lift, ache, gut, drag, cold, snap, weight. The producer receives `FEEL:` for the render and for any reference, and the lane recipes carry feel targets (a KETTAMA drop is rush plus weight; a Summit breakdown is lift plus warm). The taste ledger records the feel of every kept and killed move, so over time the store learns what he means by "boppy" in numbers.

### 4.5 What stays from V10, what goes

**Stays, as is:** SongDoc v3 and every op (lib/song), the engine (lib/engine: live transport, offline render, kits, samples, slice, hum), the ears (lib/ears), the worker (stems, hearing, finder, identify, tracklist, fingerprint cache), accounts, projects, versions and BYOK (Supabase), local intents, rollouts with checks, verify, the critic (silent, recommendations only), the taste ledger, the knowledge library and the lane recipes, the DNA of his 332 tracks, the CDP harnesses.

**Rebuilt:** the whole front (app/page.tsx, components: Landing, Stage, SpeakButton, Field, Ribbon, WorkCards, Glow), the voice loop (hooks/useSpeak.ts replaces useVoiceLoop and useMicLevel), the conversation orchestration (hooks/useConversation.ts: Voice lane, Hands lane, research, auditions, interrupts), the brain routes (/api/voice new, /api/research new, /api/chat kept as the Hands), the cost meter (lib/cost.ts, usage table), and the design system (black, pink, green, the glow).

**Deleted from the surface:** the two-pane layout, the header buttons, the mixer, the meters panel, the ears panel, the critic panel, the verdict buttons, the attach menu, the analyze sheet as a screen (its capabilities stay as voice actions), the wake word and attention classifier, the typed composer (kept only behind ?typed=1 for harnesses).

## 5. The cost model

Prices on 2026-09-13 per million tokens: Opus 5 in 5, out 25, cache read 0.50, cache write 6.25. Sonnet 5 in 2, out 10, cache read 0.20. Haiku 4.5 in 1, out 5.

| Call | Model | Per call | Per song (30 moves) |
| --- | --- | --- | --- |
| Voice turn | Haiku 4.5, 1.5k in, 120 out | $0.002 | $0.08 (40 turns) |
| Hands move | Sonnet 5, 25k cached prefix + 3k uncached, 800 out | $0.02 | $0.60 |
| Blueprint | Opus 5, effort medium, 8k out | $0.35 | $0.35 |
| Rollout steps | Sonnet 5 × 6 | $0.05 | $0.30 |
| Verdict | Opus 5 | $0.10 | $0.10 |
| Research web fallback | Haiku + one search | $0.02 | $0.05 |
| Voice out | ElevenLabs flash, about 3,000 characters | | $0.45 (or $0 on Kokoro) |
| Total | | | about $1.90 on ElevenLabs, $1.45 on Kokoro |

The five dollar target holds with room for a long session. The meter proves it; the harness asserts it.

## 6. Build order and proof lines

Each phase ends with a measured proof, a screenshot looked at, a commit, and a gym log entry.

**A. The stage and the button.** Landing, Stage, Glow, SpeakButton, Ribbon, Field, WorkCards. Push to talk with manual commit; Web Speech fallback; streamed PCM voice out with ducking; stop-word listener; barge-in. Proof: a spoken WAV injected as the microphone is committed within 300 ms of release (measured in the harness), the first spoken word of the reply plays within 1.2 s of release on Haiku, screenshots at 390 and 1440 idle and live look like the brief (black, glow, one button), zero emoji, zero text under 12 px, no clipping.

**B. The two-lane brain.** /api/voice (Haiku, streamed, control line), useConversation (voice lane, hands lane, auditions, interrupts, reports), /api/research (store lookup, web fallback, cache), usage table and cost line, the router and the governor. Proof: a battery of 12 spoken asks on the seed record: every first word under 1.2 s; every musical ask lands ops through the Hands within 10 s; "stop" halts an audition within 200 ms; the cost line moves and the harness prints the cost of the run.

**C. The Galton store.** Ingest scripts (tools/dna/*.py) for the seven sources, the DNA schema (supabase/migrations/0008_dna.sql), the router (lib/brain/galton.ts), data/galton.json, the recipe block in the Hands context and the Voice state. Proof: "Elvis Presley" returns a recipe in under 100 ms with real numbers (chart count, years, tempo band, keys, progressions); "afro house and rap" returns an intersection recipe naming the differences; a blueprint built from a recipe passes the rollout checks.

**D. Feel.** lib/brain/feel.ts, FEEL in the ears read, feel targets in lanes, feel in the taste ledger. Proof: unit tests on known cases (a slow minor pad reads ache and drag; a 142 saturated drop reads rush and weight); the producer's verdict line names the feel.

**E. Ship.** tsc, next build, unit tests, e2e, battery, screenshots, deploy, gym log, memory checkpoint. Proof: production health, the landing page and the stage on the live URL, a live spoken exchange recorded in the log with timings and cost.

## 7. Constraints, stated once

- Recordings of copyrighted songs are not downloaded in bulk from this Mac. The store is built from structured, license-clear data first; audio-derived rows come from what users bring and from open dumps on the worker later.
- Two sources are non-commercial licensed (Chordonomicon, McGill). Only statistics derived from them ship. Brady decides before commercial launch whether to re-derive from a licensed source.
- A Claude Max login is never the product's key (terms, and it rate-limits Opus at once). BYOK stays.
- YouTube refuses server downloads; the finder uses the sources that answer (SoundCloud, Mixcloud, Internet Archive, direct links, the user's own folder).
- Shazam identification is limited to about twenty requests per ten seconds; the worker's gate stays.
- Sub-second speech needs the realtime engine key; the Web Speech fallback commits in about 400 ms on release and is good enough to keep the product alive without it.
- The ElevenLabs key on this machine lacks the user_read permission; TTS and STT tokens work, subscription checks do not.

## 8. Ideas from the history worth carrying forward

- Hum it and it just knows (08-29): the hum action and the sound search stay as voice moves.
- Layer one by one, audition each, in or out (08-26): the opening ritual.
- The judge recommends, he decides (09-02): the critic writes notes the Voice can offer as one question, never applies.
- Stop and point at a bar (08-24, 08-30): the Hands can pause and address a bar; the Voice says where to listen.
- Emulate a named artist or record (08-27, 08-30): the Galton lookup makes this instant and grounded.
- Pull one drum, one synth, one vocal out of a real record (09-06): the worker's stems, one-shots and slice stay as voice moves.
- Every prompt he ever gave feeds the system (09-01, 09-06): docs/BRADY_ASKS.md is the corpus; this document is its current reading.
- Vibe music (09-06): the whole stage exists so that the only skill needed is talking.

## 9. Open questions for Brady (none block the build)

1. Voice: keep ElevenLabs as the default producer voice (about fifty cents a session) or make Kokoro the default (free, local, needs a modern browser)?
2. Store: keep it in the existing Supabase project (free tier, 500 MB) or give the DNA store its own project before it grows past a few hundred megabytes?
3. Licensing: the NC-sourced statistics question above, for launch day not today.

## 10. Status at the end of the first session (2026-09-13 night)

Built, proven and deployed: sections 3 (the product), 4.1 (the voice loop), 4.2 (the two-lane brain and the meter), 4.4 (feel), the Galton store's first pass (4.3: seven sources ingested, 820,668 song rows and 39,802 artist rows live in Supabase with the bins shipped in data/galton.json, the human grooves and the hit statistics wired into the engine and the Hands), and the ship gates (6E). Proof lines met before the Anthropic balance ran dry: e2e ALL PASSED (voice first sentence 1198 ms, hands ops on Sonnet, two cents a move), the real push-to-talk path (commit 204 ms after release), screenshots at 1440 and 390 with a clean DOM audit, production on both aliases.

Blocked on one thing outside the repo: the house Anthropic key has no credit, and every key on this machine is in the same organization. Add credits at console.anthropic.com (or paste a key in the account sheet) and the stage comes alive; nothing else is waiting.

Second stretch, same night ("continue, think big"): the whole ritual proven end to end on a harness-only mock brain (landing by voice, greeting, research from the real store, a groove from the Hands, an announced audition, a press that cuts it, a full audition ending in "In or out?", a task landing ops; zero exceptions); the Voice now speaks its first clause before the sentence closes; the free voice proven in the browser (Kokoro over WebGPU: one 64-second download, then a two-second line in 760 ms); the store rebuilt dance-first (house, techno, trance, garage, dnb, dubstep, hardstyle, disco as families of their own; 3,207 bins); the dance canon (what DJs actually play, read from their Essential Mixes and Boiler Rooms by the worker: KETTAMA, John Summit, Chris Lake, FISHER, Dom Dolla and more) feeding "played by" and "plays" lines into research; every record anyone analyzes now leaves a heard-record row that rebuilds never touch; and the store answered more of your questions (number ones sit in C, Db, G and D major; they are less syncopated and their hooks move more; the first chorus drifted from bar 13 in the sixties to bar 22 in the eighties and back to 17).

Third stretch (2026-09-14, 02:05): the store crossed a million audio-measured recordings. AcousticBrainz parts 0 and 2 (two million submissions, CC0) became 1,112,906 unique recordings with tempo, key, danceability and the mood classifiers folded into the feel reads; songs.parquet holds 1,933,574 rows, the repo ships 2,885 Galton bins, 126,037 artists are rolled up (68,499 in Postgres under the tier rule), and the discovery engine reports 95 effect sizes. Twenty-eight more parts sit on the server, each one about six minutes of pipeline; the rollup and reload at this size take fourteen. The dance canon reached 879 records across 34 mixes and is still crawling.

Not yet built from this document: server-side usage rows (the meter is per browser), the hard twenty dollar cap on the house key (the soft five dollar governor is in), AcousticBrainz on the worker (the path to ten million), the licensing decision for launch (section 7), the Kokoro default (it is the fallback today, ElevenLabs the default), and the worker's own redeploy (Railway is logged out on this machine).

## 11. The next stretch, thinking big

1. **The canon at scale.** Five hundred mixes instead of ten: every Essential Mix, Boiler Room and Cercle the finder can reach, crawled by the worker at the recognition gate's pace (about five minutes a set, so a week of background time). The canon becomes the map of what moves rooms now, by DJ, by year, by tempo, and the store's dance families get exemplars that are actually played, not playlist-tagged.
2. **Audio-derived DNA at scale.** AcousticBrainz's open dumps (about thirty million low-level feature sets, CC0) on the worker: tempo, key, loudness, danceability and timbre for millions of recordings without downloading a single record. Joined to MusicBrainz for identity and to the Billboard spine for hits, this is the ten-million-song store the brief asks for, built from data that is free to use.
3. **The taste ledger into the store.** Every "in" and "out" he says, every A or B he keeps, with the feel and the numbers of the moment, becomes a row. The Hands read his ledger the way they read the lane DNA; over months the producer learns what "boppy" means in his hands, not the average listener's.
4. **The ears as the reward.** The research spine already pointed at it: generate, render, hear, compare to the references and the canon, revise. Run that loop without him in the room (the initiative loop exists) so the producer arrives at the session with three candidates already graded, and he judges instead of waits.
5. **The discovery engine.** The extra questions tonight were hand-written. The next version asks the store its own questions: every pair of columns across eight hundred thousand rows, ranked by how much a hit tier separates them, with the era and the family held fixed, and writes what it finds in plain sentences with the sample size. That is the inquisitive machine the brief describes, and the store is now big enough to feed it.

## 12. Every song its own address (2026-09-14, the fourth stretch)

Brady asked whether the machine actually understands each song and sorts each one uniquely. The honest read on 09-14 morning: every song has its own DNA record, but the board is coarse. Most pins read unknown for most songs, no bin has all eight pins known, the median full bin holds 24 songs and the largest 67,407, and family is known for 4% of songs. This stretch fixes those shortfalls with what is already on disk plus one new public input.

### 12.1 What must be true at the end

- Every audio-measured song (AcousticBrainz, Spotify) carries a fingerprint: 32 numbers that place it in a space where distance means "sounds like". Fewer than 1% of songs share an exact fingerprint.
- "Sounds like X" is answered from the fingerprint in under 100 ms in-process, no database, and the answer for a DJ-played record is judged against the canon: its ten nearest neighbours contain records from the same mixes more often than chance.
- The board has pins every audio-measured song can answer: tempo band, mode, energy band, feel quadrant, decade, family, voice, then the sparse ones (meter feel, structure, harmony, hit tier). Full-depth bins with every audio pin known exist, and the share of songs in bins with three or more unknown pins falls below half.
- Family coverage rises from 4% toward the majority of named songs: an artist's known family propagates to the artist's other songs, DJ canon plays give a dance family, and MusicBrainz's own artist genre tags (CC0, joined on the artist id AcousticBrainz already carries) label the rest of the corpus that MusicBrainz knows.
- AcousticBrainz energy, valence and danceability are calibrated to the Spotify scale on the 10,225 shared recordings (energy R2 0.56, valence 0.19, danceability 0.25), and the spec records those numbers.
- The masterprompt, the spec, the gym log and memory say what shipped and with what numbers.

### 12.2 Mechanism

1. Wider read of the dumps already on disk: all eighteen highlevel classifiers (about sixty probabilities per recording), the rhythm extras (tempo histogram peaks, onset rate, danceability) and tuning. No new AcousticBrainz download.
2. Fingerprint: standardise, PCA to 32 dimensions, int8. Shipped as flat binaries (keys sorted for binary search, vectors, names with offsets, a few stats) under data/prints, traced into the research function. Brute-force nearest neighbours over a million rows is a 36 MB scan.
3. Pins: energy band from calibrated energy quartiles, feel quadrant from the valence and arousal reads, voice from the voice classifier. New pin order puts the universal pins first. Buckets and galton.json rebuild; the shipped subset stays under two megabytes.
4. Family: artist propagation inside the rollup, canon DJ family, MusicBrainz artist genres from the JSON dump. Each step reports the coverage it adds.
5. Calibration: linear fits from the moods, danceability, voice, timbre and log tempo to the Spotify measures, applied to AcousticBrainz rows before the rollup.
6. Proof lines: fingerprint duplicate rate, neighbour test against the canon with a random baseline, in-process latency, pin coverage before and after, family coverage before and after, one live probe per new behaviour.

### 12.3 Constraints carried

Free Supabase tier: the fingerprints do not enter Postgres. No agents unless a job is repetitive and well specified. No em dashes in copy. Deploy through `npm run deploy`.

### 12.4 Status (2026-09-14 evening)

Built and measured: 1,112,906 fingerprints (32 int8 dimensions, 88.7% of the variance, duplicate rate 0.31%); a record's ten nearest by sound share its family 38.8% of the time against a 9.6% base rate. The board's seven universal pins are known for 40% of the store (772,469 songs in 14,601 full bins, where before no bin had every pin known); the songs with three or more unknown universal pins are the 37.8% that only a chord sheet describes. Family 3.8% to 48.0% through MusicBrainz artist genres and artist propagation. Calibration on record (energy R2 0.56, valence 0.19, danceability 0.25). Discoveries 202. Tests 71 of 71. Open: the DJ-played neighbour test needs more canon records with prints (79 today); 28 more AcousticBrainz parts would lift the fingerprinted share and the canon overlap.

## 13. Condense the store (2026-09-15, the fifth stretch)

Brady: the music is stored and takes too much data; condense it further without losing any functionality. Measured on 09-15 morning: data/ 9.7 GB (raw dumps 5.7 GB, parse caches 1.7 GB, derived parquet 1.0 GB, fingerprints 98 MB), Postgres 608 MB (over the 500 MB tier: the buckets table alone 203 MB, which the product never reads), the deploy upload 484 MB (of which 305 MB is offline parquet the product never reads), the fingerprints 98 MB.

### 13.1 What must be true at the end

- Every lookup the product makes answers exactly as before: artists, records, bins, canon, heard, fingerprints, nearest by sound, addresses, the pin words. The unit tests and the live probes prove it.
- Postgres holds only what the product reads: songs (the sixteen columns the lookups select plus the keys), artists, canon, heard. Under the tier with room to grow.
- The deploy upload carries the app, galton.json, the fingerprints and knowledge, nothing else.
- Every parquet file on disk is written narrow and zstd-compressed: probabilities rounded to three decimals (dictionary-encoded), floats as float32, recording ids as 16-byte binaries. Readers need no change beyond the id encoding.
- The fingerprints keep their 32 int8 dimensions (no quality loss) and lose the redundant bytes around them: one sort order (artist key, title key) instead of two key tables, an 8-byte meta row, offsets as deltas, and brotli on disk.
- The raw dumps (re-downloadable in ten minutes) leave the project tree for an archive folder once re-assembly from the caches is proven; the spec records the download commands.
- The spec, the gym log and memory carry a before-and-after table.

### 13.2 Mechanism

1. Postgres: migration 0012 drops the unused song columns and the lane/decade index; the loader loads the song column list the app reads and skips buckets by default; buckets truncated; VACUUM FULL reclaims.
2. Deploy: the deploy script moves data/dna and tests/fixtures aside for the archive step (the archive is built before the upload) and restores them on exit.
3. Parquet: tools/dna/condense.py rewrites every file in place with the narrow encoding and verifies row counts and key checksums; the AcousticBrainz parser and the rollup writers produce the narrow form from now on.
4. Fingerprints: prints.py and prints.ts share the new layout; the tests pin the key hash, the lookups and the neighbour latency.
5. Proof: before-and-after sizes per tier; tests green; live probes for an artist, a record, a "sounds like", and a pin ask.

### 13.3 Status (2026-09-15)

Done and live (producer-9fdwavyms). data/ 9.7 GB to 2.2 GB (the 5.5 GB of raw dumps archived under ~/Archives/producer-web-raw-dumps, re-downloadable; the spec lists the URLs). Parquet 2,354 MB to 821 MB through one writer, every file verified row by row. Fingerprints 98 MB to 59 MB on disk with the same 32 dimensions and the same neighbour quality. Postgres 608 MB to 296 MB (buckets out, songs down to the nineteen columns the lookups read). Deploy upload 484 MB to 56.5 MB. Tests 71 of 71; re-assembly from the caches alone reproduces the AcousticBrainz fragment; live probes for an artist, a record, a "sounds like", a feel ask and a chart name all answer as before.

## 14. The agent loop, hardened (2026-09-15, the sixth stretch)

Brady asked where the agentic side could still improve and said execute. Two of the six were already there: the verify loop fires a hidden corrective pass when the ears contradict the Hands, and the research lines ride into every task. Built now:

1. One retry before an apology. Every model route (voice, chat, critic, step) retries once on a transient failure (rate limit, overload, a dropped socket) after a jittered pause; the Hands' second try runs on the fast model. A streamed reply retries only while nothing has been spoken yet.
2. The server-side ledger and the house allowance. `usage_events` (migration 0013) gets one row per exchange from every model route with the list-price cost; `usage_today()` sums the house key's day. `guardSpend` refuses an exchange once a signed-in user passes `HOUSE_USER_DAILY_USD` (default 5) or everyone passes `HOUSE_GLOBAL_DAILY_USD` (default 40) on the house key, with a spoken line and a banner ("Today's house allowance is used up"). Own keys are never capped. `/api/usage` reports today's number for the meter.
3. Taste that follows the account. `taste_moves` and `taste_pairs` (migration 0013, RLS own rows) mirror the local ledger; `hydrateTaste` at sign-in pulls the account's rows into the browser and pushes what the browser knew. The Voice now sees the taste line as well as the Hands.
4. The corrective pass after a failed verify runs on the fast model (economy flag on that exchange only).
5. A task waits up to two seconds for research the Voice started a moment earlier, so the first blueprint carries the target's numbers.
6. The Voice decision battery: forty utterances with the control kind the room expects (`npm run battery`); skips itself with exit 0 when the brain is down, fails under 95% agreement otherwise.

Proof lines: unit tests (retry, taste merge) green; the ritual harness on the mock still passes; the allowance refuses a call locally with the caps set to zero and never touches the model; live: `/api/usage` answers, health answers. The battery and the retry paths under real overload wait for model credit.

### 14.1 Status (2026-09-15 evening)

Live (producer-pn5b93ncb): the retry on every model route, the usage ledger and the house allowance (`/api/usage` answers; a local run with the caps at zero refused the Voice without touching the model), taste mirrored to the account at sign-in, the fast model on the corrective pass, tasks waiting for research, the decision battery in the repo. 76 unit tests green; the ritual harness on the mock all passed. Waiting on model credit: the battery's agreement number and the retry path under a real overload.

## 15. The surgeon: dissect, grab, and play it in key (2026-09-16, the seventh stretch)

Brady: be the master of music, dissect pieces of music, grab specific pieces or tones, the best isolation software on the planet, a full song under five dollars. Floor on 09-16: the worker separates four stems with htdemucs on 48 CPUs, identifies records by sound, hears them (drum grids, a bass line, chords per block, lyrics, CLAP descriptors), slices drum one-shots that already land tuned to the song's root; the engine plays warped loops and pitched one-shots. Model spend is only the brain; the ledger caps the house key at five dollars a day per user.

### 15.1 What must be true at the end

- "Grab the synth at 1:32" (or the bass, the vocal, the kick, the pad) lands as its own track in the current record, cut at the onset, tuned so the song's root plays the tone at pitch, and the producer says what it did. No model call.
- Every record the studio hears becomes a DNA row the board and the Hands can quote: tempo, key, mode, chord progression in roman numerals, harmony class, kick/snare/hat grids, bass rhythm and root, structure codes, energy, family. "How is this built" answers from it.
- Finer cuts are ready on the worker: six stems (guitar and piano out of "other") and the drum stem split into kick, snare, hats and percussion, behind an environment switch, proven on a record locally.
- Promptable separation is measured, not assumed: an open-weight text-prompted separator is installed and timed on a thirty-second span on CPU, and the result is written down (seconds, and whether the isolate is usable).
- The Voice knows the new moves ("grab", "how is this built") and the harness proves them on the mock.
- Cost: a full record's model spend stays under five dollars on the house key; the ledger enforces it and the meter shows it.

### 15.2 Mechanism

1. Grab, web-side against the deployed worker: the Voice emits `{"grab": {"what": "<synth|bass|vocal|kick|snare|hat|pad|keys>", "at": <seconds or null>}}`; the studio maps the word to the heard record's stem clip (or a drum one-shot), cuts an onset-aligned slice, detects the root pitch in the browser (a YIN on the slice), sets the clip's transpose so MIDI 60 plays the root, and adds a track with one note on the song's root, active in the drops. Reported as a landed move.
2. Dissect, web-side: the heard route builds the DNA fields from the hearing (a TypeScript port of the harmony rules: roman numerals, run collapse, harmony class; structure codes from the energy blocks; grids normalised to 16 steps; family from the CLAP genres) and stores them on `dna_heard` (migration 0014); the heard lines quote them.
3. Worker (local build, deploy waits for `railway login` on this Mac): `DEMUCS_MODEL=htdemucs_6s`, a drum-part splitter (band and transient classification of the drum stem into kick, snare, hat, percussion stems), transcription of the harmonic stems to notes with Basic Pitch when installed, and a `grab` endpoint that scores a text prompt against the stems' CLAP embeddings so the pick is by sound, not by word.
4. The bet: AudioSep (text-prompted separation, open weights) installed in the local worker environment and timed; the number decides whether it goes behind the same switch.
5. Proof: unit tests for pitch, harmony port, grab mapping; ritual harness on the mock with a grab step; live probes; the worker's local run on a public record with the six-stem and drum-part outputs listed.

### 15.3 Constraints carried

The worker cannot be deployed from this machine until `railway login` runs; everything worker-side is built and proven locally and ships the moment it can. No model calls in any isolation step. Nothing downloaded is kept; stems and slices live under the user's account as before.

### 15.4 Status (2026-09-16)

Web side live: grab as a Voice control answered by the studio (onset slice, root detected in the browser, tuned to the song's root, or the worker's tuned one-shot for a drum word), every heard record's DNA on `dna_heard` and quoted by the research lane, the ritual harness with a grab step passing, 78 tests. Worker side built and measured locally (six stems in 148 s for eight minutes of audio on a laptop, drum parts in 11 s, notes with Basic Pitch, `POST /grab` by sound); deploy waits for `railway login` on this Mac, then `railway up` from `worker/` with `DEMUCS_MODEL=htdemucs_6s`. The promptable-separation bet is deferred with the reason written down: AudioSep is not packaged; a clone plus a gigabyte checkpoint is the next step if grab by sound over nine parts is not enough.

## 16. The million dollar surface, the library, and the math of music (2026-09-16, the eighth stretch)

Brady: the design is buggy and does not look like a million dollar product; there must be a better way to reach what has already been made; delete the songs made so far; go past two million songs into genres he has not listened to; give it the ability to make patterns and math out of music. Seen on 09-16 at 1440 and 390: the track field reads as a developer view, section chips truncate to single letters on the phone, the "YOU" label clips under the field, the boot greeting repeats on every load, the status line is a cramped run of numbers, the mic button and the brand mark are generic.

### 16.1 What must be true at the end

- The stage looks finished at 1440 and at 390: one typographic system, one spacing scale, a section bar that never truncates a name, a field that reads as music (bars, sections, energy) rather than a debugger, a transcript that never clips, a status line that reads in one glance, a mic control and a mark that belong to this product. Every screen screenshotted and looked at before it is called done.
- No greeting repeats; no known visual bug from the screenshots survives; the ui review's findings are closed or explained.
- A library: every record the account has made, with its versions, one screen away from the stage and by voice ("open the library", "open GLOW"), with play, open, rename and delete. The landing's "Existing project" leads there.
- The account's existing records are exported to an archive file and deleted, so the library starts clean.
- The store grows past two million: more AcousticBrainz parts fingerprinted, and MusicBrainz's fine genres (thousands of them, amapiano to zeuhl) become a first-class field: a genre table with counts, tempo medians, exemplar artists, joined to the bins and the fingerprints, so any genre word the research lane has never seen still lands.
- Patterns and math: a pattern engine the Hands and the user can call by name. Euclidean rhythms, rotations and densities; polyrhythms and tuplets; Markov chord progressions learned from the store per family; melody contours and intervals from the store; the golden section for structure; explained in one plain sentence when asked ("that kick is E(4,16); the hats are E(7,16) rotated by 2").
- Proof lines: screenshots at both widths, ritual harness green, unit tests for the pattern engine and the library, live probes for a genre the store did not know before, and the archive file of the deleted records.

### 16.2 Mechanism

1. Surface: a design pass on tokens (type scale, spacing, radii, one accent per role), the field redrawn as a section strip with energy and the playing bar, chips that shrink by hiding the label under a dot, the transcript as its own scroll region, the status line as three short groups, the mic control with a state ring, a mark. Screenshots drive it.
2. Library: a `library` view (landing and stage), the projects and versions the account holds, actions by tap and by voice (`open`, `library` controls).
3. Clean slate: an export of the account's projects and versions to ~/Archives, then deletion.
4. Store: four more AcousticBrainz parts through the staged pipeline into the fingerprints; MusicBrainz fine genres from the artist dump into a `dna_genres` rollup (genre, artists, songs, tempo p50, exemplars, family) loaded to Postgres and used by the research lane for unknown genre words.
5. Math: `lib/song/patterns.ts` (Euclid, rotate, density, polymeter, tuplets, contour, golden section) with ops the Hands can emit; `tools/dna/markov.py` trains per-family chord transition tables from the store into a compact JSON the Hands read; a `math` skill that explains what it made.

### 16.3 Status (2026-09-16 evening)

Live (producer-acytwyuh2): the surface as described in 16.1 at both widths with clean audits; the library by tap and by voice; the account's records exported and cleared; 1,412 fine genres answering in the research lane (forest psytrance, footwork, rawstyle, amapiano) and pointing the bins by family; the pattern engine with an `euclid` op and the math skill learned from 680,784 progressions. Tests 80 of 80; ritual harness all passed. Four more AcousticBrainz parts are being fingerprinted (the rollup at four million rows is left for a machine with more memory; the fingerprints and the genre table grow now). The ui review's verdict is folded in as it lands.

## 17. Flow: the patterns of form, joining and feel (2026-09-16 night, the ninth stretch)

Brady: what other patterns can we learn about merging, smooth music, and the flow. The store already holds the evidence: 694,107 section structures (Chordonomicon, Lakh, McGill, the library, the heard records), 334,015 chorus progressions, 500 library records with per-bar energy and section boundaries, and 1,299 DJ-played records across 48 mixes with positions and pitch adjustments.

### 17.1 What must be true at the end

- Measured, per family where the rows allow: the section grammar (what follows what, how long, where the first chorus or drop lands, how many sections, two-drop share); the energy arc (build slope, break depth, the drop's return, silence before the drop); the turnaround chords (what opens and closes a chorus); the DJ transition rules (play length per record, pitch bend, tempo and key relationships between consecutive records); a smoothness figure (the energy jump at a section boundary in real records).
- The Hands read those numbers as a `flow` skill and receive a FLOW CHECK on every exchange: the current record's sections, lengths, energy per section and boundary jumps against the measured ranges, in plain sentences.
- A `transition` op the Hands can emit: the last N bars of a section get a filter rise, a gap (everything but the kick out for the final bar), and the next section's energy lift; it compiles to the existing automation and active ops.
- The research lane answers "how does a house record flow" with the numbers, no model.
- Tests for the op and the flow check; the live probe; the gym log.

### 17.2 Mechanism

`tools/dna/flow.py` measures everything into `data/dna/flow.json`; `tools/compile-flow.mjs` renders the skill; `lib/brain/flow.ts` builds the FLOW CHECK from the song and the ears' facts; `lib/song/ops.ts` gains `transition`; the research route gains the flow line. Known caveat carried: the mix finder resolved three named mixes to one file (Conducta, Overmono, Kaytranada share a tracklist); the canon measurements dedupe by tracklist. The mash move (two heard records joined under the DJ rules) is written down for the next stretch; it needs two stems jobs in one session.

### 17.3 Status (2026-09-16 night)

Measured and shipped: the grammar, the turnarounds, the energy arcs and the DJ transitions as `data/dna/flow.json`; the flow skill; the FLOW CHECK in the Hands' context; the `transition` op; the flow answer in the research lane. Tests 83 of 83. Left for the next stretch: the mash move (two heard records joined under the DJ rules), a re-crawl of the three mixes the finder merged, and the key-relationship figure once more canon records have keys in the store.

## 18. Fame: learn the famous and the viral, and weight them (2026-09-16 night, the tenth stretch)

Brady: learn more from famous and viral music, find their patterns and weight them more; find the best charts for every genre and every year, then execute and patternize. Probed and chosen on 09-16: Wikipedia's chart pages (CC BY-SA; aggregates only ship), 591 of them across the Billboard year-end Hot 100 (1946 to 2025), the Hot 100 number ones, Dance Club Songs (1976 on), R&B/Hip-Hop, Rap, Country, Alternative, Mainstream Rock, Latin, the UK number ones, the UK Dance chart (1987 on), the best-selling singles of the UK and Ireland, and the Global 200. ListenBrainz's popularity endpoint (CC0) answers listen counts for a thousand MusicBrainz ids a call, and 91% of our fingerprinted recordings have one; that joins fame straight onto the fingerprints. Shazam's charts give the viral now per genre. What is not done: downloading or keeping famous recordings; the studio hears public copies transiently and keeps only the DNA.

### 18.1 What must be true at the end

- A charts table: every row of every page above (chart, year, position, artist, title), folded by the store's names, with the year-end and number-one distinction kept; a fame score per song from chart presence (position, weeks, how many charts, which years) and from listens; a viral table from Shazam's genre charts.
- Fame rides everywhere: exemplars in the bins ranked by fame; the discovery engine and the hits skill computed with fame weights and per genre chart and year ("the biggest dance records of 2019 sat at 124, minor, energy 0.78"); the fingerprints carry a fame byte so "sounds like" can prefer the famous neighbour when asked; the research lane answers "the biggest house records of 2022" from the table, no model.
- The listening queue: the famous records the store has not heard with its own ears go through the local analysis one by one (public copies only, nothing kept but the DNA), so the hits' grids, chords, structure and energy arcs come from our ears rather than only from tags.
- Proof: row counts per chart family, the join rate to the store, the listens coverage, three live probes, the gym log.

### 18.2 Mechanism

`tools/dna/charts_wiki.py` harvests the pages through the MediaWiki API and parses the tables; `tools/dna/listens.py` fetches ListenBrainz; `tools/dna/shazam_charts.py` reads the genre charts; `tools/dna/fame.py` folds them into `data/dna/fame.parquet` and the `fame` column of the store, then the rollups, the hits and discoveries skills and the prints rebuild read it; the learning lane in the website runs the hearing over the famous records that lack a heard row. Attribution for Wikipedia and ListenBrainz goes in the spec.

## 19. The instrument itself: no glitch, every record kept, the music visible like a console, and a voice from any record (2026-09-17, the eleventh stretch)

Brady: finish the music tests, then understand why the music glitches when it runs, because storing the music is not architected right; make sure every record is stored accurately; replace the coloured boxes with what real music software shows, the volume in decibels, every beat, the graphs a musical brain reads, and keep nothing clickable but the voice box; process in real time; take clips from online, isolate one specific voice from a record, and let the studio, which already has the patterns and the ears, put that voice right before the drop so it sounds right; and say how the store of millions of songs can go further.

### 19.1 What the tests and the probe found (2026-09-17 afternoon)

- The music tests: 83 of 83 unit tests, the whole-song battery 11 of 11 against the real brain (6.5 to 15.8 s a move, the flagship-or-fast routing from the uncommitted chat route change in play), the audibility probe AUDIBLE (master peak -2.4 dB, kick, hat and pad all sounding). The audibility probe itself had a bug: it launched Chrome without its own profile, so with Chrome already open the launch handed off and no debug port appeared; fixed.
- A new health counter in the engine (`Engine.health()`: note events, late events, the thinnest scheduling margin, graphs alive on the transport, rebuild cost) and `npm run glitch` (tests/glitch.probe.mjs) measured the seed record in headless Chrome:
  - untouched playback, 8 s: 3 late events, thinnest margin -61 ms, 12 main-thread long tasks (max 165 ms, 1.65 s of 8 s blocked) with nothing happening;
  - ten instant moves (mute, unmute, tempo, volume): 126 late note events, thinnest margin -5.7 s, one main-thread block of 5.9 s, every move a full graph rebuild of about 147 ms;
  - the open-a-project path: graphs alive 1 before, 2 after load, 3 after start, 2 after stop. A graph built by loading the record before the session starts is never torn down; it plays underneath every later version of the record.
- The causes, read in the code and confirmed by those numbers: (1) `Engine.update()` tears down and rebuilds the whole graph (master chain, reverb, every voice, every part) on every change, and the leveler after the ears causes a second rebuild seconds later; (2) `start()` never tears down a graph that `update()` built first, and `setSong` calls `update()` on every load because the engine object exists before the session starts; (3) the ears run their analysis on the main thread after every change (the offline render is off-thread, the DSP over it is not), which starves the scheduler whose lookahead is 100 ms; (4) a React state update every 90 ms for the playhead re-renders the whole page, and the field recomputes every pattern of every track on each render; (5) decoded clips are cached without a cap, and a full stem decodes to 170 MB, six of them to a gigabyte; (6) the local library is keyed by title, so two records called Untitled overwrite each other, uploads never leave the machine, and a failed save is swallowed.

### 19.2 What must be true at the end

- The engine never rebuilds a playing graph for an ordinary move. The master chain and every voice persist; a change re-schedules parts and swaps only the voices whose sound changed, with a short crossfade; mute, solo, volume, tempo and loop are ramps and transport settings. `npm run glitch` reports zero late events across ten moves, no leak, no main-thread task over 50 ms during a move, and the ritual, battery and audibility harnesses still pass. The corner of the board shows dropouts, which reads 0.
- Every record is stored accurately: a project id is the unit, not a title; every clip the song references (uploads, stems, one-shots, grabs, renders) is mirrored to the account's storage under the project with its size, duration and hash in the song, so a record opened on another device has all its audio and a missing clip is named, never silent; local saves are quota-safe and a failed save shows; versions carry the facts and the last full render plays from the library instantly.
- The board reads like a console: per track the real waveform of its loop with the beat grid, a decibel meter with peak hold, hits lighting as they fire; the master with L and R meters in dBFS, integrated and short-term LUFS, a log-frequency spectrum, the energy curve of the arrangement with the drop marked, a bar and beat counter, measured BPM against the set one. Drawn at 60 fps on a canvas outside React. Nothing on the stage is clickable except the speak control; library, sign in, use my key and start over are voice controls.
- A voice from a record: "isolate the female voice from <record> and put it right before the drop" pulls the record (link, name, tab, upload), separates the vocals, cuts it into phrases with words, pitch, loudness, a hook score and a speaker per phrase, picks the one asked for, tunes it to the key, stretches it to the tempo, lands its end on the drop downbeat with the family's measured lead-in, opens the gap and riser under it, and the ears verify the timing and the masking before the producer says it is in. The studio keeps playing and talking while the record is pulled; the phrase is announced when it lands (the worker separates a four-minute record in under a minute on its 48 CPUs; that is the real-time this means today).
- Patternized: the vocal drop is a table in the store, measured from records the studio has heard, rolled up by family and tempo, and the placement rule reads it instead of a constant.

### 19.3 Mechanism

Engine (lib/engine): `Engine` keeps a persistent master chain and a `Map<trackId, Voice>` keyed by a voice signature (role, synth params, fx, clip identity, kit). `update(song)` diffs against the last song: tempo goes to `transport.bpm.rampTo`; mute, solo and volume go to gain ramps on the existing voices; a changed voice signature builds the new voice, crossfades 15 ms and disposes the old one; parts are cleared and refilled from `scheduleEvents` (parts make no sound, so this is glitch-free); loop bounds are transport settings. Before `start()`, `update()` only stores the song; `start()` tears down anything alive first; `newSession` and `loadSong` stop before loading. `hearSong` keeps its offline render and moves `hear()` into a Web Worker (lib/ears is typed-array code with no DOM), debounced 500 ms after the last change; the leveler applies as a master ramp, not a rebuild. The decoded-clip cache is an LRU by bytes (256 MB) and a long stem decodes only the window the song references. The health counter stays and feeds the board's dropouts figure.

Storage (lib/account, hooks/useProjects, lib/engine/clips): the project row owns its clips: table `project_clips` (project_id, clip_id, name, bytes, duration, sha, storage_path, source: upload, stem, oneshot, grab, render), and the song's `AudioClip` gains `bytes` and `sha`. `putClip` writes IndexedDB and queues a mirror to storage `{uid}/projects/{projectId}/clips/{clipId}`; opening a project pulls what IndexedDB lacks; a clip that fails to resolve becomes a named line on the board and in the transcript. The local library is re-keyed by project id (the title-keyed entries migrate once); localStorage holds only the current project pointer and a song cache, with a visible "not saved" state on quota errors. A `renders` bucket keeps the last full WAV per version.

Board (components/Board.tsx replacing Field, a canvas): a draw loop reads the transport, the per-track meters and the master FFT and meter from the engine directly; React renders only when the song changes. Waveforms per track come from a one-bar offline render of that track alone (cached by voice signature and pattern), drawn min-max; the beat grid marks every beat, downbeats bright, sixteenths faint, sized to the track's loop; the meter is RMS with a peak-hold line and a clip light; the master gets a K-weighted meter pair for short-term LUFS beside the ears' integrated read; the FFT grows to 256 bins on a log axis with 30, 100, 300, 1k, 3k, 10k labels; the arrangement strip carries the ears' energy curve and the drop marker; a bar.beat counter and measured-versus-set BPM sit in the corner with dropouts. The stage header loses its buttons; the Voice gains `library`, `sign in`, `use my key`, `start over` controls; the sheets that need typing stay modal.

The voice (worker + browser): `worker/vocal.py` runs on the vocals stem after separation: whisper word timestamps, an energy gate, pyin pitch per phrase, loudness, a hook score (repetition of the phrase text across the record, loudness, sitting in a peak block), speaker embeddings per phrase (speechbrain ECAPA) clustered into voices with a CLAP descriptor each ("female, sung", "male, rap"); the job result gains `vocal: { voices, phrases }` and every phrase is a slice the browser can cut from the vocals stem clip. The Voice lane gains `vocal {what, from, where}`; `useStems.dropVocal` picks the phrase (by voice descriptor, by quoted words, or the top hook score), cuts it (the slice op), tunes it (`transposeForRoot`, formant left alone, so within 3 semitones and the ears say if it strains), stretches it (GrainPlayer at song BPM over source BPM), and places it so its end lands on the drop downbeat minus the family's lead-in from `data/dna/vocal_drops.json`, with the `transition` op's gap and the riser under it. The verify step re-hears the last four bars of the build: the phrase end within a sixteenth of the downbeat (from the rendered vocal track's offset), the vocal band unmasked (a 3 dB lead dip if the lead's 300 Hz to 4 kHz share exceeds the vocal's), and a spoken verdict.

The pattern: migration 0017 `dna_vocal_drops` (record key, family, tempo band, lead-in beats, phrase bars, chop pattern, continues through the drop, pitch relative to key); the heard route writes a row for every record with a vocals stem; `tools/dna/vocal_drops.py` rolls the table up to `data/dna/vocal_drops.json` (by family and tempo band, medians and shares) and `tools/compile-vocals.mjs` writes the "vocals" skill; the listen queue runs over the famous records that lack a heard row so the rule comes from hits.

### 19.4 Phases and proof lines

1. Engine: the leak, the diff-driven hot swap, the ears in a worker, the playhead off React, the clip cache cap, the dropouts figure. Proof: `npm run glitch` CLEAN (zero late events over ten moves, graphs alive 1 through load, start and stop, no long task over 50 ms during a move), ritual, battery and audibility harnesses pass, and the record heard by ear on the deploy.
2. Board and the voice-only stage. Proof: shots at 1440 and 390 looked at; the DOM audit finds one control on the stage; 60 fps with 14 tracks measured in the probe; a musical reader can see the kick's level, the beat grid and the LUFS at a glance.
3. Storage. Proof: a record with an upload, a stem loop and a grab opens on a second browser profile with every clip; localStorage cleared mid-session loses nothing; a missing clip is named on the board; the library plays the last render instantly.
4. The voice from a record. Proof: a public record with a sung hook, "isolate the vocal and put it before the drop", lands a tuned, timed phrase that the audibility probe hears in the build's last bars; the ritual harness gains the step on the mock; the worker's phrase cut proven locally on the smoke record (timing per stage in the gym log). Deploying the worker still needs `railway login`.
5. Patternize. Proof: `dna_vocal_drops` rows from the heard records and the listen queue's first fifty famous records; `vocal_drops.json` with per-family lead-ins; the placement rule reads it; the "vocals" skill compiled.

### 19.5 Going further with the store

Ranked by what it teaches the machine per hour of work: (1) run the listen queue over the famous records (built, unrun): grids, chords, structure, vocal placement from our own ears rather than tags; (2) full-audio corpora that are legal to hear in full at scale: MTG-Jamendo (about 55,000 full CC tracks with genre, mood and instrument tags) and the Free Music Archive (about 106,000 CC tracks), run through the worker's hearing on the Railway box, which is where drop timing, vocal placement, transitions and energy arcs get measured over a hundred thousand records instead of five hundred; (3) the Discogs monthly dump (CC0): labels, release years, remix lineage, styles per release, joined by artist and title, which sharpens family and adds "who remixed whom"; (4) the remaining AcousticBrainz parts (24 of 30, about 4 million more recordings) once the rollup streams instead of holding 4 million rows; (5) the DJ canon from 50 sets to 500 (the tracklist jobs on the worker, about 5 minutes a set at the recognition limit); (6) the taste ledger across users, which compounds on its own. Not worth it now: Spotify's audio features (gone from the API), Shazam charts (dead endpoints).

### 19.6 Constraints, said once

A vocal lifted from a commercial record is a sample; releasing a record that carries one needs clearance, so the library and the render name tag such clips "uncleared sample", while the user's own recordings and the CC sources (FMA, Jamendo, Freesound, the Archive) are clean. The worker reaches production only after `railway login` on this Mac. Section 18's fame chain left uncommitted data files and a chat route change in the tree; they are the previous stretch's and are not touched by this one. Agents: at most two, each a separate deliverable (the worker's vocal phrases; the storage mirror), the engine and the board inline.

## 20. Everything through the website (2026-09-18, the twelfth stretch)

Brady: Railway is logged in, but we want everything running through the website. Nothing else, and the system agentically should have the tools to execute.

### 20.1 What was found
- The worker had been running `htdemucs` since the seventh round, because that deploy never happened. Its health endpoint had the model name typed in as a literal, so it reported the four stem model whatever it was loading, and nobody could tell.
- One record had ever been through the studio's own ears. The store knew what a hundred thousand records ARE, from charts and tags, and what almost none of them SOUND like, because hearing one meant running `tools/dna/listen_queue.py` on a laptop with a worker venv and a `DYLD_LIBRARY_PATH`. That script also held a second copy of the DNA rules, in Python, which would have drifted from the route's the first time either changed.

### 20.2 What must be true at the end
- The worker separates six ways with the drums split again, and says what it is actually loading.
- The producer can learn on its own, from the website, with no script anywhere: it picks famous records the studio has never heard, has them separated and heard, and keeps the DNA. It is a control it holds, not an errand for a person.
- One implementation of the rules that turn a hearing into what the store keeps, shared by the lane a person drives and the lane the producer drives.
- What the charts already know (the family, the year) beats what a classifier guesses.
- Learning answers to the same switch as pulling a record in by name, because it is the same act at volume.

### 20.3 Mechanism
`DEMUCS_MODEL=htdemucs_6s` and `DRUM_PARTS=1` on the worker, both models pulled at build so no job waits on a download, and `/health` reporting `os.environ`. `lib/dna/heard.ts` holds `heardRow` and `rememberHeard`, used by `app/api/dna/heard` and by the learning lane. `app/api/learn` POST picks from `dna_charts` by family and year, skips anything already in `dna_heard`, creates one ordinary stems job per record and hands each to the worker; GET reports the run and writes what has landed, marking each job so a second poll never counts a record twice. The Voice control `learn {what, count}` runs it, reports as it goes because it takes minutes, and says what came back. `lib/brain/families.ts` is the shared word map; `lib/brain/norm.ts` is the name normaliser, out of the store's lookups so a route that only needs a tidy name does not carry the bins.

### 20.4 Proof
Six stems on a real job: drums, bass, vocals, other, guitar, piano, then drum-kick, drum-snare, drum-hat, drum-perc. `npm run learn` against the live worker and the live store: three number ones picked, fetched, separated, heard and written, the store going from one record to four, each with its tempo, key, progression and grids.

### 20.5 Said once
The store's corpus build (`run_all.py`, the rollups, the prints) is a build of a dataset, not something the product does while someone is making a record, and it stays a tool. Everything the studio does while a person is in the room now happens in the website.
