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
