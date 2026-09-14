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

Built, proven and deployed: sections 3 (the product), 4.1 (the voice loop), 4.2 (the two-lane brain and the meter), 4.4 (feel), the Galton store's first pass (4.3: seven sources ingested, the bins shipped in data/galton.json, the row tables loading into Supabase, the human grooves and the hit statistics wired into the engine and the Hands), and the ship gates (6E). Proof lines met before the Anthropic balance ran dry: e2e ALL PASSED (voice first sentence 1198 ms, hands ops on Sonnet, two cents a move), the real push-to-talk path (commit 204 ms after release), screenshots at 1440 and 390 with a clean DOM audit, production on both aliases.

Blocked on one thing outside the repo: the house Anthropic key has no credit, and every key on this machine is in the same organization. Add credits at console.anthropic.com (or paste a key in the account sheet) and the stage comes alive; nothing else is waiting.

Not yet built from this document: server-side usage rows (the meter is per browser), the hard twenty dollar cap on the house key (the soft five dollar governor is in), AcousticBrainz on the worker (the path to ten million), the licensing decision for launch (section 7), and the Kokoro default (it is the fallback today, ElevenLabs the default).
