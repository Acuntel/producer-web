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
