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
