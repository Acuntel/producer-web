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
