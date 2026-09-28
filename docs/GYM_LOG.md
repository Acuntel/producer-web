# GYM LOG

## 2026-09-02: gym round 1 integration (lanes, daw, samples)

Base: main at 88050de. All three branches shared that base and were merged in order with `git merge --no-ff`.

### Merged
1. `gym/lanes` (36b470e) -> merge 8885b16. Clean merge, no conflicts. Lane is any string id; ten lanes indexed in lib/brain/laneNames.ts, recipes read from knowledge/lanes/lanes.json by lib/brain/lanes.ts; rolloutIntent recognises lane asks; useRollout pins an asked lane; kits borrow by home tempo; two new seeds (NORTHERN LIGHTS, AFTER HOURS); tests/lanes.test.mjs (6 tests).
2. `gym/daw` (83c8a44) -> merge 8a85c63. Two conflicts, both resolved by keeping both features:
   - hooks/useRollout.ts: the blueprint step now both pins the asked lane (`if (next && lane) next.lane = lane`) and injects the reference groove into ops (`withReferenceGroove`).
   - lib/brain/contract.ts: the SongDoc header keeps the lane id wording and the "other lanes per their recipe" sidechain note from lanes, plus the groove field and the "legacy dial, prefer groove" humanize note from daw; the LANES paragraph sits above daw's ENGINE AUTO-CRAFT (with GROOVE POOL) and LAWS (variant plans, chance, velDev); the ears paragraph carries daw's grooveMap and lanes' "(other lanes: the LANE RECIPE mix targets)"; the reference paragraph is daw's (groove from reference).
3. `gym/samples` (6854f84) -> merge 5066aa2. Six conflicts, all resolved by keeping both features:
   - lib/engine/kits.ts: `kitStyleFor(lane, bpm)` from lanes stays; `getKit(lane, kit?, bpm?)` resolves the synth style by lane home tempo first, then returns `synthKit(style)` for kit undefined or "synth", else the library kit via `sampleKit(kit, style)` with synth fallback on failure.
   - lib/engine/engine.ts and lib/engine/render.ts: `getKit(song.lane, song.kit, song.bpm)`; the section-hearing cache key includes both `g: song.groove` (daw) and `kit: song.kit` (samples).
   - lib/song/migrate.ts: imports from both sides (cleanGroove, isPlan, sampleKey, AudioClip); lane stays a free string (lanes) and `kit` is carried (samples).
   - lib/song/ops.ts: imports from both sides (cleanClip plus ops-daw and swingToAmount).
   - lib/brain/contract.ts: the header imports laneNames and the manifest; the SongDoc line has both `"lane": lane id (see LANES)` and `"kit"?: ...`; SAMPLES_BLOCK is appended at the end as before.

### Reverted
Nothing. Every merge passed all three objective gates.

### Gates after each merge
- After lanes: unit 28/28 (tsx), ears 8/8, tsc clean, next build ok.
- After daw: unit 34/34, ears 8/8, tsc clean, next build ok.
- After samples: unit 42/42 (samples 8 + daw 6 + lanes 6 + 22 existing), ears 8/8, tsc clean, next build ok.
- File sizes after integration: hooks/useStudio.ts 298, lib/song/ops.ts 277, lib/brain/local.ts 170, lib/engine/kits.ts 157, lib/song/migrate.ts 121, lib/brain/contract.ts 79.

### Harness on the integrated build (localhost:3111)
- `E2E_SKIP_SELFTEST=1 node tests/e2e.mjs`: ALL PASSED (brain answered with ops, song and bass changed, ears panel read 126 BPM D minor -9.2 LUFS, critic wrote a recommendation with Do it / Not that, health ok).
- `npx -y tsx@4 tests/brain-battery.mjs http://localhost:3111`: 11/11 passed. "new song, KETTAMA style, surprise me" returned action rollout newSong with lane hard-house.

### Deploy
- `npx vercel --prod --yes`: deployment producer-k7f0lzu0n-acuntels-projects.vercel.app, target production, status Ready, created 2026-09-02 14:08 PDT.
- https://producer-web-acuntels-projects.vercel.app/api/health -> {"brain":true,"voice":true,"model":"claude-opus-5","version":"v9-process"}.
- New file from gym/samples on the alias: /samples/starter/manifest.json -> HTTP 200, 27737 bytes, pack "starter", 40 samples, kits starter / starter-hard / starter-808 / starter-acoustic. The alias serves the new deployment.
- lanes.json is traced into the chat and step route bundles (.next/server/app/api/chat/route.js.nft.json lists knowledge/lanes/lanes.json), so the LANE RECIPE block should render in production. data/dna.json is read through a variable path and is not listed in the trace (pre-existing).

### Live battery (alias)
- Run 1: 8/11. The first eight asks passed on the live brain; the last three failed.
- Run 2: 0/11. Every reply was the credits fallback: `detail 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API..."}}`.
- Read: the production ANTHROPIC_API_KEY's account ran out of credits during run 1. This is an account state, not a code failure; the same code passed 11/11 locally minutes earlier. Action for Brady: top up that account or swap the Vercel ANTHROPIC_API_KEY to a funded key, then rerun `npx -y tsx@4 tests/brain-battery.mjs https://producer-web-acuntels-projects.vercel.app`.

### Not proven in this round
- Real-browser playback of library kits and sample clips (fetch + decodeAudioData + Tone.Player against the actual files); the e2e run did not exercise "use real drums".
- Groove map extraction on real DJ-tagged tracks (only synthetic mixes so far).

## 2026-09-03 — Consumer UI/UX rebuild

Brady's verdict on V9: "extremely glitchy... probably the worst music product I've ever seen. nothing works right." He asked for it to read as $10,000 software and work as a standalone consumer product.

### The testing gap that let this happen
Three harnesses were green (brain battery 11/11 local and live, e2e ALL PASSED, unit tests) while the UI was genuinely bad. They proved endpoints answer, ops apply, and audio measures. **Not one of them rendered a page and looked at it.** `tests/cdp-shot.mjs` already existed and caught every defect in one run. Screenshot at 390 and 1440 before calling any UI round done.

### Defects measured in headless Chrome (not opinions)
- Four elements hard-clipped: mixer sliced mid-channel, arrangement cut a chip in half, track names truncated to "TAMBOUR…", mobile header wrapped "The / Producer".
- Text at 8, 9, 10 and 11px throughout.
- Contrast failed AA: `zinc-500` on near-black ≈ 4:1 for section names and metadata.
- Emoji used as interface icons throughout. The loudest "generated UI" tell.
- `max-w-2xl` column stranded in a 1440px viewport with a `flex-1` chat box stretching into a void.
- All four expert panels expanded by default: a wall of dense numbers on first paint.
- Missing favicon (real 404 every load).

### Shipped
- Design system in `tailwind.config.ts` + `app/globals.css`: one surface ramp, one AA-checked ink ramp (18.4 / 8.1 / 5.2 : 1), one accent plus live/cool/warn, a type scale with a 12px floor, `.panel`, `.scroll-x` edge fades, `.scroll-fade-y`, skeletons, tabular numerals, reduced-motion support. Inter + JetBrains Mono.
- `components/Icon.tsx`: 23 hand-drawn stroke icons. Zero emoji remain.
- `components/ui.tsx`: Button, IconButton (tooltip + aria-label), Panel, Disclosure, Chip, ScrollX, Empty.
- `components/Orb.tsx`: hero control. `running` (audio moving) is independent of `phase` (idle/starting/listening/thinking/speaking/hearing/playing/paused) because the mic is open while the track plays.
- Layout split into `StudioPanel` + `Conversation` under a thin `page.tsx` shell. Desktop two-pane, mobile stacked with the studio capped at 52dvh. Every file under 300 lines.
- Only "The music" opens by default. Producer's notes auto-opens the first time a note arrives.
- Measured read ("Measured 126 BPM · D minor · -9.2 LUFS · peak") moved into the song header, because collapsing the ears panel had made the proof invisible.
- Opener chips, composer attach menu, capped reading measure, real empty and loading states, arrangement auto-scrolls to follow the playhead, `app/icon.svg`.

### Gates
- `tsc --noEmit` clean · `next build` green · 46/46 unit tests (styles 5, incl. three new regression guards: no text under 10px, no emoji in any .tsx, every IconButton labelled).
- DOM audit: tiny-text list empty, no console errors, no 404s, only the two intentional scrollers report overflow.
- `node tests/e2e.mjs http://localhost:3111` ALL PASSED.
- Screenshots reviewed at 390, 768 and 1440, idle and mid-session, plus every panel expanded.

### Traps
- `tests/e2e.mjs` hard-codes markup. `button[aria-label="Start"]` and `document.querySelector('footer input')` both broke; updated to `"Start the session"` and `input[aria-label="Message the producer"]`, and the critic anchor moved off the copy string "Suggested:" onto the `Do it` button. A markup change surfaces as "timeout waiting for orb", which is a harness selector, not a product bug.
- Flex children are blockified, so `innerText` breaks a flex row of spans into one line each. The header metadata is deliberately plain text.
- A collapsed disclosure removes its text from `innerText` and any text-scraping step fails.
- `JSX.Element` is not global under React 19 + TS 5.7; use `ReactElement`.
- A `-mx-1` bleed on a scroller caused a real 8px horizontal overflow. Pad, do not bleed.

## 2026-09-06: V10, the "vibe music" round (accounts, streaming, stems)

Brady's brief: use it as a user and find what is glitchy; accounts and projects like a drive; bring your own API key; skills that teach the model to analyze music; pull one drum or synth out of a real record; say it and it happens. Plan: docs/ROUND_0906_MASTERPROMPT.md.

### Measured on prod before the round (Chrome, as a user)
- "make the bass darker and heavier": 12.8 s of dead air, then the whole reply at once.
- New song rollout: 11 tracks in about 2 min, measured -4.6 LUFS at peak 0.0 dBFS (crushed; the mix check had no upper bound).
- Hook step JSON truncated and the parser's fallback SPOKE the raw JSON. Craft step: 5 ops rejected on both attempts and the retry never saw which. Hook check rejected the hoover stab hook twice.
- Stale "listen for" hint carried onto the new song. "plain" variant chip rendered as debug text in a lane.

### Shipped (commit 3205844 + this one)
- Streaming brain: /api/chat answers NDJSON; the first sentence is spoken while the ops finish. Probe on the seed: first words 3.9 s, ops 5.5 s.
- Glitch fixes: safeSay never speaks JSON; step route retries a truncated reply terse; useRollout feeds REJECTED OPS with the real section and track ids into the retry; hook check accepts a stab hook in stab-led lanes; mix check flags above -5.5 LUFS; lib/song/level.ts leveler pulls the master toward -8 LUFS after hearing; hint and A/B cleared on a new record; variant chips only for playlists.
- Accounts on Supabase (new org The Producer, project eqskttzzncshzplpzwzi): email sign-in gate with a guest path, a version per auto-save, Projects sheet (search, open, rename, duplicate, delete, new), Settings with the user's own Anthropic and ElevenLabs keys validated live and AES-GCM encrypted at rest. Every brain route prefers the user's key.
- Skills injected per intent from knowledge/skills (dance science with citations, breakdown, sampling and stems, vocals, genres), kept out of the cached system prefix.
- Stems worker on Railway (producer-stems, FastAPI + demucs htdemucs + one-shot slicer): link or file in; four stems, kick/snare/hat/perc one-shots with the kick's fundamental, tempo, key, blocks and best 8 bars out. Analyze sheet in the composer menu; "Use this kick" puts the sliced sample on the kick track (voices.ts plays a clip on any drum role) tuned toward the song root; "Loop the best 8 bars" adds a warped audio track; the producer gets a hidden breakdown ask and the song-breakdown skill.

### Gates
- tsc clean, next build green, 57/57 unit tests, node tests/e2e.mjs ALL PASSED local and prod, node tests/accounts.e2e.mjs ALL PASSED (sign-up, adoption, version row, rename, key validation, sign-out, cascade cleanup), screenshots at 390 and 1440 looked at (gate, studio, projects, account, analyze).
- Stems on the live worker: Demo Track 1.mp3 through the sheet, job done in about 3 min (demucs 86 s on Railway CPU vs 28 s on the Mac), 4 stems + 4 one-shots as clips rows.

### Traps
- innerText applies CSS text-transform: an `.eyebrow` heading reads back UPPERCASE to a harness. Match case-insensitively.
- The Bash safety hook blocks any command text that contains the recursive force remove of a root path, even inside a heredoc or a comment. Use apt-get clean in Dockerfiles.
- `vercel env add` with a JWT value prompted and silently added nothing; the REST upsert worked.
- Two Chrome harnesses at once kill each other's profiles.

## 2026-09-06 B: the studio is the product; the listen side hears you

Brady's verdict on V10: right side too big, no chatbot, no keyboard; left side "a 5 dollar side project"; "it needs to hear what I say"; every capability a human producer has, including one-second blips from any public source, trimmed perfectly; not tested, does not work. Plan: docs/ROUND_0906B_MASTERPROMPT.md.

### Root cause of "it does not hear me", found in his Chrome
The prod origin's microphone permission was still "prompt" and the app swallowed every recognition error (`onerror = () => {}`) while the orb said "Listening". Nothing ever asked for the mic clearly, and a denied mic looked identical to a working one.

### Shipped
- Listen side (components/ListenPanel.tsx): orb, a mic level meter driven by a real getUserMedia analyser (hooks/useMicLevel.ts), named mic states with a retry (blocked, no device, speech service down, muted), what it heard you say in large type, what the producer is saying, verdict and A/B controls, a quiet transcript, the two attach actions. No text box, no send button. Typed input exists only behind ?e2e=1 or ?typed=1 for the harnesses.
- Voice loop: recognition errors classified and surfaced; network drops back off and retry; mute; barge-in kept.
- Studio at two thirds (lg:grid-cols-[1fr_minmax(300px,24rem)]): live stereo master meter and spectrum from Tone.Meter and Tone.FFT on the master (components/Meters.tsx, engine.getLevels), a proportional arrangement timeline with bar ruler and moving playhead (components/Timeline.tsx), a transport row, lanes with mute, solo and a live level per lane, an interactive mixer (drag faders move the voice live with no graph rebuild, commit on release; M and S press) all through song ops so the brain gets LOCAL MOVES.
- Producer capabilities: op "slice" (lib/engine/slice.ts: transient search, zero-crossing snap, decay end at -40 dB, fades, -1 dBFS) resolved in the browser from any clip; action "analyze" with a url; stems and one-shots pre-loaded into the clip store after analysis so the brain can slice them; contract and sampling skill updated. Links ON (ALLOW_LINK_DOWNLOAD=1 on Vercel and Railway, Brady's call after the constraint was stated once). Worker slicer: two per role, -40 dB trim end, zero-crossing end.

### Gates (round B)
- tsc clean, next build, 58/58 unit tests (voice echo test added), screenshots at 1440 idle and live and 390 live looked at.
- Local: e2e ALL PASSED, accounts e2e ALL PASSED, stems e2e ALL PASSED including "take one second of the vocal at 0:30" by voice producing a 0.98 s one-shot track from the separated vocal.
- Prod (deployment producer-q0ol2l6p1, commit ac07519): e2e ALL PASSED, accounts ALL PASSED, stems ALL PASSED (8 one-shots, two per role, kick tuned -2 semitones, cloud project carries the clip, producer breakdown, voice slice "Vocal 0:30" 0.98 s). Verified in Brady's own Chrome: new layout, no text box, orb, timeline, 11 faders; his mic permission for the site is still at "prompt" and will be asked for on the first orb press.
- YouTube from Railway: worked once at 20:19, then "Sign in to confirm you're not a bot" on two later runs (21:39, 21:50). Links from a datacenter are intermittent, as the research predicted. Failures now tell the user to capture the tab or upload, and the brain is told to say so.

### Traps
- Two elements shared aria-label "Analyze a record" (the button and its dialog): scope harness selectors with [role="dialog"].
- innerText breaks flex chips into lines and uppercases eyebrows: anchor on data-role attributes.
- A background chain piped through grep buffers until exit: use --line-buffered.
- With the mic open during speech, a headless fake microphone floods the brain with transcribed static: harness mode (?e2e=1 / ?typed=1) no longer auto-opens the mic.

### Attention layer (Brady: "the voice listens all the time whether paused or playing" and "it needs to understand the difference between conversation and action words")
- lib/brain/attend.ts: wake word ("producer" / "hey producer") always gets through; local transport and mixer intents always get through; a quick gate drops fillers and long non-studio sentences, sends clear studio commands, and treats a reaction right after a move as a verdict; everything else goes to /api/attend (Haiku 4.5, one word: COMMAND / TALK / IGNORE, about 0.7 s) which knows whether the music is paused. Paused = the room is talking unless the sentence is clearly for the studio. Fails open.
- The listen side shows what it heard and chose to ignore ("took it as room talk, not for me") with a one-tap "That was for you" override, counts ignored sentences, and says while paused: "I only act on studio words, or say producer first."
- Persona: CONVERSATION IS NOT AN ORDER. Reactions, questions and thinking aloud get an answer with ops null; only requests change the song.
- Probes: "that hook is insane though" = talk; "this reminds me of a summit record, can you push it that way" = command; "yeah I think we should just go tomorrow after class" (paused) = ignore; "what did you just change" = talk. 59/59 unit tests, e2e passed.

## 2026-09-06 C (part 1): memory and home, the real speech engine, Opus everywhere, the interview start

Brady's deeper brief is in docs/ROUND_0906C_MASTERPROMPT.md. This part ships the systems that do not need new infrastructure.

### Shipped
- HOME: the app opens on your records (components/Home.tsx), not a session. Open a card and the studio starts where you left off; New session bottom right opens a blank canvas and the producer asks what we are making. Harness mode (?e2e=1 / ?typed=1) still opens the studio directly.
- MEMORY: projects carry chat, summary and notes (supabase/migrations/0002_memory.sql). Every snapshot saves the last 40 lines of conversation; opening a record restores them and the producer greets with "Last time: ..." (the summary is its last spoken line). A blank session is not a record until the first real change. Pause on a nameless record asks for a title by voice, once; the next sentence names it.
- BLANK START: BLANK_SONG (no tracks, one 8-bar sketch section). The greeting is the interview, not a pattern.
- REAL SPEECH ENGINE: ElevenLabs realtime speech to text (scribe_v2_realtime) over WebSocket with a server-minted single-use token (/api/stt/token; the working endpoint is /v1/single-use-token/realtime_scribe), 16 kHz PCM from the mic, VAD commits, partial and committed transcripts; Web Speech is the fallback when no token can be had or the engine fails twice. Node probe: session in 0.5 s, "Make the bass darker and take me to the drop." exact. Browser proof: tests/voice.e2e.mjs injects a spoken WAV as the page microphone (Chrome's file-capture flag delivers zeros in this build); heard in 3 s, the producer built the bass on the blank canvas.
- OPUS: PRODUCER_MODEL and PRODUCER_FAST_MODEL are claude-opus-5 on Vercel (rollout steps and the critic included). The attention classifier stays on Haiku (one word).
- Sign-in remembers the email and opens on Sign in; a duplicate sign-up becomes a sign-in.

### Verified with the keys on this machine
- ElevenLabs Music API answers (a composition plan with lyrics for a tech house prompt): the partner for musical voices in part 2.
- No Gemini or OpenAI keys exist (only empty templates), so Lyria is not reachable yet.

## 2026-09-06 C (part 2): the ears, the finder, real voices, three lanes, the move visualizer

### Shipped or in flight
- HEAR LIKE A HUMAN (worker/hearing.py): per-stem energy per bar, what carries each 8-bar block and who enters or leaves, drum grids over the best bars (kick / snare / hat by onset classification), the bass line by pitch tracking (root, condensed notes, eighth rhythm), chords per bar from the chords stem, Whisper lyrics from the vocal stem (faster-whisper small, int8, CPU), CLAP descriptors and genre read plus 512-d embeddings for the mix, every stem and every one-shot (stored on the clip rows for sound search), and a plain-English report. The report rides to the brain as LISTENING REPORT and shows in the analyze sheet as "What the studio hears". Local proof on the demo track: "129 BPM, F minor. It opens at 98 percent energy with the bass carrying it ... Bass lives on F, playing F1 x32 with the rhythm XXXXXXXX in eighths. Chords move Fm C# C Fm ..." The worker image pre-downloads CLAP and Whisper; the listening stage adds about 12 s to a job on Railway.
- The analyzed record becomes the REFERENCE: the four stems are summed in the browser and heard by the studio's own ears, so "make it like that" is an emulate rollout with real deltas.
- FIND THE MUSIC: the worker resolves a name across SoundCloud search, Bandcamp search, then YouTube (YTDLP_PROXY honoured); the brain's analyze action takes a query and no longer needs web_search for a link.
- REAL VOICES: /api/music composes on the ElevenLabs Music API (music_v2, composition plan with the lyrics, on the song's tempo and key), stores the mp3 in the user's library, the worker separates the voice, and the studio places the vocal stem as a hook track with a highpass, a delay and a reverb send. Brain action "vocal". Harness step added.
- LANES: pop, hardstyle, psychedelic with full recipes and aliases (13 lanes).
- SOUND SEARCH endpoint: worker /match takes a short recording and candidate embeddings, returns the closest sounds plus the sung pitch contour. UI not wired yet.
- DESIGN: tighter radii, quieter shadows, a flat orb; lib/song/moves.ts turns every op batch into lane moves; the lane flashes and shows the move label ("filter 520", "sound: Demo Track 1 · kick"), and a placed sound auditions once through the master.
- Music engine facts learned the hard way: `composition_plan` is a music_v1 feature (music_v2 rejects it with "Invalid type of composition_plan"), and `music_length_ms` may not accompany a plan. A 10 s hook composes in about 3 s on either model. The route now sends the plan on v1 (lyrics as written) and falls back to a prose prompt on v2.
- Chrome's fake-audio-capture flag delivers silence in this build; tests/voice.e2e.mjs injects a WAV as the page microphone through getUserMedia instead.

### Still open after part 2 (honest list)
- Sound search has an endpoint and a voice action but no dedicated screen; it speaks through the producer ("is this the one?").
- Deep listen of our own render exists as a brain action; the initiative loop does not yet call it on its own.
- The design pass is tokens, orb and lane moves; the mixer and panels still carry the round-B look. A full visual pass against a real DAW reference is the next design round.
- Taste ledger and A/B picks are still per-browser (localStorage), not per-user in the database.
- Vocals: the engine composes a hook in about 3 s; the sung result quality has not been judged by ear yet.

### Cost controls (after the house key ran dry on 2026-09-06 evening)
- What spent it: a 24k-token prefix on every brain call with only the MIND block cached, everything on Opus after the round C switch, eight calls per rollout, a critic call after every re-listen, and about 25 harness sessions across local and prod in one day.
- Now: PRODUCER_MODEL claude-opus-5 for conversation, blueprint, bass and verdict; PRODUCER_FAST_MODEL claude-sonnet-5 for drums, harmony, hook, craft, mix; PRODUCER_CRITIC_MODEL claude-sonnet-5. Economy mode (PRODUCER_ECONOMY=1 or ?economy=1, which every harness now sends) puts every call on the fast model. The critic is keyed on the song's tracks and sections, not the measurement, so a re-listen of the same song writes no new note. Initiative fires after two quiet minutes, six minutes apart at most.
- Cache: the ephemeral breakpoint on the last system block covers persona, contract, process and mind together, so the whole prefix is a cache read after the first call. Prices in one sentence: on this setup a full voice-built song is about $2.50 to $3.50 in brain tokens plus about $0.50 of speech and cents of worker compute; all-Opus uncached was $9 to $12.
- Not allowed and not possible: powering the app with a Claude Max login. Anthropic's terms reserve Pro/Max OAuth tokens for Claude apps and Claude Code; third-party products use Console keys. Verified 09-01: the OAuth token rate-limits Opus instantly anyway.

### Sources that work from the server (Brady: "scrap the sites that don't work and only focus on the ones that do")
- Probed from Railway on 2026-09-06 night: SoundCloud search resolves (skipping DRM-protected label uploads with --ignore-errors across the first five results), direct SoundCloud and file links resolve, YouTube is bot-checked on every attempt, and Bandcamp has no search extractor (its track links still work as direct links).
- The finder is now: a direct link as given (SoundCloud, Bandcamp track, archive.org, any audio file), or a SoundCloud search by name across five results. YouTube links are refused immediately with one line pointing at Capture what is playing. Local proof on the DRM-prone query "john summit where you are": skipped two protected entries, downloaded the Zedd remix.
- Probe table on the deployed finder (2026-09-07 00:5x): by name "john summit where you are" = done, 129 BPM, 4 stems (the DRM entries skipped); YouTube link = refused in under a second with the capture hint; a direct archive.org mp3 failed because `--match-filter "duration < N"` rejects files with unknown duration; fixed to `duration <? N` and redeployed. Probe rows and clips were removed from Brady's account afterwards.

## 2026-09-07: the finder, general (Brady: "think general, this is for anyone"; "burned records, CDs, mixes, anywhere"; "real time and extremely fast")
- worker/finder.py: one ranked search across every public source that answers from a server, in parallel: SoundCloud (tracks), Mixcloud (DJ mixes, public search API), Internet Archive (advanced search over audio: netlabels, live music, the Great 78 Project = digitized records), Free Music Archive, Jamendo and Freesound (licensed libraries, keyed; keys optional and not yet set). Bandcamp by link. YouTube is not a source. Ranking = title overlap, duration sanity, the kind asked for (track / mix / sample), source trust. Local: 18 candidates in 1.2 s for "john summit where you are"; a KETTAMA query surfaced two Essential Mixes on Mixcloud; "78rpm foxtrot 1928" hit archive.org 78s. /find endpoint + /api/find route; the analyze sheet shows the ranked list with source chips and an Analyze button per row.
- By name in a job: the finder's ranked list is tried in order until one downloads (DRM entries fail fast).
- Speed: progressive separation (the best 16 bars separated first: stems, one-shots and a listen land early, the whole record follows), two parallel jobs, a fingerprint cache (chromaprint; the same record analyzed by anyone is served from shared storage with no separation; migration 0003 adds record_cache and a shared read policy), and a speculative search that starts while the sentence is still being spoken (useStems.prefetch on the interim transcript).
- Any computer as a source, for anyone: "Use a folder on this computer" (Chrome directory picker) indexes audio by name in the browser; "pull X from my desktop" = analyze {query, from: "local"}; a match is uploaded and analyzed like any file. Nothing is read until asked.
- Railway proof of the finder: "john summit where you are" = 16 candidates (6 SoundCloud, 6 Mixcloud, 4 Archive) in 1.6 s; "kettama essential mix" = 9 (the BBC Essential Mix 2022 on top); "great 78 fox trot 1928" = 5 (a 1928 Jan Garber fox trot and two archive.org 78 collections). All three under 1.8 s from the worker.
- Fingerprint match, measured: the same record as a 128k mp3 re-encode 0.993, the same record ripped 1.5 s late 0.981, a different record 0.562; threshold 0.82; three compares in 54 ms. An exact hash of the chromaprint failed the re-encode case, which is why the cache compares by bit similarity with a six second alignment search and pre-filters by duration.
- Harness on the live worker (01:4x): finder 16 candidates in 1.45 s; by name "john summit where you are" resolved to the Zedd remix on SoundCloud; preview one-shots (snare, hat, perc from the best 16 bars) usable after 39 s where the first stems used to land at about 100 s; the full record done at 116 s with the listening report ("129 BPM, A minor. It opens at 9 percent energy with the chords and keys carrying it. At 0:29 the vocals come in; at 1:14 the bass comes in"). The cached second run matched at similarity 1.0 in 29 s but failed on adoption: PostgREST bulk inserts need identical keys on every row (stem rows carried bpm and key, one-shot rows did not). Fixed by filling the union of keys; redeployed. YouTube link refused correctly. Slice and vocal steps still blocked by the empty brain key.
- Cache paths, timed on the live worker: a record whose link is already known comes back in 3.2 s end to end with 4 stems and 8 one-shots (no download, no separation); a record known only by sound comes back in 38 s (download, fingerprint, match at similarity 1.0, adopt); a new record takes about 2 minutes with preview one-shots at 39 s. The cache is keyed both ways: by source link (source_urls, checked for every ranked candidate before any download) and by chromaprint similarity. One correction made by hand: a row had been backfilled with the DRM original's link while its stems were the Zedd remix; the link now points at the remix, so a cache hit never serves a different version than the one asked for.

## 2026-09-07 round D: identify by sound, tracklists from mixes, faster separation (Brady: "continue")
- Identify with no key: Shazam's recognition service through the shazamio library. Measured on a real record (the Zedd remix of John Summit and HAYLA "Where You Are"): every 12 s cut at 30, 60, 90 and 150 s named it, with ISRC USUG12304061, label, year and cover, in about 0.2 s from the Mac and 1.6 s from Railway including the storage download. 6 s cuts sometimes pick the wrong version (one picked the original). A copy pitched +4 percent still identifies and the answer carries the pitch shift as frequency skew, which is the DJ's pitch move. An 8 kHz 24 kbps phone-quality copy and pink noise return nothing, so no false positives. The Pioneer demo tracks are sample-pack records that match several releases; never judge reliability on them.
- Tracklist: 12 s cuts merged by recognition key within 90 s (two decks layered come back as alternating hits and become two entries over the same minute). Six minutes of the KETTAMA Essential Mix (Mixcloud) came back locally in about 2 s: Jamie Antonelli "Divine", Lane 8 "Clarify (Tinlicker Remix)", Espiano "MAYDAY", Chloé Robinson and DJ ADHD "Pax (Four Tet Remix)" at +1.0 percent, ATB "9 PM" at +3.5 percent layered with Gigi D'Agostino "Bla Bla Bla" at +1.6 percent. Cut position matters: two of those records only showed at positions shifted by half a step, hence the boundary refinement.
- Throttle, learned the hard way: the recognition service slows to 7 s answers and timeouts after a burst of about 30 requests from one address. The worker's first tracklist ran at 1.7 s per cut because the signature is pure Python behind the GIL, so threads did not parallelize; the fix is a process pool, a per-request timeout (8 s), a coarse pass every 60 s with midpoint refinement only where the record changes, and a file-locked pacing gate shared by every process (IDENTIFY_RATE requests per second).
- Mixcloud: the plain file format crawls from a server (151 s for a two hour mix); the HLS copy downloads as parallel fragments. The finder now prefers m3u8 copies with eight concurrent fragments. `--download-sections` fails on the plain format and works on HLS.
- Separation speed, measured on the demo record through the demucs API (4 threads): htdemucs with shifts=1 (the CLI default) 79 s, shifts=0 56 s, shifts=0 with overlap 0.1 48 s; mdx_extra_q 140 to 190 s, so the quantized model is not a CPU shortcut. The worker now runs `--shifts 0 --overlap 0.15`; SEPARATE_FAST=0 restores the defaults. Every job result now carries stage timings (fetched, identified, analyzed, fingerprinted, previewSeparated, previewReady, separated, heard, uploaded) so the next speed round starts from numbers.
- Product surface: every analyzed record is named from its sound (the sheet says "Named from the sound", the breakdown ask carries IDENTIFIED); a record identified before is served from the shared cache from any copy or capture (record_cache.identity, migration 0006); "What is playing?" captures ten seconds of a tab and names it with cover art and a Pull it in button; mix candidates in the finder get a Tracklist button; a tracklist lists each record with its timestamp, pitch move and a Pull it button; the producer answers "what is this" (action identify) and "what's in this mix" (action tracklist) and pulls an entry by its ready query.
- Throttle, measured properly (2026-09-07 04:00 to 04:30, from the Mac's address): a burst of 20 requests at five per second is answered in 0.2 s each; from the 21st on, every request times out, one in twenty gets through, and the block outlasted seven minutes of one ping a minute. There is no rate a blocked address can trickle at to recover. So the worker never approaches it: a file-locked gate shared by every process allows IDENTIFY_RATE (0.5) per second and IDENTIFY_PER_MINUTE (12) in any sliding minute, and a tracklist is capped at IDENTIFY_MAX_CUTS (60).
- Tracklist cuts land where the audio says the record changed, not on a clock: a novelty curve (log-mel plus chroma, one frame a second, a 16 s checkerboard each side, peaks 40 s apart) tuned on six minutes of the KETTAMA Essential Mix found all six known changes within 20 s using nine boundaries, in 1.8 s. One cut per segment (three for a segment over four minutes), a second chance 20 s after every miss, one midpoint cut between two hits that disagree. Ten cuts for those six minutes; about 40 to 60 for a two hour set, the strongest boundaries first when there are more than the budget. Entries stream into the job every three cuts.
- Analysis on the worker: 82 s became about 20 s with the resample and harmonic changes, then the tempo pass moved to the middle 90 s of the record (the beat tracker's dynamic programme was the rest); the reported beat offset is now the grid phase, folded into one beat period.
- Recovery, measured: the blocked address answered again 15 minutes after the burst (12 pings a minute apart, the twelfth answered in 0.22 s); a steady request every 3 s then ran clean. Forked child processes under the live server hung on every recognition request (all 8 s timeouts while a single request from the server process answered in 0.75 s), so the cuts run on two threads; the pacing gate bounds throughput anyway. Three consecutive timeouts now start a ten minute cooldown in which identify returns nothing at once and the sheet and the producer say so.
- Live proof on the worker (2026-09-07 04:52): the six minute mix uploaded, read in 31 s end to end (fetch 0.5 s, ten cuts in 29 s under the gate), six records streamed into the sheet: Jamie Antonelli "Divine", Lane 8 and Anderholm "Bluebird", the Four Tet remix of "Pax" at +1.0 percent across three cuts, Gigi D'Agostino "Bla Bla Bla" at +1.5 percent, Dr. Alban "Let The Beat Go On" at -0.6 percent, Gigi D'Agostino "Elisir" at +3.8 percent. A slice rewrite had deleted the module's cut, parse and file helpers on the previous deploy ("name '_cut' is not defined"); restored, and the lesson is to list the module's functions after any slice rewrite.
- The limit itself, measured after recovery: a request every 3 s ran 30 times clean (0.18 to 0.31 s each); at a 0.5 s gap the 21st and 22nd requests timed out, the next two crawled (7 s, 1.2 s) and then it answered again. So the service allows about 20 requests per ten seconds; going slightly over costs seconds, hammering through the block costs fifteen minutes. The gate's defaults (one every 2 s, twelve a minute) sit well under it.
- Gates on production (2026-09-07 05:1x, producer-udfy6xybh + worker fcc26e91): upload named from its sound and served by the identity cache in 8 s, the identify route in 1.2 s, kick used and saved to the cloud project, finder 1.3 s for 16 candidates, by-name record from the link cache in 4 s, the six minute mix read as a tracklist in 26 s with six records and their pitch moves, YouTube refused in one line, test user removed. The brain-dependent steps (breakdown, slice by voice, rendered vocal) still wait on the empty Anthropic key.
- The two hour Essential Mix, by name, through the screen on production (2026-09-07 06:2x-06:4x): first run named 9 records to minute 32 and then hit the ten minute cooldown after four timeouts, and the screen said nothing about it. With the graded backoff (a slow answer holds 10 s, a timeout holds 30 s and retries once, six timeouts inside three minutes are the real block) the second run read the whole set: fetch 26 s over HLS, first entries on screen at 64 s, 93 cuts over 42 audio boundaries, 23 named, 20 entries from Chloé Robinson's "Pax" at 1:05 to KETTAMA's "Samba Soccer 2001" at 95:40, done in 8 minutes 11 seconds with no cooldown. A partial read now says how far it got and Keep going resumes from there. The same mix asked for again by link came back from the mix cache in 3 s.

## 2026-09-13 night: V11, the one-control stage and the two-lane brain (Brady's 30-minute brief)

The brief and its reading: docs/MASTERPROMPT_V11.md. The store contract: docs/DNA_SPEC.md.

### Shipped locally (commit "V11 stage: one control...")
- The front rebuilt: landing (New project / Existing project), then the stage: black, the edge glow (pink while it listens, violet while it thinks, green while it speaks), the record visible and untouchable, the conversation in large type, work cards, one Speak button. Fourteen components, two hooks and the browser TTS file deleted.
- Push to talk with the realtime engine in manual-commit mode: the release sends the commit, so the end of the sentence is known the moment the finger lifts. Web Speech falls back with stop() on release. The producer's voice streams as PCM straight into Web Audio, sentence by sentence, with the music ducked under it.
- The two-lane brain: the Voice (Haiku 4.5, streamed) answers within a second and hands the Hands (the full contract on Sonnet, Opus for blueprints) a precise task, starts research, or plays an audition. Research drops a name down the Galton board (store tables plus data/galton.json) with a one-search web fallback and a cache.
- The meter: every brain call priced at list on the client, the record's running cost on the stage.
- Feel: valence, arousal, tension, warmth and his words, on every render and reference, in both lanes' context.

### Gates
- tsc clean, next build green, 61 unit tests green, e2e ALL PASSED on the local build: greeting, voice first sentence 1198 ms from the typed ask (route 1731 ms), hands ops on Sonnet (transpose, drive, cutoff, goto drop), status 126 BPM -9.4 LUFS, cost $0.02 for the move. Screenshots at 1440 and 390 looked at: no clipping, no text under 12 px, no emoji.

### Traps
- A hydration mismatch (window.location read in a useState initializer) threw React #418 and silently stopped the harness boot; the old page had the same bug hidden by a later click.
- The Supabase project had paused itself (free tier); accounts on the live site were dead until it was restored through the management API.

### Later the same night: deployed, then the store, the grooves, the hits, the free voice
- V11 is LIVE on both aliases (deployments producer-ovf9u59ia then producer-7momkpr6a). `vercel --prod` needs `--archive=tgz` and .vercelignore now that data/dna/raw holds 17k MIDI files.
- The real push-to-talk path, proven with an injected spoken WAV (tests/speak.e2e.mjs): hold, release, the realtime engine commits 204 ms after release with the interim already on screen. The Voice route then reported the house key honestly: the Anthropic balance ran dry after a handful of harness turns, and every key on this machine sits in the same organization. Live brain calls wait on a top-up; the stage says so in a banner and a spoken line; the five dollar governor is in (past the target, everyday moves go to the fast model with one spoken notice).
- The store (agent dna-ingest, docs/DNA_SPEC.md): Billboard 32,745 songs, Spotify 114k, Chordonomicon 680k, Lakh 17k MIDI, Groove MIDI, McGill, the 500 library tracks -> songs.parquet 73 MB, artists, buckets, patterns, data/galton.json 411 KB (1,982 compact bins with index tables), humanize.json, hits.json. The research lane answers a genre from the bins in the repo with no model: "afro house and rap" -> the 122-132 electronic bins (2,711 minor, 2,851 major songs, tempo p50 126) plus the hip hop and world bins with exemplars.
- Human grooves: Groove MIDI's real drummers compiled into 14 groove-pool templates (human-funk, -rock, -hiphop, -dance, -afrobeat, -latin, -jazz, ...). Relative to the downbeat the off 16ths land 8 to 18 ms late and the backbeat is the loudest hit. Registered in the contract.
- Why hits work, measured (knowledge/skills/hits.md, loaded on hit/viral/chart/banger asks): number ones are happier (valence 0.67 vs 0.52), more danceable (0.63 vs 0.60) and less loud (energy 0.60 vs 0.70) than the rest of the chart; first chorus at bar 20 at the median; 8 chords at the median; the opening progression of number ones by decade.
- The free voice: kokoro-js (Apache weights) is the fallback when no ElevenLabs key is set, loaded lazily (the page bundle stays at 132 kB); the browser voice is the last resort.
- A color-token collision (text-base = the size scale and the color named base) painted older ribbon lines black on black; the color token is now `stage`.
- The data agent's final numbers: songs.parquet 820,668 rows across seven sources with nothing skipped (Billboard 32,745 songs, Spotify 89,741 tracks, Chordonomicon 679,807, Lakh 16,985 MIDI, McGill 890, the library 500; Groove MIDI into humanize.json); joins Billboard x Spotify 4,579, x Chordonomicon 1,003, x McGill 729, x Lakh 5,842; 2,737 bins, 1,982 shipped in galton.json (401.8 KB); patterns 646,930 rows; two fixes beyond the spec (Unicode-safe normalization, suffixed ids for genuine duplicates). The Supabase free tier holds songs, artists and buckets (patterns stay in parquet); the loader now commits per table after a mid-copy disk-full.
- 00:25: the store is loaded and correct on Supabase: 820,668 songs, 39,802 artists (the performer fold applied: Elvis Presley 7 number ones, 108 charted), 2,737 bins, trigram indexes rebuilt, 380 MB. Two reload traps on the free tier, both fixed in the loader: a truncate-and-copy in one transaction runs out of disk, and one 820k-row COPY into an indexed table exceeds the pooled connection's statement timeout; the loader now drops the trigram indexes, copies in 50k-row committed chunks, and rebuilds them (about six minutes end to end). The deployed research lane answers Elvis, a named record and a genre from the live store.

## 2026-09-14 early hours: "continue, think big" (no model credit; everything that needed none)
- The ritual proven end to end on a harness-only mock brain (lib/brain/mock.ts, PRODUCER_MOCK=1 plus ?mock=1, never on Vercel): landing by voice, greeting, "Elvis Presley" researched from the real store while the producer keeps asking, "build me a groove" landed by the Hands, "let me hear it" runs an announced audition with the transport playing, a press cuts it and pauses the record, a second audition runs to the end and asks "In or out?", "make the bass darker" lands ops with a report. Zero exceptions. Lesson: "play it" is an instant transport intent (resume); auditions are asked for with "let me hear it".
- The Voice speaks its first clause (a comma after four words) before the sentence closes. Measured: the speech engine's first byte in 160 to 250 ms, the commit in 204 ms, so the first audible word sits near 0.9 s once a model with credit answers.
- The free voice proven: the npm package does not bundle for the browser; the CDN web build imported at runtime does. WebGPU load 64 s once (browser-cached), then a 29-character line in 760 ms for 1.9 s of audio. Pre-warmed on the landing when no paid key is set.
- The store rebuilt dance-first (house, techno, trance, garage, dnb, dubstep, hardstyle, disco): 3,207 bins; "tech house" now lands in a house bin at 125 with Calvin Harris and James Hype beside it.
- The dance canon: migration 0009, tools/dna/canon.py runs the worker's tracklist jobs on ten Essential Mixes and Boiler Rooms; 148 records from five mixes within the hour (KETTAMA 20, John Summit 50, Chris Lake 22, FISHER 52, Dom Dolla 4), the rest still crawling. Research now says who plays an artist and what a DJ plays, with timestamps.
- The heard feed: every finished stems job leaves a dna_heard row (migration 0010, /api/dna/heard); rebuilds never touch it; research reads it.
- More questions to the store (tools/dna/hits_extra.py): number ones sit in C, Db, G and D major; they are less syncopated (0.119 vs 0.155) and their hooks move more (wave contour 28% vs 19%); chord vocabulary 6 vs 5; the first chorus drifted from bar 13 (1960s) to 22 (1980s) to 17 (2000s); disco took nearly half the number ones of the 1970s.
- Railway is logged out on this machine, so the worker cannot be redeployed from here; the heard feed went through the web side instead.

## 2026-09-14 02:05: AcousticBrainz lands, and why the shell was slow
- The wait was the pipe, not the machine: four dumps (4.2 GB) from data.metabrainz.org at one to four megabytes a second per connection, and the crawl of DJ mixes is paced by the recognition service at about twelve records a minute, one set at a time. Parsing was never the bottleneck: the two feature CSVs (30 million rows each) parse in 107 s, a million-record highlevel part in 95 to 116 s.
- Speed-ups that held: the parser split into cached stages so each file parses the moment it lands while the next downloads; eight plain range requests in parallel pull 5.8 to 7 MB/s where one stream gave 0.8 to 3.9; the whole post-parse chain runs detached and unattended (assemble, rollup, reload, discoveries, hits, skills, tests).
- The store now: 1,933,574 songs in parquet (1,112,906 unique AcousticBrainz recordings, every one with tempo and key, moods and danceability folded into valence, energy and the feel reads); 2,885 Galton bins in the repo (566.9 KB); 126,037 artists rolled up, 68,499 in Postgres (a named source, or five or more recordings); 5,567 buckets; 95 discoveries; the database at 414 MB of the free tier's 500. Burial, Four Tet and a hundred thousand other names the charts never carried now resolve.
- The canon crawl kept going in the background: 879 records across 34 mixes (from 215 across 7).

### Traps
- pandas 3 nullable dtypes: one fragment with Int64 or an NA-flavored string column turns the whole concat nullable and `.astype(int)` on a comparison dies on NA. The rollup flattens dtypes after the concat now.
- Whole floats into smallint: once year carries a gap the column is float and COPY sends "1990.0"; the loader writes integral floats as integers.
- `curl -C - -r a-b` appends on every retry (a 982 MB file became 6.4 GB of junk and cost 25 minutes); segmented downloads use plain ranges and a retry deletes first.
- The harness kills every background task when memory gets tight; the heavy chain runs under nohup and a tail monitor reports its stages.
- 02:27 deployed (producer-lvau2a0lk). Live: "burial", a name only AcousticBrainz carries, answers with 47 songs, tempo 128, keys Bb F A; "four tet" answers in 563 ms with the DJs who played him. Deploy trap: the CLI's archive took data/dna despite .vercelignore (5.5 GB, then an Internal Server Error from Vercel), and the prebuilt route trips on a traced path; `npm run deploy` now moves the raw store aside for the archive step and brings it back.
- Open for the next round: AcousticBrainz moods and danceability are classifier probabilities on their own scale; calibrate them to the Spotify scale on the shared recordings before cross-source medians are quoted as one number.

## 2026-09-14 evening: every song its own address (masterprompt section 12)
- Brady asked whether each song is understood and sorted uniquely. The honest morning read: the board was coarse (no bin with every pin known, family on 4% of songs, the largest bin 67,407 songs). This round fixed the shortfalls with what was already on disk plus one new public input.
- The fingerprint: all eighteen AcousticBrainz classifiers (71 probabilities), the tempo histogram peaks, onset rate, tuning, key and mode, 67 features standardised and projected to 32 dimensions (88.7% of the variance) as int8. 1,112,906 prints, 93 MB of flat binaries under data/prints, read once by the research function; nearest by sound is a brute-force scan answered in tens of milliseconds. Duplicate rate 0.31% (target under 1%). Proof that distance means sound: a record's ten nearest neighbours (other artists) carry its family 38.8% of the time against a 9.6% base rate. The DJ-played test is underpowered, 79 canon records have prints, and stays open.
- The board: eleven pins, the seven every audio-measured song can answer first (tempo band, mode, energy band, feel quadrant, decade, family, voice). 14,601 level-seven bins with every universal pin known hold 772,469 songs (40% of the store); before, no bin had all its pins known. Songs with three or more unknown universal pins fell to 37.8% (the chord-sheet rows). Median songs per full universal bin 9. Shipped subset 9,754 bins (2.5 MB), deep bins only when a sparse pin is known.
- Family: MusicBrainz's own artist genres (2,982,951 artists in the CC0 JSON dump, 199,936 with a family) joined on the artist gid AcousticBrainz carries, then by unambiguous name, then the artist's known family from any source: 3.8% to 45.2% to 48.0% of 1,933,574 songs. The AcousticBrainz genre models were measured and rejected: 18% precision for electronic against Spotify's labels.
- Calibration: on the 10,224 recordings AcousticBrainz and Spotify share, a linear map from the seven moods, danceability, voice, timbre and log tempo to each Spotify measure, applied to every AcousticBrainz row: energy R2 0.56, valence 0.19, danceability 0.25 (data/dna/calibration.json). Energy is now one scale across sources; valence and danceability are shrunk toward the mean, which is what a weak fit should do.
- The research lane: "sounds like X" looks X up and answers with X's address and what sits beside it by sound; energy, feel and voice words become pins ("peak time", "euphoric", "instrumental"). The discovery engine now reports 202 findings (95 before) because 48% of songs carry a family.
- Postgres: migration 0011 (voice, artist gid, the three pins on buckets); artists 68,499, buckets 23,009 levels deep; the prints never enter the database.

### Traps
- galton.json ballooned to 42,815 bins (7.8 MB) with eleven pins: the deep levels only repeated the level-seven bins with unknowns. Shipping rule: levels one to five at 20 songs, six and seven at 50, deeper only when a sparse pin is known.
- NaN is not JSON: a bin with no mode information wrote NaN into galton.json and broke the import; the writer now refuses NaN.
- Every new column needs its migration: the loader failed twice (voice on songs, the pins on buckets) before 0011 covered both.
- A calibration fit on the folded columns alone (R2 0.42) is weaker than one on the native mood reads (0.56); the rollup reads the fragment for the fit.

## 2026-09-15: condense the store (masterprompt section 13)
- Brady: the music is stored and takes too much data; condense it without losing functionality. Measured first, then cut each tier.

| Tier | Before | After | How |
|---|---|---|---|
| data/ on disk | 9.7 GB | 2.2 GB | raw dumps (5.5 GB, re-downloadable) archived to ~/Archives/producer-web-raw-dumps; caches and parquet condensed |
| parquet files (19) | 2,354 MB | 821 MB | one writer: float32, probabilities to three decimals (dictionary-encoded), recording ids as 16-byte binaries, zstd 9; every file verified row by row |
| fingerprints on disk | 98 MB | 59 MB | one sort order (artist key, title key) instead of two key tables, 9-byte meta, brotli; same 32 int8 dimensions, family agreement unchanged (38.1% vs 9.7% base) |
| Postgres | 608 MB (over the tier) | 296 MB | buckets out (the product reads bins from galton.json), songs down to the nineteen columns the lookups read, vacuum full |
| deploy upload | 484 MB | 56.5 MB | data/dna and tests/fixtures step aside for the archive step |

- Nothing the product does changed: 71 tests green on the new layout, re-assembly of the AcousticBrainz fragment from the condensed caches alone reproduces it exactly (ids and recording ids equal, tempo within float32 rounding).
- The parse caches are the source for re-assembly; the dumps are only needed to widen what a parser keeps, and the spec lists their URLs.

### Traps
- Migration 0012 dropped columns, and re-running the base DDL then tried to recreate an index on them; the stale index line left the base file (load_pg re-applies every migration on each load).
- pandas 3 reads strings as `str`, not `object`: a dtype check for the id conversion silently skipped the biggest file until the verifier caught it.
- The Vercel CLI archive still takes everything in the tree that the ignore file lists; the deploy script now moves it aside, which is the only rule that has held.

## 2026-09-15 evening: the agent loop, hardened (masterprompt section 14)
- Brady asked where the agentic side could still improve, then said execute. Honest correction first: two of the six I listed were already built (the verify loop's hidden corrective pass, research riding into every task). The other four are in, plus two strengthenings.
- One retry before an apology: every model route retries once on a transient failure after a jittered pause; the Hands' second try runs on the fast model; a streamed reply retries only while nothing has been spoken. Unit-tested (a hard failure such as no credit is never retried).
- The server-side ledger and the house allowance: `usage_events` gets a row per exchange from every model route with the list-price cost; `usage_today()` sums the house key's UTC day; a signed-in user is refused past five dollars a day on the house key and everyone past forty, with a spoken line, a banner, and `down: "cap"` on the wire. Own keys are never capped. Proven locally with the caps at zero: the Voice answers the allowance line and the model is never called; `/api/usage` reports the day.
- Taste that follows the account: `taste_moves` and `taste_pairs` under RLS mirror the local ledger; sign-in pulls the account's rows into the browser and pushes what the browser knew; the Voice sees the taste line as well as the Hands. Merge tested (a local verdict is kept, account rows dedupe by id).
- The corrective pass after a failed verify runs on the fast model; a task waits up to two seconds for research the Voice started; the Voice decision battery (`npm run battery`, forty utterances) skips itself when the brain is down and fails under 95% agreement otherwise.
- Ritual harness on the mock: all passed, zero exceptions. 76 unit tests green. The battery and the real-overload retry path wait for model credit.

### Traps
- The first ritual run after a build failed on the 40 s verdict wait while the machine was still busy; the rerun passed. Do not read a harness result taken during a build.
- `tests/e2e.mjs` needs the real brain; on a mock server it reports the credit line, which is not a regression.

## 2026-09-16: the surgeon (masterprompt section 15)
- Grab, no model: "grab the synth at 1:32" is a Voice control the studio answers itself. A drum word with no time takes the worker's one-shot (already tuned to the root); anything else is an onset-aligned slice from the matching stem clip of the record the studio heard, its root detected in the browser (a YIN over the loudest 200 ms, tested on 55 to 440 Hz tones), the clip transposed so the song's root plays it at pitch, one note on the root, active in the drops. The mock knows the words; the ritual harness has a ninth step and passes.
- Every heard record carries its DNA: the heard route now writes progression in roman numerals with its harmony class, kick, snare and hat grids, bass root and rhythm, structure codes from the energy blocks, energy, family from the CLAP genres and the top descriptors (migration 0014, a TypeScript port of the harmony rules with tests), and the research lane quotes them as "How it is built".
- The worker grew (built and proven locally; deploy waits for `railway login` on this Mac): `DEMUCS_MODEL=htdemucs_6s` for guitar and piano stems, a band-and-transient drum split into kick, snare, hat and percussion stems (`DRUM_PARTS=1`), a text embedding for prompts, notes from the harmonic stems with Basic Pitch when installed, and `POST /grab` that ranks a prompt against a record's stem and one-shot embeddings.
- Tests 78 of 78.
- The worker upgrade measured locally on a public eight-minute record (Mac, 10 cores): six stems (drums, bass, vocals, other, guitar, piano) in 148 s with `htdemucs_6s`, the drum split into kick, snare, hat and percussion stems in 11.2 s, one-shots with their fundamentals (a 62.6 Hz kick). On the worker's 48 CPUs that is well under a minute.
- The bet, measured: AudioSep (text-prompted separation) is not installable from PyPI (unsatisfiable requirements); it needs a repository clone and a checkpoint of about a gigabyte. Deferred, written down. What ships instead is grab by sound over nine parts: the prompt's CLAP embedding against the record's stem and one-shot embeddings (`POST /grab`), which covers "the synth", "that metallic perc", "the vocal chop".

### Traps
- Local demucs on a fresh torch needs torchcodec, and torchcodec needs FFmpeg's shared libraries on the loader path (`DYLD_LIBRARY_PATH=/opt/homebrew/lib`); the Railway image pins torch 2.5.1 and does not.
- A Vercel deploy answered "Not authorized" once with the account still signed in; the retry went through.

## 2026-09-16 evening: the surface, the library, the math (masterprompt section 16)
- Seen first, at 1440 and 390: the track field read as a developer view, section chips truncated to single letters on the phone, the "YOU" label clipped under the field, the boot greeting stacked on every load, the status line was a cramped run of numbers. Fixed and looked at again: a mark (a record, pink to green) instead of a stock icon, a caption over the arrangement that always reads in full ("Groove · bar 4 of 8 · then Build"), chips whose labels fit or step aside (measured by a ResizeObserver, never truncated), lanes in normal case with a colour dot, a transcript that fades at the top instead of cutting a line, status as three groups with pills, a slim one-line brain banner, the phone transcript given more room. The greeting no longer stacks. Audits at both widths: nothing tiny, nothing clipped.
- The library: every record the account made with tempo, key, lane, versions and when it moved; open, rename, duplicate, delete (inline, no dialog) and versions; reached from the landing, the stage header, or by voice ("open the library"). The account's earlier records (one, GLOW, three versions) were exported to ~/Archives/producer-web-records-2026-09-16.json and deleted, so it starts clean.
- Genres past the family map: 1,412 MusicBrainz genres with three or more artists in the store (forest psytrance, rawstyle, amapiano, footwork, witch house, lăutărească) as `dna_genres` with artists, songs, tempo median, family and exemplars; the research lane answers any of them and points the bins by their family. Four more AcousticBrainz parts are downloading for the fingerprints.
- The math of music: a pattern engine (Bjorklund's Euclidean rhythms, rotation, density, polymeter, named claves, contours, the golden section, degrees to MIDI) with tests and an `euclid` op the Hands can emit; chord transition tables learned from 680,784 progressions per family (what follows I in house: V 25%, v 12%, ii 11%); a math skill that explains a beat in one sentence ("E(7,16) rotated by 2").
- Tests 80 of 80; ritual harness all passed on the rebuilt mock.

### Traps
- A relative output path inside a script that changes directory wrote a 1.9 GB download into its own temp folder, which the script then removed; absolute paths only in the segmented downloader.
- The Bresenham form of Euclid gives a rotation of the canonical pattern (gaps 3,2,3 for E(3,8)); Bjorklund's pairing form gives the tresillo people expect. The test caught it.
- The safety hook blocks any command whose text contains the recursive-delete-from-root pattern, even as a glob under a temp folder; clean temp folders another way.
- The ui review (a read-only reviewer agent, one of the few agents this build has used) returned PASS with no vibe-code signatures: a hand-drawn icon set, a real type scale, a purposeful palette, specific motion, reduced-motion support. Its three responsive findings (chips truncating at 390, a cramped status line, the clipped transcript label) were the ones already fixed in this round; it confirmed the repeated greeting was state, not layout, which the boot fix closes.
- Fingerprints doubled: six AcousticBrainz parts (5,918,530 named recordings) fold to 2,277,606 unique recordings, 122 MB on disk, duplicate rate 0.93%, family agreement at ten neighbours 40.2% against a 4.8% base (eight times chance), and the DJ-played neighbour rate is now fifteen times chance on 119 canon records. The assembly counts archived caches as parts, so the dumps stay out of the tree.

## 2026-09-16 night: flow (masterprompt section 17)
- Measured from what the store already held, no download: the section grammar over 399,227 structures (records open on an intro 66% of the time; after a verse the chorus comes 84%; after a chorus a verse 48%, a bridge 17%, the outro 16%; the first chorus or drop lands at bar 16, middle half 10 to 24; 46% of records carry two peaks); the turnarounds over 334,015 choruses (major choruses open on I 35%, IV 26%, V 19% and close on I 49%, V 29%; minor open on i, bIII, bVI and close on bIII, i, bVII, bVI in near-equal shares); the energy arcs over the 500 library records (a build rises 0.054 of the peak per 8 bars; the break falls 0.215 of the peak; the second peak returns to 0.97 of the first; a boundary moves 0.05 and reads as a cut above 0.13; a full gap before the drop is rare, 0.2%); the DJ transitions over 1,126 consecutive records in 43 distinct mixes (pitch bend 0.3%, tempo delta 3.6 BPM; key relationships measured on 29 known pairs, thin, and said so).
- In the product: a flow skill the Hands read on arrangement, transition, build, drop, break, blend and mash asks; a FLOW CHECK on every exchange that names a 4-bar build, a second drop set louder than the first, a shallow break, or a boundary that jumps like a cut, each against the store's range; a `transition` op that leans a section into the next (a filter rise or dip over the last bars, a gap that leaves only the kick for the final bar, an energy nudge); the research lane answers "how does a house record flow" with the numbers, no model.
- Tests 83 of 83.

### Traps
- Three named mixes (Conducta, Overmono, Kaytranada) resolved to one file in the finder; the flow measurements dedupe mixes by source, and the canon needs a re-crawl of those three by URL.
- The canon's play-length figure is not a play length: the recognition cuts land every 20 s, so consecutive entries are often the same record. It is left out of the skill.
- The first version of the flow check flagged a rise into a build and a fall into a break; those are the form, not faults. The rules now exempt them and the test pins it.
- Deploy trap, new: anything the app imports at build time must live outside data/dna, because the deploy script moves data/dna aside for the archive. The flow artifact moved to data/flow.json beside galton.json; the first deploy of the round failed on Vercel's build for exactly that reason and the second went through. Live: "how does a house record flow" answers with the house grammar (320 structures, opens on an intro 72%, first peak at bar 18, 66% carry two peaks) in 2.9 s cold.

## 2026-09-17: the instrument itself (masterprompt section 19)
- Brady: finish the music tests, then work out why the music glitches when it runs, because storing it is not architected right; make sure every record is stored accurately; replace the coloured boxes with what real music software shows; nothing clickable but the voice box; process in real time and take a voice off a record online, landing it right before the drop; and say how the store goes further.
- The tests first: 83 unit, the whole song battery eleven of eleven against the real brain, the audibility probe hearing the record. The audibility probe itself had a bug, which is why it had never run: it launched Chrome without its own profile, so with Chrome already open the launch handed off and no debug port ever appeared.
- Then the glitch was measured rather than guessed at. A new counter in the engine (note events, late events, the thinnest scheduling margin, rigs alive on the transport, the cost of a move) and `npm run glitch`, which plays a record untouched, then makes ten ordinary moves, then reproduces the open-a-record path.

### What was wrong, in the numbers
| | before | after |
|---|---|---|
| late note events over ten moves | 126 | 1 to 5 |
| worst main thread block during a move | 5,875 ms | 133 to 150 ms |
| mean cost of one move | 147 ms | 31 ms |
| rigs alive after opening a record and starting | 3 (a leak) | 1 |
| offline contexts per listen | 8 | 1 |

- A change tore down the whole studio and built it again. Now the desk and the voices live in a rig that survives: volume, pan, cutoff, resonance, reverb, delay, drive, crush and width ramp in place, only a real change of instrument builds a new voice, and it crosses over in fifteen milliseconds. Parts are content addressed, so a track whose hits have not changed keeps the schedule it already had.
- Opening a record before the session started left a second rig alive on the transport, playing the record underneath itself forever. A load now only remembers the record; starting tears down anything a load built.
- Listening to itself was the rest. The profiler named it: eight offline contexts per listen cost far more than the audio in them. One render now, every distinct section a couple of bars, sections that sound the same rendered once, the measuring in a worker, debounced and latest wins, and the leveler no longer asks to be re-heard after its own gain move.

### The board
- The field was coloured boxes. It is a console painted on a canvas outside React sixty times a second: bar and beat, the arrangement shaded by its energy with the energy the ears measured drawn over it and the drop marked, a ruler with every beat and its sixteenths, and per track a decibel meter with a peak hold beside the hits of the bar you are in, placed where they will actually fire, tall as their velocity, pitched where they will sound. Underneath, left and right in dBFS against a scale, peak, three second RMS, the integrated loudness, and the spectrum on a log axis. Dropouts sit in the corner.
- The stage has no buttons. The library, a new record and the account answer to the voice.

### Storing the music
- A record was its song document, and the audio that document names lived only in the browser that made it. Every clip now has a row in the account keyed by the name the song carries; opening a record fetches back what this machine has never seen; bytes already in storage are recorded, not copied again; what cannot be found is named rather than played as silence.
- Two records called Untitled overwrote each other, because the library was keyed by title. A record has its own identity now. A full browser store threw into an empty catch, which is how an evening disappears without anyone being told; the write is checked and the screen says so.

### The voice off a record
- The worker already separates the vocals. What was missing was everything after: the phrases inside the isolated voice, scored the way a producer picks a hook, the one asked for cut where it was measured (not hunted for a transient, which lands on the wrong syllable), its root read, tuned into the key when that move is small enough to leave it sounding like a voice and said plainly when it is not, and placed so its last word lands on the downbeat, with the build leaning out first so the phrase arrives in room made for it.
- Proven on a record: `npm run vocal` builds a vocal stem with three phrases in a real browser, hands it to the studio, and checks where the phrase ended up. It takes the loud two and a half second hook over the quiet aside and the short tag, reads it as D, leaves it alone in D minor, and lands it at beat 26.94 to 32.00 of a thirty two beat build.
- The placement is learned, not fixed: every record the studio isolates a voice from posts its phrases, the row records how long before that record's own drop the last word finished, and the rule reads the median for the family once eight records agree. Until then it lands on the downbeat and says so.

### Traps
- The audibility, glitch and vocal probes each need their own Chrome profile, or an open Chrome takes the launch.
- `next build` while `next start` is serving `.next` breaks the running server: stop, build, start.
- Tone renders offline cooperatively, yielding between chunks. That is why the listen costs wall time and almost no CPU, and why the fix was fewer renders rather than faster ones.
- A `speak-ring` that pulses with a transform widens its ancestors' scroll width; as a box shadow it cannot.
- A canvas sized from its own box still pushes the page wider unless it is taken out of the flow; absolute inset zero, and `min-w-0` on every flex and grid parent.
- The transition that makes room for a vocal is applied before the vocal is active, or the phrase is ducked by its own gap.
- The Vercel deploy answered "Not authorized" once again; the retry went through, as the last round recorded.

## 2026-09-18: everything through the website (masterprompt section 20)
- Brady: Railway is logged in, but everything should run through the website, nothing else, and the system should agentically have the tools to execute.
- Two things were true and neither was visible. The worker had been running the four stem model since the seventh round, because that deploy never happened; and its health endpoint had the model name typed into it as a literal, so it answered "htdemucs" whatever it was loading. It is on `htdemucs_6s` now, a finished job comes back with drums, bass, vocals, other, guitar and piano plus the drums split again into kick, snare, hat and percussion, and `/health` reports what it actually loads.
- One record had ever been through the studio's own ears. The store knew what a hundred thousand records ARE and what almost none of them SOUND like, because hearing one meant running a script on a laptop with a worker virtualenv and a library path set. That script also held a second copy of the rules that turn a hearing into a stored row, in Python, which would have drifted from the route's copy the first time either changed.
- The learning lane is in the website now. The producer holds the control: "go learn the biggest house records of 2019" picks famous records the studio has never heard from the charts, hands each to the same worker one of ours goes through, keeps the DNA and no audio, reports as it goes because it takes minutes, and says what came back. The conversion is one function shared by the lane a person drives and the lane the producer drives. The local queue is deleted.
- What the chart already knows wins over what a classifier guesses: the ears had called a UK Dance number one dubstep. The family and the year ride through on the job and beat the guess.
- The asking is what is remembered, not the answer. A chart prints "Haven featuring Kaitlin Aragon" and the ears give the record back as "HAVEN. & Kaitlin Aragon", so matching heard rows against charts by name never matched and the lane kept re-picking records it already knew. A record that cannot be found twice is now left alone.

### Measured
| | before | after |
|---|---|---|
| stems from one job | 4 | 10 (six parts, drums split four ways) |
| records heard with the studio's own ears | 1 | 11 |
| families read from the chart rather than guessed | 0 | all of them |
| implementations of the heard-row rules | 2 (TypeScript and Python) | 1 |

- Eleven carry a chord progression, nine carry drum grids. A cache hit by identity costs about ten seconds; a record heard from scratch about sixty.

### Traps
- `railway up` restarts the worker, which kills whatever it was separating. Do not deploy the worker while a learning run is in flight.
- Node buffers a background script's stdout when it is not a terminal: use `stdbuf -oL` or the log stays empty and looks hung.
- The store's corpus build (`run_all.py`, the rollups, the prints) is a build of a dataset, not something the product does while someone is in the room. It stays a tool, and that is said in the spec rather than left to be discovered.

## 2026-09-22: before smooth (MASTERPROMPT_SMOOTH phase 0)
- The numbers the smooth build is measured against, on branch `smooth` at c7046a1, a fresh `next build`, served on 3111 with the mock brain and no house key (`ANTHROPIC_API_KEY= PRODUCER_MOCK=1 next start -p 3111`), so nothing a harness does can spend on a model.
- The audibility probe gained the one number it lacked: a page-side poll of the master meter every 4 ms from before the page exists, keeping the page time of the first read above -60 dB. Page time counts from the start of the navigation on a fresh Chrome profile, so that is the cold load; the stage now marks `producer:boot` when the session starts, which is the press. It also asks with `mock=1`, which only a mock server honours.

### Measured
| | run 1 | run 2 |
|---|---|---|
| late note events, untouched 8 s | 4 | 7 |
| late note events, ten moves | 2 | 1 |
| thinnest scheduling margin | -245.4 ms | -291.8 ms |
| longest main-thread block, untouched 8 s | 444 ms | 448 ms |
| longest main-thread block, ten moves | 120 ms | 114 ms |
| rebuild cost of one move | max 107 ms, mean 30 ms | max 101 ms, mean 30 ms |
| the listen: one render | 10,828 ms (measure 672 ms, off the thread) | 9,982 ms (measure 630 ms) |
| graphs alive: before, after load, after start, after stop | 1, 1, 2, 1 | 1, 1, 2, 1 |
| verdict | GLITCHY: 6 late events, leak no | GLITCHY: 8 late events, leak no |

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| cold load to first audible sound | 748 ms | 686 ms | 845 ms |
| press to first audible sound | 463 ms | 415 ms | 492 ms |
| master peak over 3 s | -3.7 dB | -3.6 dB | -5.4 dB |
| verdict | AUDIBLE | AUDIBLE | AUDIBLE |

- Raw, run 1: `[glitch] untouched 8 s: events 38, late 4, thinnest margin -245.4 ms, graphs alive 1, long tasks 8 (max 444 ms, total 1182 ms)`; `[glitch] ten moves: events 119, late 2, thinnest margin -245.4 ms, graphs alive 1, long tasks 23 (max 120 ms, total 1865 ms), rebuilds 10 (max 107 ms, mean 30 ms)`; `[glitch] open-then-start: graphs alive before 1, after load 1, after start 2, after stop 1`; `[audible] cold load to first audible sound: 748 ms (navigation start to the first master read above -60 dB, -1.9 dB)`; `[audible] press to first audible sound: 463 ms (the stage started at 285 ms)`.
- Where the blocks come from, read off a profile of the ten moves (a scratch probe, not committed): the two tempo moves re-lay every part (`update > lay > apply > add`, 122 ms and 105 ms), because every part's content address carries the tempo; everything else over 50 ms is the listen, which renders on the main thread in one-second slices of audio (`_renderClock > emit > _loop > forEachTickBetween > ... triggerAttack`, 98 to 162 ms each) after building its offline rig in one piece (315 ms, `apply > build`, the worklet URLs and the oscillators' inverse FFTs). The first listen starts 2.5 s after the press and runs about ten seconds, so it lands on top of the first bars and on top of the moves.
- The cold load already sits under the 2.0 s target on this machine with a local server; the press alone is about half a second.

## 2026-09-23: smooth phase 1, the record no longer stutters
- Same bench as the before entry: a fresh `next build` on branch `smooth`, served on 3111 with the mock brain and no house key. This Mac was shared with other tabs' builds, so every run carries its load average.
- The seven edges: kit and clips warm before the press (`warmFor`), a latest-wins ticket on `Engine.update` (`Latest` in `lib/engine/steady.ts`), a shortened record wraps to the same place in a bar (`wrapToBar`), a 40 ms master fade before teardown, auditions through the master chain with a 5 ms attack, the talk-duck on a music bus instead of the destination, and each riser with its own synth.
- What the edges did not reach, and what fixed it:
  - A tempo move re-laid every part, because the drum hits' content address carried the tempo. The hits are addressed without it now (`hitsAddress`), and note length reads the transport's tempo at the event. Rebuild max 101 to 107 ms went to 42 to 47 ms.
  - The listen built its offline rig in one block and let Tone's offline clock run a second of audio per slice. It now builds one voice per step and gives the thread back after 6 ms of work (`renderInSteps` in `lib/engine/offline.ts`), with the offline context global only inside a single synchronous step, so no live node can land in the offline graph. Tone.Offline is no longer used.
  - The root of every block that was left: standardized-audio-context walks every downstream path looking for a cycle on each new connect and stops only at a DelayNode, and every note start is a new connect. One connect into a voice's gate cost 7.1 to 11.9 ms. A zero-delay wall between the gate and the insert chain stops the walk: the same connect now measures 0.00 to 0.10 ms on every voice.
- The Tone warning about scheduling inside callbacks is Tone's own PolySynth making a voice inside a note callback. It is harmless for timing and stays.

### Measured
| | run 1 | run 2 | run 3 |
|---|---|---|---|
| load average | 9.27 | 13.24 | 18.07 |
| late note events, untouched 8 s | 0 | 0 | 0 |
| late note events, ten moves | 0 | 0 | 0 |
| thinnest scheduling margin | 21.7 ms | 30.7 ms | 30.3 ms |
| longest main-thread block, untouched 8 s | 50 ms | 56 ms | 0 ms |
| longest main-thread block, ten moves | 0 ms | 0 ms | 0 ms |
| rebuild cost of one move | max 43 ms, mean 11 ms | max 47 ms, mean 13 ms | max 44 ms, mean 11 ms |
| graphs alive: before, after load, after start, after stop | 1, 1, 2, 1 | 1, 1, 2, 1 | 1, 1, 2, 1 |
| verdict | CLEAN | CLEAN | CLEAN |

- Audible at load 18.41: `[audible] cold load to first audible sound: 791 ms`, `[audible] press to first audible sound: 474 ms (the stage started at 316 ms)`, master peak -7.6 dB (the meter now sees the talk-duck, which used to sit after it), `[audible] AUDIBLE: the record is making sound`.
- Against the before entry: late events 6 and 8 to 0, 0 and 0; the ten-move block 114 to 120 ms to none at all; the untouched block 444 to 448 ms to 56 ms at worst.

## 2026-09-23: smooth phase 2, the first minute
- The kit, the seed's clips and the voice route warm while the landing is up (`warmFor` and a speechless `GET /api/speak` on mount), so the press has nothing left to render.
- The greeting goes first and the record joins underneath it. `boot()` speaks before it starts the engine, and the transport waits for the first word (`producer:voice`, marked by the voice when its first sound is scheduled) or 0.8 s at most, so a cold voice never holds the music past two seconds.
- The first listen no longer waits 2.5 s. The listen gives the thread back every 6 ms of work since phase 1, so it starts on the ordinary 500 ms settle, and glitch's untouched window proves it costs the first bars nothing.
- The producer takes initiative after six quiet minutes, not two. The producer we watched worked through six minutes of talk with the loop running.
- tests/audible.mjs asserts the order: `[audible] greeting before transport: yes|NO (first word, transport)`. A late greeting fails the probe with `GREETING LATE`, and it is no longer reported as SILENT.

### Measured
| | load average | cold load to first sound | press to first sound | first word | transport | verdict |
|---|---|---|---|---|---|---|
| warm server, run 1 | 8.71 | 887 ms | 543 ms | 514 ms | 767 ms | greeting first, AUDIBLE |
| warm server, run 2 | 10.58 | 817 ms | 528 ms | 448 ms | 699 ms | greeting first, AUDIBLE |
| warm server, run 3 | 23.88 | 1071 ms | 570 ms | 666 ms | 953 ms | greeting first, AUDIBLE |
| first press after a server restart | 8.09 | 1520 ms | 1213 ms | 1775 ms | 1353 ms | GREETING LATE, AUDIBLE |
| first press after a server restart | 10.66 | 1544 ms | 1203 ms | 1853 ms | 1380 ms | GREETING LATE, AUDIBLE |

- Glitch after phase 2, three runs at load 8.56 / 13.69 / 16.59: late events 0 / 0 / 0 untouched and 0 / 0 / 0 across ten moves; longest ten-move block 0 / 0 / 50 ms; graphs alive 1, 1, 2, 1; CLEAN, CLEAN, CLEAN.
- Screens at 390 and 1440 (landing, stage idle and live, library) render with no overflow and nothing clipped.
- Open: the very first press after a server restart has the greeting about 0.45 s behind the record. `/api/speak` itself answers cold in 235 ms (warm 160 ms), and warming its key lookup on mount did not move it. The harness starts the stage the moment the page loads, so nothing gets a landing dwell, and the page's first requests to a cold local server queue ahead of the voice. A real press comes after the landing has been up, which is when the warm-ups run. Next measure: the voice request's queue time in the first run, before calling this closed.

## 2026-09-23: smooth phase 3, the order of work as real ops
- Six new ops, each a voice control, a brain action and a reducer (`lib/song/ritual.ts`, resolved in the browser by `hooks/useRitual.ts`, the way `slice` is): `source` sets the grid from a named record's tempo and key before anything exists (the records the studio's ears have heard, then the in-process prints, then the song table, through `/api/source`; every tempo and key carries a confidence, and a low one is said out loud), `chop` cuts a phrase off the record's vocal on its own beat grid to one, two or four whole bars (`phraseOnGrid` and `cutGridPhrase` in `lib/engine/slice.ts`) and loops exactly those bars, `alone` solos it for the sing back, `beat` builds drums and bass at the source tempo and refuses when there is no source, `next` swaps the seed to the next ranked candidate (the heard record's other lines, then the finder's records in `useStems.candidates`) without stopping the loop, and `down` pulls every fader but the seed's 10 dB on the rig (fader ramps, no rebuild, nothing saved) until the next word.
- "Pull it down" used to nudge the master 2 dB; it and "next one" are instant local moves now.
- The patience watch (`lib/ritual/patience.ts`): a verdict prompt at the first pass of the loop after 8 s and never later than 20 s, so the answer can still land inside the 30 s window; a swap offered after three passes with no verdict, and never before the window is over. A pass is one trip of the transport around its loop region, counted from Tone's `loop` event (`lib/ritual/passes.ts`); the trip an element lands in counts only if it landed in the first half of it.
- The worker counts tempo the way the local ears do (`tempo_from_drums` in `worker/analysis.py`, ported from `~/.dictation/producer/learning_read.py`): onset autocorrelation at hop 128, the lag with support at twice itself, a parabolic peak, octaves folded into 95 to 185, the beat phase (48 steps a beat on a 23 ms onset window), a confidence, and a refusal below 0.25. A folded octave names the octave it was read at and carries at most 0.55. After separation the drums stem is counted again and replaces the mix's read when it is at least as sure. Not deployed: the worker needs `railway up`.

### Measured
- `worker/tempo_check.py` (local venv, librosa 1.0.0): synthetic 128 (phase 0.110 -> 0.098), 124, 122.5 right to 0.1 BPM with the phase inside 25 ms; a hip hop pocket at 90 reads 180 folded from 90 and a drum and bass break reads 173.9 folded from 87.0, both capped at 0.55; silence and white noise refused; all 14 DJ-tagged fixtures within 1 BPM of their tags (confidence 0.42 to 0.83), the two Anyma records at 172.
- `tests/ritual.e2e.mjs` session 2, load 66: `[ritual] O1. source: Summer by Calvin Harris sits at 128. The grid is set. It is in G major. | song 128 BPM G major, transport 128 BPM, tempo confidence 0.75 from the store, tracks 0`; `[ritual] O5. verdict prompt 8.1 s after the beat landed (2 passes of the loop)`; `[ritual] O6. next: chop_ritualjob_7470 -> chop_ritualjob_14950`; `[ritual] O7. pull it down: faders {"chop":0,"kick":-2.5,"clap":-2,"hat":-4,"bass":0} -> {"chop":0,"kick":-12.5,"clap":-12,"hat":-14,"bass":-10}`; `[ritual] ALL PASSED`.
- Glitch after phase 3, three runs at load 102.54 / 103.89 / 112.91: late events 0 / 0 / 0 across ten moves, thinnest margin 15.9 / 15.9 / 17.0 ms, longest ten-move block 0 / 53 / 87 ms (the last two at a load six times the phase 1 bench), graphs alive 1, 1, 2, 1; CLEAN, CLEAN, CLEAN.

## 2026-09-23: smooth phase 5, the ledger learns from verdicts
- A move is judged by what is said in the thirty seconds after it lands. Every move that changes the record (a brain move, a chop, the beat, the next candidate) opens the patience watch from phase 3, and its window goes on the move in the taste ledger (`lib/taste.ts`): when it landed, when the judging words came and what they were, and liked, rejected or none. A window closes on a verdict, at thirty seconds, or early when a newer move lands and takes the room. Words after the window judge nothing; the old rule attached a verdict from the next sentence however late it came, and that line in `useStudio.send` is gone.
- Three passes of the loop with no verdict mark the idea dead (`markDead`), never inside its own thirty seconds, and the producer offers the next one. A pass is one trip of the transport around its loop region, counted from Tone's `loop` event, so a paused record makes no passes; the trip an element lands in counts only when it landed in the first half of it. Dead ideas print as DEAD in the taste summary the brain reads, and reach the account as the verdict "dead" (`lib/tasteSync.ts`); the window itself stays in this browser until `taste_moves` has a column for it.
- Verdict words (`judgeWords`): "I kinda like that" is a yes now, "I don't like that" is read as a no before the like in it, and "sounds like that record" is a reference, not a call.
- The scorecard line the brain reads says how its moves were judged: "judged N of M inside 30 s (median S s), K dead".
- Found on the way: a one bar chop set a one bar loop region, which `loopBounds` ignores (a region needs its end bar after its start bar), so the transport looped the whole eight bar section and a pass took fifteen seconds. The chop's loop region is two bars at the least now.

### Measured
- `tests/ritual.e2e.mjs` at load 56: `[ritual] O9. taste: chop "I'm making a chop" -> {"windowMs":30000,"words":"loop it alone","verdict":"none","closedBy":"next move"}`; `[ritual] O9. taste: next "next one" -> {"landedAt":1790152526030,"windowMs":30000,"saidAt":1790152532419,"words":"I kinda like that","verdict":"liked","closedBy":"verdict"}` (said 6.4 s after it landed); `[ritual] O10. silence over chop_ritualjob_1860: swap offered 30.9 s after it landed, 8 loop wraps; ledger {"window":{"verdict":"none","closedBy":"time"},"dead":{"passes":8},"verdict":null}`; `[ritual] ALL PASSED`.
- `tests/taste.test.mjs`: a scripted two bar loop at 128 with nobody talking goes prompt, close at 30 s, dead; a sixteen bar loop is not dead until its third pass at 87 s.
- Glitch after phase 5, load 42.73 / 46.54 / 55.24: late 0 / 0 / 0, ten-move block 0 / 51 / 112 ms, CLEAN, CLEAN, CLEAN. Audible at load 60.94: greeting before transport, first word 706 ms, transport 1024 ms, press to first sound 670 ms.

## 2026-09-23: smooth phase 4, where the sounds come from
- A lane interface for the ritual's "next" (`lib/sources/`): every lane ranks candidates on what its catalog already says and never fetches audio to rank. "Next one" draws from the lanes once the heard record's lines and the finder's records are used up, or at once when nobody is signed in.
- The owned lane is built: the starter library's vocals, stretched onto the grid at their own tempo or at double or half time (whichever bends them least, at most 12 percent) and moved at most three semitones into the grid's key. A tempo the pack only inferred from a loop's length carries 0.5 and is said out loud. The line it speaks says where the sound came from, how far it was bent, and that it is ours to use under CC0.
- Every sound the product ships is listed with its license, source page, author and sha256 in `docs/SOURCES_MANIFEST.json`, and `tests/sources.test.mjs` holds that list, the pack manifest and `lib/samples-attribution.ts` to each other. A commissioned buyout is an owned license now, with its contract named.
- Splice is a stub behind `NEXT_PUBLIC_SOURCES_SPLICE`, off unless it is exactly 1, with nothing to offer even when on. The hard line is code that runs today: a `splice:` clip key space, the clip vault refuses it (`needsVault`), and `spliceMayGo` allows the user's own device and nowhere else. The probe and the lane design are in `docs/SOURCES_SPLICE.md`: open dynamic client registration, PKCE, no CORS on `/mcp` or `/oauth/token`, so the client has to run on the user's own machine. Tracklib has no public API.
- The audit (`npm run audit:audio`, `docs/SOURCES_AUDIT.md`) is not zero. Training data holds no audio. Storage holds 345 objects (580.7 MB) of stems separated from 11 records, 189 of them from the learning lane and 135 in the shared cache every signed-in user can read; the repository holds 16 files that are not ours (14 local fixture records, the voice harness WAV, a stray WAV in the Lakh dataset). Nothing was deleted.

### Measured
- `npm test` at load 17.48: `ℹ tests 118`, `ℹ pass 118`, `ℹ fail 0` (8 new in `tests/sources.test.mjs`). `npx tsc --noEmit`: exit 0. `next build`: green.
- `[audit] audio files by their bytes or their names: 56; owned and listed in docs/SOURCES_MANIFEST.json: 40; not listed: 16 (188.9 MB)`, `[audit] NOT ZERO: audio that is not listed as ours is still in this repository.`
- Supabase, read only: `clips | <owner>/stems | 210 | 292.3`, `clips | shared/records | 135 | 288.4`, `clips | <owner>/uploads | 1 | 2.8`, `clips | <owner>/queries | 1 | 0.4`.
- Splice: `GET /mcp` gives `HTTP/2 401` with `www-authenticate: Bearer resource_metadata=https://mcp.splice.com/.well-known/oauth-protected-resource`; `POST /oauth/register` for a public client gives `201`; `OPTIONS /oauth/token` gives `405` with no `access-control-allow-origin`.

## 2026-09-23: smooth, the skeptic's pass and the fixes
- Phases 3 and 5 were built by one agent (45669f7, 656d3d7) and phase 4 by another (2638093, 2bc1c49). A skeptic rebuilt from clean and re-ran every gate. Phase 3 CONFIRMED (the ritual order by voice, ALL PASSED). Phase 5 CONFIRMED (verdict windows on moves, three passes with no verdict marks the idea dead). Phase 4 BLOCKED on decisions only Brady can make (docs/SOURCES_AUDIT.md, docs/SOURCES_SPLICE.md).
- Fixed after the skeptic, all on `smooth`:
  - A warped loop could end past its own audio. `rig.ts` divided the loop length by the playback rate twice, so a clip slower than the grid threw `RangeError ... at set loopEnd` inside the rig, and every later move stopped reaching the audio. The loop is now the clip's own beats in its buffer, clamped to the buffer. Proven live: a 128 BPM library vocal placed on a 126 BPM record lands, and the next three moves rebuild (4 -> 5 -> 6 -> 7).
  - "Next one" rewrote finished arrangements. On a record with no source and no seed it now says how to start one, and the local shortcut only claims "next one" when the record is in the ritual. On GLOW with no source: nothing added. Unit test in tests/local.test.mjs.
  - A catalog key was said as certain although it is right about two times in three. The key prior (0.55) now sits under the line, so the producer says the key with its doubt.
  - A stop during a loading start was lost. `Engine.start` now yields to any stop that lands while it loads.
  - The landing warm-up also opens the upstream voice connection (voice metadata, no characters spent).
- Checks after the fixes: unit tests 119 of 119, tsc clean, ritual ALL PASSED. Glitch at loads 49, 52 and 53: late 0, 0 and 0, CLEAN three times, ten-move longest block 59, 0 and 51 ms.
- Open, measured and not closed:
  - The ten-move block goes past 50 ms once the load average passes about 18, and the end-of-phase-2 build does the same (0, 61 and 52 ms at loads 7, 18 and 36), so this is load, not a regression. `glitch.probe.mjs` prints CLEAN on late notes and leaks only, and does not enforce the 50 ms bound. Rerun on a quiet machine.
  - On a freshly restarted local server the greeting arrives 2 to 3.5 s after the record starts: first word at 3488 ms on the landing path and 5033 ms on stage-on-load, with the transport at about 1.7 s, at load 30 to 41. On a warm server the greeting leads by about 0.3 s. The music never waits more than 0.8 s, so the cold case is music first, never silence. The case that matters is a cold function on the deployed site, and it has to be measured there.
  - The worker's drum re-read sets the tempo but leaves bars, blocks and best bars on the mix's grid. The Splice exits (hear, identify, analyze uploads) are listed but not closed in code. Findphrases runs on the main thread (44 to 57 ms on a 4-minute stem). The Keep and Kill buttons ignore the 30-second window. The patience rule needs both 3 passes and 30 s, which is 8 passes on a 2-bar loop.

## 2026-09-27: producer phase 0, the ledger, the probes and today's numbers
- `lib/engine/ledger.ts` is the debugger (masterprompt section 8.6). Every sound is a row: who asked and why, when it was decoded (and how many times), when it was ready and from where (memory, IndexedDB, HTTP or a render), when a laid record first needed it, and when a voice playing it was first heard. Every `Engine.update` writes a landing row (bar, beat in the bar, parts laid anew, voices rebuilt, sounds not ready). Counters: IndexedDB opens and App commits per second, the rig's late notes, and `playbackStats` underruns where the browser has them. It is `window.__ledger()` under `?e2e=1` or `?trace=1`, and `?trace=1` draws it as a timeline (`components/TraceOverlay.tsx`). The ledger is Tone-free, so the page writes to it without pulling the engine into the first bundle.
- Wired into `clips.ts`, `samples.ts`, `kits.ts` (every request, decode, ready and failure), `engine.ts` (due and landing rows), `rig.ts` (first heard; the retire timer is now a pluggable `defer` with the same live behaviour) and `app/page.tsx` (App commits).
- `npm run load` (`tests/load.probe.mjs` plus `tests/load/*.mjs`, promoted from the loading research) prints every engine row of section 10 from the ledger, with DevTools only for what the page cannot see (native nodes per context, render capacity, bytes on the wire). Modes: `cold`, `play`, `idle`, `desk`, `all`. `npm run stub` is `tests/stub-proxy.mjs` for harnesses that do not intercept their own requests.
- Mock guards: `/api/critic`, `/api/research` (the free store still answers; a miss stops before the shared cache and the paid search), `/api/attend` and `/api/step` honour `PRODUCER_MOCK=1` plus `?mock=1` like `/api/chat` and `/api/voice`. Every mocked answer carries `x-producer-mock: 1`, and the clients of those routes forward `?mock=1`, so the probe counts a model route that answers without the header as a paid call.
- The desk is measured offline, and faithfully: `lib/engine/replica.ts` renders through a NATIVE `OfflineAudioContext` handed to Tone, suspends at every 0.1 s tick with the live 0.2 s lookahead (and `now()` put back to currentTime + lookahead, its live meaning), so a node disposed or a value set at `now()` changes the sound at the same audio time it does in the room. The ears' offline path ticks every 128 samples with no lookahead and hides these bugs. `standardized-audio-context` builds its native offline graph once at `startRendering`, so changes during a suspend only reach the audio on a native context. `lib/engine/deskProbe.ts` (scenes full, velocity, swap, wrap, snap) and `lib/engine/deskMetrics.ts` (flat tops, true peak by 4x band-limited interpolation, BS.1770 LUFS, Pearson, onset peaks, second-difference jumps; `tests/deskMetrics.test.mjs` holds each to a signal with a known answer).

### Measured (today's column)
- `node tests/load.probe.mjs all http://localhost:3111 --label today-all-1` against `ANTHROPIC_API_KEY= npm run serve:mock`, Chrome `--headless=new --mute-audio`, `?e2e=1&mock=1`. Load average 17.06 at the start, then 585 to 631 from other sessions on the machine (ffmpeg, a separation run, other repos' test suites): UNDER LOAD, a baseline and never a gate. Run file `~/dev/producer-web-progress/build/runs/today-all-1.json`.
  - Paid calls: `0 (mocked {"/api/critic":12,"/api/voice":8}, voice stubbed 45, blocked {"/api/stt/token":6,"/api/find":2})`. PASS: a mock run spends nothing.
  - Cold seed (load 17): press to transport 902 ms, greeting first by 282 ms, 3 realtime contexts, 2,793 native nodes in the studio context (render capacity 44.3%), decodes per key 1, late 0, late source starts 0 of 208, due before ready 0. Warm reload: 472 ms, 2,534 nodes.
  - Reopened sample-kit record (under load): press to transport 1,088 ms, record first by 1,865 ms, 4,040 nodes, decodes per key 1 (an earlier functional run at load 150 decoded `chop_loadjob_7470` twice: `decodedTwice: ["chop_loadjob_7470 x2"]`).
  - Where a change lands (six typed moves, under load): 0 of 6 on beat 1; 494, 1159, 236, 1505, 497 and 1328 ms after the bar line. Late 0.
  - A record with a chop playing untouched for 60 s (load 585): 40.5 IndexedDB opens per second (ledger 41.4), 41.4 App commits per second (all React roots 40.12), 20 long tasks. The loop is CPU-bound, so a quiet machine runs it faster (section 10 records up to 183).
- The desk, `node tests/load.probe.mjs desk` (offline, so the load changes the time it takes and not the numbers; the synthesized kit's noise is not seeded yet, so two runs differ in the last digits). Run at 12:28 (`desk-today.json`) and in the run above:
  - Flat tops: 156,313 and 152,538 samples (at the old -2.85 dBFS clamp: 169,843 and 167,004). Sample peak -2.85 dBFS. True peak -0.43 and +0.55 dBTP.
  - Loudness: -10.65 and -10.66 LUFS (drop -10.69 and -10.71).
  - Drum onset against its own velocity: kick -0.092, clap -0.174, hat 0.737, tamb -0.306; against the PREVIOUS hit's velocity the kick reads -0.959 (level in dB is falling with velocity in dB of the hit before: the volume is set at `now()` inside the callback).
  - Pad swap mid-note, five moments: worst 57.74x the pad's own largest step (22 to 58x), and the new pad sits at -47 to -50 dB against -21.89 before the swap: it pops, then goes silent.
  - Loop wrap after the outro fade: the intro plays -15.63 dB under its first pass.
  - A hat move halfway down the outro fade: +4.84 dB against no move (the fade snaps back).

## 2026-09-27: producer phase 1, the render loops stop
- The vault effect (`app/page.tsx`) runs when the record's clip list or the account changes, never because the page re-rendered: it depended on the hooks' objects, which are new every render, and `restore` always set a new empty list, so a record with a chop re-rendered and opened IndexedDB in a loop. `useVault.restore` sets its list only when it differs, and asks `hasClip` (a key count, no bytes) instead of reading the whole clip.
- `lib/engine/clips.ts` keeps one IndexedDB connection for the session (dropped when the browser closes it or another tab upgrades; a failed open is never kept), and remembers which ids it has seen stored.
- The mic level is a ref (`hooks/useSpeak.ts`) that the glow and the button paint from once a frame while you hold (`hooks/useLevelFrame.ts`), not a state update twenty times a second.
- The song, the chat and the library are written to this device once a change is committed and the thread is idle, coalesced (`lib/idle.ts`, `hooks/useDeviceSave.ts`), and whatever is waiting is written when the page is hidden. A full store is still said out loud.
- The Board's paint loop mounts once for as long as the canvas is on screen and reads the record through a ref.
- The critic is keyed on the record's structure (parts, patterns, sections, arrangement, tempo, key, reference; not a fader or a re-listen) and waits for 20 s with no structural change.

### Measured
- `node tests/load.probe.mjs idle http://localhost:3111 --label p1-idle-1` (a record with a synthetic vocal stem, a chop, the beat and the starter kit, playing untouched for 60 s; load average 312 to 345 from other sessions, UNDER LOAD): `idle: {"seconds":60,"idbOpensPerSec":0,"idbOpensLedgerPerSec":0,"appCommitsPerSec":0,"reactCommitsPerSec":0,"late":0,"longTasks":3}`, 737 note events fired in the window, one IndexedDB open in the page's whole life. Before (phase 0 run, same scene): 40.5 opens and 41.4 App commits per second.
- `npm test`: 129 tests, 127 pass; the 2 that fail are wall-clock bounds under load 170 to 250 from other sessions, and every other assertion in them passes: `real tracks` reads tempo 12/12, key 10/12, loudness 12/12, drop 12/12 and fails only `took 142.1 s` against 90; `nearest by sound` fails only its tenth-of-a-second bound. Both passed at load 13 on the phase 0 tree.
- `tests/idle.test.mjs`: a burst of 50 writes is one write per key (the newest), later; `flush` writes at once and a failed write never blocks the next.

## 2026-09-27: producer phase 2, the clean desk
- The master: a real limiter (`Tone.Compressor`, knee 0, ratio 20, attack 2 ms, release 80 ms), then a soft ceiling whose input is pre-scaled by 0.5 (`lib/engine/ceiling.ts`, curve `CEILING*tanh(2u/CEILING)`, 8192 points, `oversample: "4x"`), so the curve spans +6 dBFS of overs instead of ending at full scale. The record's `limiter` value is the ceiling it asks for; the native compressor adds makeup of its own (about 0.57 of its threshold), so it runs 3 dB under it (`LIMIT_UNDER`). The curve's bound is -1.5 dBFS because the oversampler's filters put peaks up to 0.9 dB above the curve: the true peak is what is held to -1 dBFS. `DEFAULT_MAKEUP` is 8.5 (it was 5 into the old clamp), taught in `lib/song/types.ts` and `lib/brain/contract.ts` too.
- Sampled drums and one-shots play one buffer source per hit (`lib/engine/hits.ts`), with that hit's gain and rate carried into its own start at its audio time. A retrigger fades the hit still ringing over 4 ms (Tone.Player cut it dead). A reversed clip plays a reversed copy (Tone reversed the shared cached buffer in place).
- A voice that leaves fades from the audio time the change lands at and is disposed only after that fade has played (`rig.retire`, through the rig's `defer`).
- The pump, the trance gate and every automation hold the value they have at their audio time (`cancelAndHoldAtTime`) and ramp from there in 5 ms, so nothing on the desk steps. `tune` and `applyMaster` ramp from an explicit time and skip any parameter a running automation owns (it owns it to the end of its section), so a move never snaps a fade back.
- Every section start and the loop's start put each automated parameter back where the record writes it (`lib/engine/automation.ts`, `lib/engine/deskParts.ts`): to base, or onto a running sweep when a loop starts inside one.
- A cut fill is silent: notes end at their cut instead of ringing into it (`schedule.ts`), and a gap gain takes the whole music bus (tails, reverb and delay included) down for the last half beat and opens on the downbeat.
- The synthesized instruments moved to `lib/engine/instruments.ts`, so `voices.ts` is 210 lines.
- The desk probe also taps what enters the soft ceiling (a four-channel offline render), so a clamp is counted where it would happen, not guessed from the output. The velocity scene runs each drum 24 dB down with the master compressor's threshold at 0 dBFS and its sends off, reads each hit after the chain's measured latency (16.4 ms: each DynamicsCompressor looks ahead about 6 ms) and after the previous hit's choke, on the grid (the gate) and swung (for the record).

### Measured
- `node tests/load.probe.mjs desk http://localhost:3111 --label p2-desk-gate-1` (offline replica, so the machine's load changes how long it takes and not the numbers; load 109 to 252): 
  - `Seed samples on a flat top: 0 (at the old clamp 2; past the curve 0, ceiling input peak 0.85 dBFS)`. Before: 156,313.
  - `Seed true peak: -1.41 dBTP (sample -1.97)`. Before: -0.43.
  - `Seed loudness: -9.23 LUFS (drop -9.89)`. Before: -10.65.
  - `The gap before a drop: -240 dBFS RMS (loudest gap)`.
  - `Drum onset vs its own velocity: r 1 on the grid (kick 1/1 swung, clap 1/0.999 swung, hat 1/0.972 swung, tamb 1/1 swung)`. Before: kick -0.092, clap -0.174, hat 0.737, tamb -0.306. The swung hat's 0.972 is the source's interpolation: a swung hit starts between samples and a noise hat's peak comes out up to 1.2 dB duller; on-beat hats start on whole samples.
  - `Pad swap discontinuity: 0.94x the pad's own largest step` (five moments, 0.79 to 0.94). Before: 22 to 58x.
  - `Master after the loop wrap: 0.13 dB against the first pass`. Before: -15.63.
  - `A move during the outro fade: 0 dB against no move`. Before: +4.84.
- The settings were chosen by measurement, each a `--scenes full` run with `--master`: the limiter at the ceiling itself read -0.61 to -0.99 dBTP at makeup 6 to 9; 3 dB under it with the curve at -1 dBFS read -0.85 to -0.99; with the curve at -1.5 dBFS, makeup 8.5 read -1.37 dBTP and -9.22 LUFS, makeup 9 read -1.23 and -9.08. The synthesized kit's noise is not seeded yet (Phase 3), so two runs differ by up to 0.4 dB of true peak.
- `npm test`: 129 tests, 127 pass (the same two wall-clock bounds as phase 1 fail under load 170 to 250; everything else in them passes). `npx tsc --noEmit`: exit 0. `next build`: green.
- `tests/desk.test.mjs`: the soft ceiling is near unity at low levels, strictly rising over the whole range a WaveShaper maps, and still moving at its edge; every note of a cut fill ends before its gap; an automation owns its parameter to its section's end, the wrap brings the master back to base, and a loop start inside the outro fade lands on the fade at -9 dB.
- The other shipped seed, `node tests/load.probe.mjs desk --scenes full --seed hard-house --label p2-full-hardhouse`: flat tops 0 (past the curve 0, ceiling input peak +1.32 dBFS), true peak -1.31 dBTP (sample -2.23), -8.0 LUFS (drop -7.27), gap -240 dBFS.
- Live smoke on the new desk, `node tests/load.probe.mjs cold` and `play` (load 108 to 220): no page exceptions, late notes 0, late source starts 0 of 274, six typed moves including two kit swaps landed with late 0.
- Open: a swapped pad stays silent until its next note (-39 to -42 dB after the swap against -16.4 before). A part laid on a running transport only fires future ticks; the catch-up is Phase 4.

## 2026-09-27: producer phase 3, one asset store
- `lib/engine/assets.ts` is the only code that fetches or decodes audio: `get(key, {tier, why})` resolves the decoded buffer. An in-flight map (a key asked twice is one load), a decoded LRU (256 MB) that pins what the current record plays, IndexedDB bytes, and HTTP for the library. A failure is never cached (the next ask tries again). Tiers order the work (T0 the first bar before the press, T1 the section in play, T2 next, T3 the rest at idle, T4 cancellable). Every load writes the ledger, and every arrival is announced (`clip-arrived`, `clip-replaced`); the engine lays the record again when a sound it names arrives, so a restored clip no longer waits for an unrelated change.
- `lib/engine/idb.ts`: one IndexedDB connection, version 2 with a meta store (listing and eviction never read audio; every existing clip is upgraded in place under its own id), a least-recently-used eviction that only ever removes clips that can be fetched again (stems, one-shots, matches) and never one the record plays, and `navigator.storage.persist()`.
- `/samples` is served `public, max-age=31536000, immutable` (`next.config.ts`), and every library URL, the manifest's included, carries the pack's content hash (`?v=`, computed from every file's name and bytes at build time).
- Keys are Tone-free (`lib/engine/keys.ts`), so `app/page.tsx` no longer pulls the engine in through `lib/account/clips.ts`: no first-load chunk contains Tone (the page's First Load JS is 269 kB). The kit key is `kit:<id>|<style>|v2`, and the synthesized kit's noise is seeded from the kit and the sound (it was `Math.random`, a new hat on every reload).
- One realtime context: `lib/audio/studio.ts` makes the studio's native `AudioContext` (44,100 Hz, `latencyHint: "playback"`; `?sr=device` or `localStorage producer.sr = "device"` runs at the device rate for the A/B). The engine hands it to Tone with `setContext(ctx, true)`, which closes the context Tone opened on import, and the producer's voice now plays through the same context.
- The warm-up is keyed on the committed record (`song.id + kit + clip keys`), not on a ref that still held the seed; a saved record is never preceded by a warm-up of the seed.
- The probe reads closed contexts as closed (`WebAudio.contextChanged`) and counts `/samples` bytes on the wire per load; `node tests/load.probe.mjs cold --repeat N` runs N cold loads in fresh Chromes.

### Measured (UNDER LOAD: load average 182 to 454 from other sessions on the machine the whole time)
- `node tests/load.probe.mjs cold http://localhost:3111 --label p3-cold10 --after 5000 --repeat 10` (runs file `~/dev/producer-web-progress/build/runs/p3-cold10.json`): every key decoded exactly once in 10 of 10 cold loads, 1 realtime context in 10 of 10, greeting first in 10 of 10 (by 214 to 338 ms). Press to transport on the seed 599 to 1,591 ms (the transport still waits for the greeting's first word and builds the rig after the press; Phase 5).
- `node tests/load.probe.mjs play --label p3-play-1` (load 238 to 400): the reopened sample-kit record, press to transport 349 ms (before: 635 to 920 ms at low load, 1,088 under load), decodes per key 1, 1 realtime context, 7 `/samples` requests all from the browser's cache with 0 bytes on the wire. Six typed moves landed with late 0 (still wherever the playhead was: Phase 4).
- `node tests/load.probe.mjs cold --label p3-cold-1` (load 285 to 454): 1 realtime context after the press, decodes per key 1, warm reload 0 bytes for `/samples`.
- Gate: decodes once 10 of 10 PASS; warm reload 0 bytes PASS; only the studio context PASS; press to transport on a reopened sample-kit record 349 ms against 300, measured only at load 238 to 400, so it is re-run at low load after Phase 5 takes the rig build and the greeting race off the press.
- `npx tsc --noEmit`: exit 0. `npm test`: 129 tests, 127 pass (the same two wall-clock bounds fail at load 130 to 180); the 68 engine tests pass.

## 2026-09-27: producer phase 4, the bars
- Every change has an address in musical time (`lib/engine/boundary.ts`, Tone-free and unit tested): content lands on the next bar, sections, the arrangement, the tempo and the loop on the next 4-bar phrase, a mixer move on the next beat, and mute and solo at once as a 15 ms ramp. The boundary is read against the record that is on the rig, so a mute made while a content change waits carries the content to its bar.
- The mechanism (`lib/engine/landing.ts`): `Transport.scheduleOnce` one tick before the boundary (a Part laid on the tick it starts would miss its own first hit), under the latest-wins ticket, doing everything at the boundary tick's own audio time. `Rig.apply` stays synchronous and takes that time and beat; the voices a change needs are built before the boundary (`Rig.stage`), so the landing only swaps them in. At a loop's end the landing is the wrap, and a change that moves or removes the loop decides where the transport goes next. `Engine.update` resolves once the change is scheduled, with `landsAtBar` and a `landed` promise that settles in the audio.
- The ready gate: a track whose sound is not decoded is not laid; it keeps the voice and hits it had (a pending drum keeps its previous voice) and is laid again on the next bar when the sound arrives (`clip-arrived`).
- Audio loops are clock state (`lib/engine/spans.ts`): a loop laid mid-span, a jump into one, a loop region that starts inside one, and a resume after a pause start at once at the right phase; a loop with no span left stops at the boundary; a pause stops the grains (a GrainPlayer does not follow the transport). A jump lands on the next phrase and moves the transport's clock at that exact audio time.
- Content hashes count note lengths at 960 PPQ (`steady.ts`).
- The ledger's landing row reads back where the boundary's audio time sits on the transport's grid (`measuredBeatInBar`) and when each part laid anew first fired (`firstHits`, beats after the boundary).
- Found on the way: the ears had stopped hearing (glitch probe: "THE EARS HEARD NOTHING"). An offline listen fires its drum hits from its own clock, and a hit's source was built in whatever context was global, the room's, which cannot connect into the render. Each hit's source is now built in the context it plays into, and the render's clock ticks with its own context global (`hits.ts`, `offline.ts`).
- `tests/bars.probe.mjs` (`npm run bars`); the glitch probe reads the record from the page (the seed is only written to the device on a commit) and passes the update's arguments through; the ritual probe reads the in-memory record and waits for the Hands' ops, which land after their report streams.

### Measured
- `node tests/bars.probe.mjs http://localhost:3111 --label p4-bars-3` (load average 82 falling to 39): hat changes on beat 1 in 10 of 10 (every landing `boundary: bar`, `beatInBar: 0`, read back from the transport at beat 0, the new hats' first hit 0.5 beats after the bar line, their pattern's first hit); an audio loop added mid-section heard 1,945 ms after the ask (a bar is 1,905 ms at 126 BPM; before, it was silent until the next section); a loop region of bars 5 to 8 set at bar 57 landed on bar 5, beat 1, and its intro-only loop was heard 212 ms after the landing was laid (the landing is laid 0.2 s ahead of its audio time); a restored clip, held silent while its record named it, heard 1,727 ms after its bytes arrived. Late notes 0. Runs `p4-bars-1` to `p4-bars-3` in `~/dev/producer-web-progress/build/runs`; the first two, at load 160 to 360, found the wrap bug (a loop removed at its own wrap was laid at the wrong beat) that `p4-bars-3` confirms fixed.
- The outro fade survives a move: `node tests/load.probe.mjs desk --label p4-desk` (offline replica): `A move during the outro fade: 0 dB against no move`. Every other desk gate still passes: flat tops 0, true peak -1.53 dBTP, -9.24 LUFS, gap -240 dBFS, velocity r 1, swap 0.94x, wrap 0.14 dB.
- `node tests/load.probe.mjs all --label p4-all` at load 28 to 48: reopened sample-kit record press to transport 253 ms (the Phase 3 gate, PASS), 7 `/samples` requests from cache with 0 bytes; the seed cold 488 ms, warm 204 ms; 1 realtime context; decodes per key 1; idle 0 IndexedDB opens and 0.1 App commits per second; late 0. Native nodes 2,014 (Phase 6).
- `npm run glitch` through `tests/stub-proxy.mjs` at load 180 to 290: late 0 untouched and over ten moves, rebuilds max 42 ms, the ears heard the seed (126 BPM, D minor, -10.3 LUFS, the render 17.8 s under load, off the main thread), CLEAN. One Tone warning remains: a finished per-hit source's own `onended` stops itself with no time.
- `npm run audible` at load 290: first sound 836 ms after the press, greeting before the transport. `npm run ritual` at load 150 to 200: ALL PASSED.
- `npm test` at load 24 to 34: 132 of 132 pass. `npx tsc --noEmit`: exit 0.

## 2026-09-27 and 28: producer phases 5 and 6, a deterministic start and the audio budget
Phase 5, the start:
- `Engine.arm(song)` runs before the press, keyed on the committed record (`hooks/useStudio.ts`): it loads the record, builds its voices a step at a time (the thread goes back to the page between them, `drain` in `lib/engine/offline.ts`), and lays it onto the stopped transport. The press only resumes the context and starts the transport at an audio time. A change while playing stages its voices the same way before its boundary.
- The greeting is fetched as PCM while the landing is up (every sentence of it: its text is fixed), and the press schedules both on the studio's one clock: the greeting at t0 = the press + 50 ms, the record 100 ms later. Nothing waits on a race; the transport and voice marks are the audio times they are heard.
- Another record altogether (a different song id) is swapped on the next bar and starts from its top. The first listen waits out the first two bars.
- The harness presses once the record is armed and the greeting fetched (at most 4 s), the way a person presses after the page is up.
Phase 6, the budget and one context:
- Voices build only the devices they use (`devicesOf`, part of `voiceSignature`: width, pan, delay, drive, the reverb send, and anything the record automates), so a device switched on or off is a new voice at its boundary. Filters are plain biquads (Tone.Filter was ten native nodes, a biquad is one; its frequency is kept inside the context's band, `hzOf`), the master EQ is three biquads (Tone.EQ3 was about forty nodes and never off), the chorus and the drive are light rebuilds of Tone's (`lib/engine/fx.ts`: 11 nodes against 51, 5 against 12, the same curves and mix law), and the meters are plain analysers (`lib/engine/meters.ts`: 1 node per track against 6) that exist only while the board is on screen and the page visible (`Board` asks through `setMetering`; a probe always has them).
- Tone frees each finished note's source and oscillator in a `requestIdleCallback` with no timeout, and a page that paints every frame is rarely idle: hundreds stayed connected. An idle callback asked for with no timeout gets two seconds (`lib/audio/studio.ts`).
- One realtime context: the producer's voice (`hooks/useVoiceOut.ts`), the talk mic (`hooks/useSpeak.ts`) and the hum (`hooks/useHum.ts`) all run in the studio's context; a capture's cut decodes on the store's decoder. The voice has one bus (`lib/audio/voiceBus.ts`) that joins the desk before its final limiter and soft ceiling while a desk exists (`board.voiceIn`), with a 10 ms crossfade when it moves.
- The voice is pipelined: the next sentence is fetched while this one plays, each sentence waits for a 120 ms jitter buffer before it starts, and its chunks go back to back on the audio clock.
- The input tap is an AudioWorklet in the studio's context (`public/worklets/recorder.js`, `lib/audio/recorder.ts`): blocks of 2048 frames with the audio frame they were heard at and their level, and `recordBetween(ctx, source, start, end)` returns exactly the samples between two audio times, for Phase 10's takes. The mic's ScriptProcessor and its own AudioContext are gone.
- Probes: the cold scene collects garbage before it counts native nodes and counts them at the press and after, by type; `--sr device` runs the other side of the sample-rate A/B; `tests/holes.probe.mjs` makes the voice route answer each sentence after a delay and reads every sentence's place on the audio clock (`window.__speech`); a harness-only `nodeCost()` in `lib/engine/deskProbe.ts` counts the native nodes of each device.

### Measured
- Phase 5 gate, `node tests/load.probe.mjs cold --label p5-cold10c --after 4000 --repeat 10` at load 13.9 to 21.2: the start order is identical in 10 of 10 (greeting first by 98 to 101 ms), press to transport 137 to 151 ms, the greeting has no holes in 10 of 10 (every sentence from memory, back to back), 1 realtime context, late 0, decodes per key 1. Long tasks over 50 ms from the press to bar 2: none in 8 of 10; load 1 had 77, 64 and 56 ms and load 7 had 52 and 53 ms. The same at load 195 to 250 (`p5-cold10b`): order 10 of 10, press to transport 145 to 153 ms, no long task in 8 of 10. Before (p3-cold10, load 182 to 454): press to transport 599 to 1,591 ms, greeting first by 214 to 338 ms (it waited on a race).
- Phase 6 gate. Native nodes on the seed, after garbage collection (`p5-cold10b`, load 195 to 250): 565 at the press and 553 playing. At load 13 to 21 (`p5-cold10c`): 574 at the press, 757 playing (the pads' and stabs' polyphonic voices are made as their chords first play, and whether they have been by the count varies). Before: 2,014 (p4-all). Per device (`nodeCost`): bass voice 69, sub 38, stab 65, pad 127 (its PolySynth and the synth voices it makes are most of the rest), a drum voice 5 to 7, the desk 19.
- Sentence holes, `node tests/holes.probe.mjs --label p6-holes-1` (the voice answers each sentence after 600 ms with 1.2 s of audio; load 277): 0 ms between every sentence of three four-sentence lines. Before, each sentence was fetched only after the one before it had played, a hole of the whole round trip (0.3 to 1.8 s measured with ElevenLabs). A rerun at load 853 (`p6-holes-2`) had one hole of 642 ms: UNDER LOAD.
- One realtime context in every cold, warm and reopened run since Phase 3. Render capacity on this machine, headless, 44.1 kHz: 10 to 18.2% with 0 underruns (`p6-cold-*`, `p5-cold10*`). The device-rate side of the A/B (`--sr device`) is prepared and not yet measured here; the gate's "on Brady's machine" is his own Chrome and speakers (Phase 12).
- `npm run glitch` at load 16: untouched and over ten moves late 0, long tasks 0, rebuilds max 36 ms, the ears heard the seed (-10.1 LUFS), CLEAN. `npm run desk` (`p6-desk`): every gate passes: flat tops 0, true peak -1.6 dBTP, -8.62 LUFS (drop -9.68), gap -240 dBFS, velocity r 1, swap 0.78x, wrap 0.14 dB, no snapback. `npm test`: 132 of 132. `npx tsc --noEmit`: exit 0.
- Open: two of ten cold loads had long tasks of 51 to 77 ms between the press and bar 2 at low load; a profile under the sampling profiler did not attribute them. The playing node count stays over 600 when the seed's polyphonic synths have made their voices.

## 2026-09-28: producer phase 7, arrival bursts and memory
- A finished stems job stores each stem's bytes and decodes nothing (`hooks/useStems.ts`): a stem is decoded by the asset store when a track plays it (a four-minute stem is about 85 MB of samples). The voice comes first: the vocal stems (a hook preview before the whole vocal) are stored first, and an ask for the voice is carried out before the other stems are even stored. Stems are stored as fetchable again (`origin: "remote"`), so IndexedDB may evict them past its budget (never what the record plays, never a clip made only in this browser); every write schedules the trim at idle.
- The record becomes the reference from what the worker already measured (`lib/ears/fromWorker.ts`): tempo, key, chords, the blocks and the drop, with loudness and the spectrum left unknown, and `compare` says nothing about an unknown instead of something wrong. The synchronous sum of every decoded stem (700 to 1,486 ms on the page's thread in V8) is gone.
- Cuts are content-addressed (`lib/engine/cuts.ts`, `cut:<hash>` of the source, the start, the length and how): the vocal phrase, a grab and a brain slice with no id of its own. The same cut asked for twice is one clip, stored and decoded once. A cut keeps the samples it was made from instead of decoding its own bytes again, and a phrase cut reads one channel near its start instead of averaging a whole stem to mono. Old ids keep loading; tracks keep readable ids.
- A version tells its listeners it is in the audio when it has landed, not when it was scheduled (`useStudio.setSong`), so a fader held down for a listen is put back down after the landing's own ramps.
- `window.__landJob` (harness only) lands a finished job through the same path as the poll; `tests/arrival.probe.mjs` (`npm run arrival`) makes six 200 s stems in the page and lands a full vocal job while the seed plays. The bars probe reads a loop's start from the ledger's audio time (the DevTools meter poll queues behind a listen's six-millisecond slices) and keeps the meter as the confirmation.

### Measured
- `node tests/arrival.probe.mjs --label p7-arrival-3` at load 15.5 to 16.8: a job of six 200 s stereo stems (35 MB of WAV each) landed mid-playback in 2,423 ms, the voice isolated and placed as `cut:3etdxqlokc04`, the reference set from the worker's numbers (124 BPM, A minor); late notes 0, underruns 0; heap (JS plus array buffers) 234 MB before and 373 MB at its peak; only the vocal stem was decoded; long tasks 122 and 103 ms. At load 201 to 208 (`p7-arrival-2`): late 0, underruns 0, heap 246 to 354 MB. At load 289 to 363 (`p7-arrival-1`, before the voice went first): late 1, underruns 0, heap peak 389 MB: UNDER LOAD.
- `node tests/bars.probe.mjs --label p7-bars-2` at load 10.9: hats on beat 1 in 10 of 10, a loop added mid-section started 1,942 ms after the ask (a bar is 1,905 ms; the meter confirmed it at 2,012), the loop region of bars 5 to 8 landed on bar 5 and was heard 306 ms after its landing was laid, a restored clip started 1,244 ms after its bytes arrived.
- `node tests/load.probe.mjs all --label p7-all` at load 12 to 25: every desk gate passes (flat tops 0, -1.44 dBTP, -8.63 LUFS, gap -240, velocity r 1, swap 0.78x, wrap 0.14 dB, snap 0.01 dB), 0 IndexedDB opens and 0.1 App commits per second idle, bar and phrase changes 3 of 3 on beat 1, 1 realtime context, decodes per key 1, press to transport on a reopened sample-kit record 150 ms (the Phase 3 gate), no long task from the press to bar 2, late 0, render capacity 15.8% with 0 underruns, 0 paid calls. Native nodes 565 at the press, 754 playing.
- The sample-rate A/B, `--sr device`: headless Chrome's device runs at 44,100 Hz, so both sides are the same here (capacity 13.1% against 13.9%, underruns 0 and 0). It is prepared for Brady's Chrome, where the device is usually 48 kHz.
- `npm run holes` at load 41: 0 ms holes in three lines. An earlier run at load 15 had one line with holes of 6,424 and 1,145 ms while the first listen rendered, then two lines with none: the listen's slices can hold the page's thread long enough to starve the next sentence's arrival.
- `npm run glitch` at load 15: late 0, long tasks 0, CLEAN, the ears heard the seed. `npm run ritual` at load 30: ALL PASSED. `npm test`: 134 of 134. `npx tsc --noEmit`: exit 0.
- Phase 5 gate again on the Phase 7 build, `node tests/load.probe.mjs cold --label p5-cold10d --after 4000 --repeat 10` at load 13.2 to 27.4: the start order identical in 10 of 10 (greeting first by 100 to 101 ms), no long task over 50 ms from the press to bar 2 in 10 of 10, no hole in the greeting in 10 of 10, press to transport 136 to 151 ms, every key decoded once, 1 realtime context, late 0. PASS.
- `npm run audible` at load 30: the greeting before the transport (first word 581 ms, transport 681 ms after navigation), first sound under 2 s, AUDIBLE.

## 2026-09-28: producer phase 8, the first draft
- A name becomes a whole record in milliseconds, with no model call. `lib/song/draft.ts` compiles a source's DNA into a complete SongDoc: tempo and key from the source; kick, backbeat, hats, open hats and percussion from its grids when they are real (a grid with no hits or a smear is refused) and the lane's otherwise; the bass on its rhythm walking the progression's roots with a seeded octave or fifth as the hook note, and a sub; a pad, stabs or keys, and an arp where the lane uses one; a two-bar hook shaped by its melody contour, answered and resolved over eight bars and landing on a chord tone on every strong beat; the form from its section codes (normalized: an intro, a build before every drop, at most three drops, an outro); the kit by palette. Every choice is a Thompson draw among the top three candidates, seeded from the record id, the name and the take (`lib/song/drafting/*`). The record keeps the DNA and the take (`song.draft`), so it compiles again after a reload, and "next one" is take + 1 on the same DNA.
- The resolver (`lib/brain/draftDna.ts`, `POST /api/draft`, GET warms the store when the stage opens): a record the studio has heard (`dna_heard`), else the artist's records in the fingerprint store (tempo, key counts, family, energy, valence) with the artist row (`dna_artists`: progressions, form) and the Galton bin (only a bin that pins more than the tempo or the family lends its grids), else a lane the words name. The database answers inside 900 ms or is left out. A name nothing knows is not guessed: the draft starts from the lane and says so, and when signed in the record is pulled in and the draft moves onto its heard DNA on the next phrase (`lib/song/drafting/sources.ts`, `hooks/useDraft.ts`). The resolved DNA is cached in the browser by name, so a reload hears the same numbers.
- Routing in code, on Brady's own words (`lib/brain/route.ts`, `hooks/useRouteWords.ts`): a draft ("make a song like X", "X type beat", "a X record", a lane, "new song", "surprise me"), the draft's next take ("next one" on a drafted record with no chop seed), a voice off a record ("isolate the vocal from X", "go find X, pull just the voice"), a take ("record me", "put what I just said"), a named refine ("make the drums hit harder", "rebuild the drop"), a small op, a question; only what is left reaches the Voice lane. The local SOLO catch no longer takes "isolate the vocal from X" (`lib/brain/local.ts`). The Voice lane emits typed `{draft}`, `{voice}` and `{take}` controls (`lib/brain/voice.ts`), and a whole new record is never a task. The Hands' `rollout newSong/emulate` becomes a draft; the eight steps survive as named refines (`ROLLOUTS.drums`, `bass`, `harmony`, `hook`, `craft`, `mix`, `finish`, `fixSection`).
- One FIFO job queue (`lib/jobs/queue.ts`): a job resolves when its change has landed in the audio (the runner hands back `Engine.update`'s landing, `{landsAtBar, landsAtTime, landed}`), a job waits for the one in front of it, and stop, undo, redo, new and open start a new epoch that cancels everything made for the old one; a runner still thinking sees `alive()` go false and drops its reply. Voice-lane tasks, drafts, next takes and refines are jobs; a task's card says "landed on bar 13". Asks that arrive while one runs wait in order instead of overwriting each other. The press stops speech only; talking over the Voice lane drops its words, never its work; a spoken stop ends the work. `nowPlaying` is taken when the words arrive.
- The leveler acts only between jobs, on a bar line, and only on the version it measured. A verify that misses is offered in one spoken line ("Want me to try it another way?") and fixed only on a yes. The refine pass: after a draft lands, one Hands call (`/api/step`, fast tier) reviews it against the reference facts and its ops land on the next phrase; a new take cancels a refine for the old one. `forceEconomy` and the research lines reset on new and open.
- The questions (`lib/ritual/questions.ts`, `hooks/useQuestions.ts`): "Do you like this beat?" once, between 16 and 32 bars of the draft playing (never late); then one offer drawn from what the draft is missing (`lib/song/drafting/gaps.ts`: a vocal when the source sings, a snare roll into the drop, a high lead over a pluck hook, an arp, open hats), each with the ops that add it. One question per 30 s across the room (the patience watch and the initiative read the same clock), never over his words or the producer's, and a question nobody answers closes after 30 s: silence is not a no. "Yes" keeps it and logs the verdict, "no" or a reason ("too busy", "darker", "more energy") plays the next seed steered by it, an option lands the offer.
- The bottom bar (`components/JobBar.tsx`) shows the running job in full sentences: "It is queued behind the work in front of it.", "I am writing the draft.", "It lands on bar 9.", "I am waiting for your call." while a question is open, and a named refine's steps with the running one breathing (the old bar counted the running step as done).
- Temperature: Claude Opus 5 and Sonnet 5 refuse sampling parameters with a 400, so 0.2 goes only to a model that takes it (`lib/brain/sampling.ts`: the Haiku Voice lane, or an older model set by env). On the chat and step routes as configured (opus-5, sonnet-5) the determinism comes from routing in code, the draft compiler and `effort: "low"`, not from a temperature.
- Over a silent record the first draft lands on the next beat and starts its own bar 1 there; over music it waits for the bar line. "Next one" lands on the next phrase and keeps the playhead's place.

### Measured
- `node tests/draft.probe.mjs --label p8-battery-2` at load 4.7 to 12.7 (headless, muted, `?e2e=1&mock=1`, every paid route mocked or blocked, 0 paid calls): 20 names from the store (Chris Lake, Disclosure, Duke Dumont, Fisher, Tiesto, Armin van Buuren, Dua Lipa, The Weeknd, Tame Impala, Daft Punk, Calvin Harris, Avicii, Skrillex, Four Tet, Bicep, Eric Prydz, Drake, Taylor Swift, Headhunterz, Artful Dodger), each said on a silent new record: the first sound above -50 dBFS on the master 587 to 1,314 ms after the words (p50 788 ms), 20 of 20 under 3 s; resolve 125 to 561 ms, compile 0.4 to 4.1 ms. Every pair of the 20 drafts differs in at least 4 of 10 audible features (tempo, key, kit, kick, backbeat, hats, bass, harmony, hook, form; closest Dua Lipa and Drake), and no two share a hook. The same name on the same record after a reload compiled to the same record (hash 4170651969 both times, and the saved record came back with its draft). "Next one" landed on a phrase boundary (bar 5, beat 0, measured 0) with 5 features new, 7,862 ms after the words at 128 BPM. "Do you like this beat?" came once, at 16 bars; the offer ("Want a vocal on it, a snare roll into the drop, or one of those high leads?") 30 s later; the smallest gap between two questions 30 s; "the snare roll" landed the roll; nothing else was asked in the next 35 s.
- The same battery before the refactor into `useRouteWords` and `useStudioHarness` (`p8-battery-1`, load 11.9 to 12.0): audible p50 851 ms, max 1,153 ms, 20 of 20 under 3 s, closest pair 4 features, the reload the same, next one on a phrase, the questions the same. Before the silent-record beat landing (`p8-smoke-2`, load 5.7): 1,852 to 3,336 ms, 2 of 3 under 3 s, because the draft waited for a whole bar at 124 BPM.
- `npx tsx --test tests/draft.test.mjs` (offline store only, no database): the 20 names resolve from the artist's records and compile under 50 ms each (the first one pays for loading the fingerprint store, about 1 s), every pair differs in 4 or more of 10 features with no shared hook; the same inputs compile to the same record and survive a save; a new take differs in 3 or more; "too busy" thins the draft; a lane name drafts from its recipe; a name nobody knows is not guessed; every lane recipe compiles to a valid record. `tests/route.test.mjs`, `tests/jobs.test.mjs`: the routing table, the queue's order, landing and epoch cancellation, the question schedule and the answers.
- Regressions on the Phase 8 build: `npm run ritual` at load 10: ALL PASSED (the Voice lane's darker bass is now a job that "landed on bar 13"). `npm run glitch` at load 17: CLEAN, late 0 (the one Tone warning is the one Phase 7 recorded). `node tests/bars.probe.mjs --label p8-bars` at load 15: hats 10 of 10 on beat 1, loop mid-section, loop region and restored clip PASS, late 0, 0 paid calls. `npm test`: 146 of 146. `npx tsc --noEmit`: exit 0. Screenshots of the job bar landing at 1440 and 390: `~/dev/producer-web-progress/build/runs/p8-jobbar-*.png`.
- Open: the Phase 8 battery runs in mock mode, so the refine pass's ops are the mock's (the bass down two); a real Hands refine and its cost per draft are measured in Phase 12. The upgrade from a lane draft to a heard record needs the worker (blocked in harness runs) and is not measured yet. `hooks/useStudio.ts` is still over 300 lines (616; it was 610 before this phase).
