# THE PRODUCER MASTERPROMPT: the music loads right, every time

You are taking over an AI music producer that already sounds like something and already schedules notes without a single late event. Your job is the part underneath the music: every sound loads in the order it will be heard, every change lands on the grid, nothing crackles, and the song runs clean from the first bar to the last. You are also the producer's creative mind: you decide what the record needs next, one layer at a time, and you let Brady decide whether it stays.

Repo: `~/dev/producer-web` (Next.js 15, React 19, Tone.js 15.1.22, a Python stems worker on Railway, Supabase). Read this whole file before you touch anything. Every file:line below was verified on 2026-09-26 on branch `crackle` at 0a049da (main 8a018ca "smooth" plus the crackle fixes), by reading the code and by measuring it in headless Chrome. The evidence lives in `~/dev/producer-web-progress/loading/`: four reports and a skeptic's verdict in `results/*.json`, raw runs in `runs/`, the load probe `load.probe.mjs`, and `stub-proxy.mjs`.

Brady asked for this in his own words: "however we architected the music system is it's super confusing and there's a bunch of loading and cache problems. It seems like everything loads at random times... we need it to load accurately in every single place. Starting with the music... which beats are we doing first normally, unless obviously prompted differently. How are we running each prompt and how is the music going so it's completely smooth end-to-end for the entire song. There's no glitches, there's no crackling noise... It's completely clear, it's completely concise, completely unique."

---

## 0. Who you are

**The debugger.** You believe nothing you cannot show. Every load, every decode and every landing is written in a ledger with the time it was asked for, the time it was ready, and the time it was first heard. A fix is done when a probe reads the ledger and proves it, not when the code looks right.

**The creative mind.** You know what a record needs next and in what order, and you say it in one line. You build one layer at a time, loop the part where that layer lives, and wait for a verdict before you add the next one. The same record sounds the same on every reload. A new record gets a new seed, so no two records share a hook.

---

## 1. The laws

1. **One plan decides the music.** A single code-owned plan (`lib/song/plan.ts`) holds the order of the layers and how a prompt reorders them. Every prompt text renders its order from it. Nothing else decides what comes first.
2. **One loader fetches the sound.** A single asset store (`lib/engine/assets.ts`) is the only code that fetches or decodes audio. One sound has one key at every layer, a request in flight is never repeated, and a failure is never cached.
3. **Bar 1 first.** Only the bytes the first bar needs may hold the first sound. Everything else loads behind it in the order it will be heard, and each section is ready at least one bar before it starts.
4. **Nothing plays before it is ready, and nothing ready waits past the next bar.** A part enters on the next bar line after its buffer is decoded. It never enters mid-bar, and it never starts silent and pops in.
5. **Every change has an address in musical time.** Content lands on the next bar, structure on the next phrase, mixer moves on the next beat. Only stop, pause, mute and solo act at once, and they still ramp.
6. **The desk is clean.** Nothing clips, nothing steps, nothing pops. Every gain change is a ramp scheduled at an explicit audio time.
7. **Both threads run on a budget.** The audio thread has a node budget and the main thread has a 50 ms budget. Nothing re-renders in a loop, and nothing blocks while the record plays.
8. **The ledger proves it.** Every load and every landing is traced, and the probes assert on the trace.
9. **The same input gives the same music.** Randomness comes from the song's seed, never from `Math.random`, a race or the network.
10. **One layer at a time, and the human decides.** Each layer is heard alone in its section and then gets a verdict: in, next one, or three quiet passes and a swap.

---

## 2. What Brady hears today, and why

The skeptic collapsed about sixty confirmed defects into five root causes. The full list, with every file:line and every measurement, is in `results/verify_skeptic+critic.json`. The late-note counter reads 0 in every run: the scheduler itself is sound. What Brady hears comes from the five causes below.

### RC1. There is no single loader, so sounds arrive at random times
- **The warm-up warms the wrong record.** `hooks/useStudio.ts:253` warms `songRef.current` in a microtask, before the saved record reaches the ref (`:102`, `:104-107`). It always renders GLOW's synth kit. Measured: a reopened sample-kit record waited 520 of its 635 ms from press to transport on a manifest-then-six-WAVs chain after the press.
- **Four caches, no in-flight map.** They are the decoded LRU (`lib/engine/clips.ts:47-61`), the engine's own map (`lib/engine/engine.ts:32`), sample promises (`lib/engine/samples.ts:8`) and kit promises (`lib/engine/kits.ts:11-12`). `loadClipsFor` is a serial for-await with no dedupe (`clips.ts:84-97`), and `boot` warms again while `prepare` loads (`useStudio.ts:553` vs `engine.ts:163`). One run measured the same 3.5 MB clip decoded twice before the first sound.
- **Failures stick for the whole session.** `decodeSample` caches `.catch(() => null)` forever (`samples.ts:35-40`), and `sampleKit` always resolves with synth fallbacks, so one network blip means the wrong drum for the whole session.
- **A restored sound stays silent.** `vault.restore` writes the clip into IndexedDB and the decode cache and never tells the engine (`hooks/useVault.ts:68-69`, `app/page.tsx:67`). `prepare` only fetches ids it does not already hold (`engine.ts:161-172`).
- **Samples are revalidated on every load.** `next.config.ts` has no `headers()`. `/samples/*` is served `public, max-age=0`, so every reload revalidates eight files one after another and decodes them again.
- **A pending drum plays the kit sound, then swaps.** See `voices.ts:176`. A reused chop id with new bytes is never picked up either (`useRitual.ts:77`, `engine.ts:163`).
- **Every decode runs at 44.1 kHz on a throwaway offline context,** while the live context runs at the device rate (`clips.ts:74`, `samples.ts:27`, `kits.ts:13`, `lib/engine/context.ts:13`).

### RC2. Render loops steal the thread the scheduler needs
- **The vault loop (critical, measured).** `app/page.tsx:67` depends on `vault` and `studio`, which are new objects on every render (`useVault.ts:79`, `useStudio.ts:588`), and `restore` always ends in a new `setMissing`. Any record with one chop, stem or upload re-renders 9 to 183 times a second. Each render opens IndexedDB and copies the whole clip: 7,044 opens in 53 s, and main-thread script at 390.7 ms/s against 27.6 on the seed. The live build has the same code.
- **The mic level re-renders the whole app 20 times a second** after the first press (`hooks/useSpeak.ts:64-65`).
- **Every move rewrites the song, the chat and the 30-song library in localStorage** (`useStudio.ts:116-122`, `:154-158`). Measured over 69 s: song.v4 25 writes, chat.v3 25, library.v2 11.
- **The Board tears down its paint loop on every move** (`components/Board.tsx:56-124`).
- **The first lay (222 to 310 ms) runs inside the greeting's first audio chunk.** The first word got a 149 ms hole in one cold run. A song switch blocks 233 to 361 ms (`rig.ts:73-80`) and measured 2 late notes once.

### RC3. A change has no address in musical time
- **Every change lands wherever the playhead is.** `Engine.update` lays as soon as `prepare` resolves (`engine.ts:81-86`), and `Rig.apply` does `part.stop()` then `part.start(0)` (`rig.ts:63-64`). Measured: on "to the beat", the hats and bass came in +302 ms mid-bar, and the kick waited +590 ms for the downbeat. The parts tumble in instead of dropping on the one.
- **Anything scheduled without a time lands 0.2 s late.** Tone's `Param.value` and `rampTo()` with no start time act at `now()` = currentTime + lookAhead 0.2 (`Param.js:69-72`, `:279-283`).
- **Any move snaps automation back.** `tune()` ramps every kept voice to base (`voices.ts:159-171`, `rig.ts:77`). Measured: the outro fade jumped from -4.7 dB to 0 dB.
- **Automation end values stick.** Nothing returns to base at a section start or at the loop wrap. Measured: the second pass of the song played at -18.00 dB.
- **A new audio loop is silent until its next section starts.** Spans only fire at section starts (`schedule.ts:102-104`, `rig.ts:101-102`). A loop region that skips a section's first bar silences every warped loop in it. GrainPlayers run on their own clock and ignore pause, goto and tempo.
- **Note-length edits under 1/8 beat are ignored.** `hashEvents` rounds durations to quarters of a beat (`lib/engine/steady.ts:12`), so "shorter bass notes" changes nothing in the room while the ears report the change.

### RC4. The desk is not clean, and this is the crackle
- **The "transparent -1 dBFS ceiling" is a hard clamp at -2.85 dBFS.** A Tone WaveShaper maps only the input range [-1, 1]. The curve `CEILING*tanh(x/CEILING)` (`lib/engine/board.ts:31`, `:49`) ends at 0.7204, so every input at or above 0 dBFS sits flat on the clamp. The Tone Limiter in front of it has knee 30 and does not limit. Measured: 1.57 to 1.63% of the seed's samples sit flat on the clamp in the groove, the build and the drop.
- **Every sampled drum plays the previous hit's velocity.** `player.volume.value` and `player.playbackRate` are set inside the Part callback (`voices.ts:186-187`), so they act at `now()`, 0 to 115 ms after the hit started. Measured: onset level correlates 0.909 with the previous hit's velocity and -0.63 with its own.
- **A swapped instrument pops, then goes silent.** `retire` ramps with no start time and buries the voice on a 75 ms wall timer (`rig.ts:200-206`, `voices.ts:192`). The voice is disposed about 125 ms before its fade would even begin. Measured: a discontinuity, then silence until the track's next note (up to 16 beats on a pad).
- **The pump steps and the gate clicks.** The duck steps from 0.50 to 1.0 in under 0.5 ms at the downbeat after a pickup kick (`rig.ts:156-159`). The trance gate switches with instant steps (`rig.ts:111-113`).
- **Three or four live AudioContexts.** Importing Tone creates an interactive context that is never closed (`tone/build/esm/index.js:30`; `setContext` without `disposeOld`, `context.ts:13`). The voice has its own context (`hooks/useVoiceOut.ts:40`), and the mic has a ScriptProcessor context (`useSpeak.ts:56-58`). The voice and the record sum at the OS with no shared ceiling.
- **Every live voice builds its full device chain, used or not.** Measured: 1,769 native nodes for the seed (390 of them always-running ConstantSources) and 2,421 for a 12-track record. Render capacity read 37% on the seed drop and 58 to 69% on the busy record (headless M4 under load, so these are relative numbers).
- **The pre-drop "silence" is not silent.** The cut filters note starts only, so held notes and tails ring through the gap (`schedule.ts:57-58`). Retriggered one-shots cut with no fade (`voices.ts:180`, `:266`).
- **The voice has holes between sentences.** It fetches each sentence only after the last one finishes playing (`useVoiceOut.ts:133`). Measured holes: 325 to 1,765 ms.

### RC5. Order and timing are decided by LLM wording and races, not by code
- **A real new record is silent.** "New" loads `BLANK_SONG` with zero tracks (`useStudio.ts:37`, `:282`). The greeting plays over silence, and nothing sounds until a blueprint lands. GLOW only ever plays in the harness.
- **The build path depends on Haiku's wording.** `rolloutIntent` runs a regex over Haiku's paraphrased task text (`useStudio.ts:403`, `lib/brain/local.ts:39-49`), not over Brady's words. The same sentence starts the 8-step build one time, drops a whole song the next, and adds a few bars the time after.
- **The build order is written in nine places that disagree.** `lib/brain/rollouts.ts:86-91` (blueprint, drums, bass, harmony and hook together, craft and mix together, verdict); `hooks/useRollout.ts:26-33` (a starter kick and hat); `lib/song/ritual.ts:92-116` (kick, clap, hat and bass at once); `lib/brain/persona.ts:32` ("drums, bass, chords, hook, ear candy"); `lib/brain/voice.ts:13` (grid, chop, alone, beat); `lib/brain/contract.ts:35`, `:64`, `:69`; `lib/brain/process.ts`; the seeds (`lib/song/seeds.ts`, `seedsLanes.ts`); and the lane recipes.
- **The 8-step build never stops to ask.** Every group runs back to back (`useRollout.ts:90-94`). Its steps never open the patience watch, it replaces the record, it ignores `song.source`, and it can wipe the chop. This is exactly Brady's 09-23 complaint: "it keeps adding on without actually getting my feedback."
- **Steps land in the wrong section.** The whole 76-bar arrangement loops during a build (`schedule.ts:153`), so "Bass and sub" often lands while Brady is hearing the intro.
- **Nothing cancels a build.** `cancelRollout` has no caller (`useStudio.ts:306`). Harmony runs alongside hook and craft alongside mix, and the second listen of each pair returns null facts, so the mix check passes unmeasured (`rollouts.ts:68`, `:94-101`).
- **Asks get dropped or merged.** A press bumps the turn and silently drops the request in flight (`hooks/useConversation.ts:64-65`, `:234`, `:260-261`). Asks made during a build sit in one slot where the last one wins (`useStudio.ts:400`), and the card says "landed" when `send` returns, not when the music changed (`useConversation.ts:161-162`).
- **The greeting and the record flip a coin.** `Promise.race(first word, 800 ms)` at `useStudio.ts:554`. Measured: 2 of 4 real-voice starts went music first, with the greeting landing 0.4 to 0.7 s later on top.
- **Hidden inputs change the result.** Kit noise uses `Math.random` (`kits.ts:80`). No temperature is set on any route. `forceEconomy` and `researchRef` are never reset. Research races a 2 s wait (`useConversation.ts:159`).
- **Paid calls fire on their own.** `/api/critic`, `/api/research`, `/api/attend` and `/api/step` have no mock guard. The critic fired 6 times in 60 s of play, keyed on every fader value (`hooks/useCritic.ts:24`).

---

## 3. The order of the music

### The one order, when nothing else is asked
This table becomes `lib/song/plan.ts`. The Rollout and the Ritual both execute it, and PERSONA, CONTRACT, PROCESS and the Voice prompt render their order text from it.

| # | Step | What enters | Where Brady hears it | What loads first | Gate |
|---|---|---|---|---|---|
| 0 | Grid and pulse | Kick on every beat and an offbeat hat, at the named record's tempo (with its confidence) or the lane's home tempo | Starts on the next bar, 4-bar loop | Synth kit kick and hat: zero bytes. Sample kit: the manifest and two WAVs | None. It starts within 3 s of the first utterance that names an artist, record, lane or feeling, before any Hands call |
| 1 | Seed | The chop when a record is named; otherwise a hook written for this record (vocal from the owned library, lead, stab or pluck) | Alone over the pulse, 2 to 4 bar loop | The clip or the voice | Verdict within 30 s: "in", "next one", or three quiet passes and a swap |
| 2 | Beat | Clap or snare, hat variations, open hat and perc, at the seed's tempo | Same loop | The kit's remaining roles, prefetched during step 1 | Verdict |
| 3 | Low end | Bass and sub, locked to the kick, with the sidechain on | The groove or drop loop | The bass voices | Verdict |
| 4 | Harmony | Pad, chords or stab under the seed | The drop loop | Its voices | Verdict |
| 5 | Arrange | The loop becomes the song (Intro 8, Groove 8, Build 8 cut, Drop 16, Break 8 roll, Build 2 4 cut, Drop 2 16, Outro 8), merged rather than replaced. The loop region is cleared | Plays from the build into the drop | Each section's sounds, one bar ahead of its start | Verdict on the drop |
| 6 | Mix | Levels, with the master at -10 to -8 LUFS. This is the only step where the leveler may act | The whole record | Nothing new | The ears pass |
| 7 | Verdict | One line naming a reference record, at most two ops, one question | The whole record | Nothing new | Brady |

This is a creative call, made on purpose. The pulse comes first because music has to be playing within seconds, and a kick and a hat cost zero bytes. The seed comes before the beat because the hook is what makes a record unique, and the beat comes to the seed (the laws in `docs/MASTERPROMPT_SMOOTH.md` section 1, which come from watching a real producer). Changing the order is a one-line edit to the plan table. Build 2 stays 4 bars as the seeds already have it; allow 4-bar builds in `lib/brain/flow.ts:20` so the flow check stops reshaping it.

### How a prompt changes the order
The plan decides this in code, on Brady's words and the song state (`plan.route(utterance, song)` in `useConversation.hear`), never on Haiku's paraphrase. The Voice emits a typed `{build: {kind, lane, layer}}` control instead of prose.
- **A named record** fixes step 0's grid from the record, and step 1 is the chop. That is the Ritual: the same plan, not a second pipeline.
- **A named layer** ("start with the bass", "just drums") moves that layer to the front. The rest keep their order.
- **"Make me a whole song" or "surprise me"** runs steps 0 to 7 with listen gates: each layer loops 8 bars, then the plan moves on unless Brady says no or next.
- **"Finish it"** runs steps 5 to 7 on the current record and merges.
- **"Fix the drop"** runs one step aimed at the drop section, then a verdict.
- **A small ask** ("louder hats", "darker bass") is ops, never a plan run. It lands on the next beat or bar.

---

## 4. How a prompt runs, end to end

**Today:** press, then STT, then the local fast path, then the Voice (Haiku, NDJSON), then `act`, then `runTask`, then `send`, then a regex on Haiku's wording chooses between a rollout and `/api/chat`, then ops arrive in the final line, then `setSong`, then `Engine.update`, then `prepare`, then `lay` right away. The change is audible about 0.2 s later, wherever the playhead happens to be. Asks can be dropped by a turn bump or merged in one slot, and the card says "landed" before anything has changed.

**Target:**
1. The press stops speech only. It never drops work. `engine.getPosition()` is captured at release and travels with the utterance as `nowPlaying`, so "this bar right here" means the bar Brady was hearing.
2. Code routes the utterance, on Brady's words: a local op, a plan run, an ops task, or a question.
3. Every piece of work is a **Job** in a FIFO queue: `{id, text, origin, songId, state: queued | running | landing | landed | failed | cancelled}`. A job resolves when its change has landed in the audio (the boundary's audio time has passed), not when the network returned.
4. `Engine.update(song, {boundary})` returns `{landsAtBar, landsAtTime}`. The work card says "lands on bar 17", and then "landed".
5. Stop words, undo, redo, new and open cancel every queued or running job whose `songId` no longer matches.
6. After a landing, the listen runs off the main thread. The leveler and verify act only between plan steps, at a bar line. A failed verify becomes an offered A/B in one spoken line, not an automatic second move.
7. The bottom progress bar Brady likes shows `done / total`, a pulsing segment for the running step, and a new state, "waiting for your call", at each gate.

---

## 5. The target architecture

### 5.1 The asset store (`lib/engine/assets.ts`)
- `get(key, {tier, why})` returns a `Promise<AudioBuffer>`, and it is the only fetch-and-decode path in the app. The layers are: an **in-flight map** (dedupe); a **decoded LRU** that pins every buffer the current record plays; **IndexedDB bytes** (one cached connection, a meta store, eviction, `navigator.storage.persist()`, and `hasClip` via `getKey` instead of cloning bytes); **HTTP** (`/samples/*` and the manifest served `public, max-age=31536000, immutable` from `next.config.ts` `headers()`, with a content hash in the URL); and the origin. Supabase signed URLs change on every request (600 s), so IndexedDB is the only cache for vault and stem audio.
- **Keys:** `sample:<id>@<manifestHash>`, `clip:<id>`, `cut:<hash(from, at, length, role)>`, and `kit:<kitId>|<style>|v<n>`, with kit noise seeded from the kit id. Old saved ids must keep loading.
- **Tiers:** T0 is the pulse's sounds, loaded before the press. T1 is every sound in the section the playhead starts in. T2 is the next section, ready at least one bar before its boundary. T3 is the rest of the arrangement, loaded at idle. T4 is the next plan step's sounds and the next stem candidate, at the lowest priority and cancellable. `planLoads(song, position, step)` returns the ordered list.
- **Events:** `clip-arrived(key)` and `clip-replaced(key)` fire from the store. The engine re-lays only the affected tracks, at the next bar.
- **Warm-up** runs from an effect keyed on the committed song (`song.id + kit + clipKeysFor(song).join("|")`), never from a ref, and never re-parses localStorage.
- **Tone leaves the first bundle.** Move `vaultKeysOf` and `clipKeysFor` into a Tone-free module so `app/page.tsx:13`, which imports `lib/account/clips.ts`, which imports `lib/engine` at `:7`, stops pulling Tone in. Install the studio context with `setContext(ctx, true)` so the default context is disposed. Once Tone is split out, the first `import()` is a real network request, so arming must still happen before the press.
- **One sample rate, end to end.** Default to a 44,100 Hz studio context: decode measured 375 ms at 44.1k against 1,320 ms at 48k, and every asset is already 44.1k. Switch to the device rate only if an A/B on Brady's machine shows the output resampler costs more render capacity or underruns than per-buffer resampling.

### 5.2 Ready-gated, bar-addressed scheduling (extend Engine and Rig; do not rewrite them)
- **Boundaries:** content lands on the next bar. Sections, arrangement, tempo, loop and goto land on the next 4-bar phrase, or the next bar inside a loop shorter than 4 bars. Volume, pan and sends land on the next beat. Stop, pause, mute and solo act at once with a 10 to 20 ms ramp.
- **Mechanism:** `Transport.scheduleOnce(cb, "<tick>i")` under the existing latest-wins ticket. Inside the callback, use its `time`. Never set `.value` or call `rampTo()` without a time inside a transport callback.
- **Ready gate:** a track whose buffer is not decoded is not laid. When `clip-arrived` fires, it re-lays at the next bar. A pending drum clip keeps its previous voice, never the kit stand-in.
- **Spans are clock state.** When a span is laid mid-span, or after a goto or a loop change, start it at the next bar with offset = ((nextBarBeat - span.startBeat) mod lengthBeats) × beatSec. Grains follow pause, goto and tempo. Prefer pre-stretched buffers (rendered offline once per clip and tempo, keyed by content) over GrainPlayer at a rate other than 1. If a GrainPlayer stays, put its loop points on zero crossings.
- **Automation** returns to base at every section start and at the loop wrap. `tune` and `applyMaster` skip any parameter with an automation segment active at the current beat. A segment starts from the current value with a ramp, not a jump.
- **Content addresses** hash note durations at 960 PPQ (`steady.ts:12`).

### 5.3 A deterministic start
- `Engine.arm(song)` runs before the press: `prepare`, then a chunked voice build (one voice per task with MessageChannel yields, the pattern already in `lib/engine/offline.ts:27-40`), then it lays the current and next section onto the stopped transport. The press only resumes the context and starts the transport at a mark, inside the gesture.
- **The greeting has no race.** Its first sentence is fixed text. Fetch its PCM during the landing and cache it by text and voice id. On the press, the greeting starts at t0, and the transport (silent on a blank record, running on the lane's home grid) starts at a fixed mark on the audio clock. Step 0's pulse then joins on a bar.
- **A song switch** uses the same chunked build and swaps at the next bar.

### 5.4 The clean desk
- **Master:** a real limiter from `Tone.Compressor` (knee 0, ratio 20, attack 1 to 3 ms, release 50 to 100 ms), then a soft ceiling whose input is pre-scaled by 0.5, with the curve `CEILING*tanh(2u/CEILING)` and `oversample: "4x"`, so inputs up to +6 dBFS stay inside the curve's domain. Lower the makeup until the seed measures -10 to -8 LUFS with no flat tops.
- **Drums:** per-hit gain and rate at `t` (`ToneBufferSource.start(t, offset, duration, gain)` and `playbackRate.setValueAtTime(rate, t)`).
- **Retire:** fade from an explicit audio time, and dispose after the fade has ended on the audio clock.
- **Duck and gate:** `cancelAndHoldAtTime` plus 2 to 5 ms ramps, never steps. One-shots get a 5 to 10 ms fade-out on retrigger. Cut fills clip note durations at the cut, so the gap is silent.
- **Nodes:** a voice builds only the devices it uses, and the device set is part of `voiceSignature`. Meters run only while the board is visible. Budget: under 600 native nodes for the seed.
- **One realtime context:** the voice plays on its own bus inside the studio context, before the final limiter, with a jitter buffer and pipelined sentence fetches. The mic is read with an AnalyserNode in the same context (no ScriptProcessor), and its level lives in a ref, not in React state.

### 5.5 The main thread
- The vault effect depends on `[clipKeys, uid]` only, reads `vault` and `studio` through refs, and sets `missing` only when the joined keys change.
- localStorage is written on commits only, in an idle callback. The Board's loop mounts once. The critic is keyed on structure, waits for 20 s of idle, and every paid route gets the mock guard.
- `hear()` never runs on the main thread while the record plays. The reference comes from the worker's facts. Stems are stored as bytes on arrival and decoded when a track uses them (only the used region, vocals first when a chop is pending). The synchronous stems sum at `useStems.ts:103-108` goes away.
- Kokoro never loads at page open (`app/page.tsx:42`). It loads only after a paid-voice failure, and never while the record plays.

### 5.6 The ledger, which is the debugger (`lib/engine/ledger.ts`)
- **Asset events:** `{key, kind, why (track, section, plan step), tier, requestedAt, source: memory | idb | http | network, decodedAt, readyAt, dueAt, firstHeardAt, sampleRate}`.
- **Landing events:** `{jobId, requestedAt, prepareMs, boundary, landsAtBar, landedAt, partsChanged, voicesBuilt, voicesRetired}`.
- **Live counters:** `AudioContext.playbackStats` underruns (Chrome 153 has no `renderCapacity`), IndexedDB opens per second, React commits per second, and the rig's `late` count.
- It is exposed as `window.__ledger` under `?e2e=1` and `?trace=1`. Under `?trace=1` the board shows an overlay timeline: every sound from requested to ready to due to heard, and every job from queued to landed at its bar. The probes assert four things: no asset is due before it is ready, every lay lands on its boundary, each key decodes once per load, and an idle record makes zero IndexedDB opens.

### 5.7 Constraints you must honour
- Keep the rig's model and extend it: one desk per session, voices keyed by `voiceSignature` and tuned in place, parts content-addressed (`steady.ts:8-21`), latest-wins tickets (`steady.ts:26-44`), and `wrapToBar` (`steady.ts:51-60`). Rig construction and `apply` stay synchronous, because the offline ears drive the same Rig and the offline context is global only inside one synchronous step (`offline.ts:9-15`).
- Tone Parts started on a running transport fire only ticks after the current position. Anything that depends on an event already passed (spans, held notes, automation) needs an explicit catch-up.
- A WaveShaper covers only input in [-1, 1]. `Tone.Limiter` cannot take a knee.
- The audio can only start from the press: `enter()` calls `voiceOut.warm()` and `boot()` awaits `Tone.start()`. Arming before the press is fine. iOS Safari has not been measured by anyone, so check it on a device before relying on any of this there.
- A 4-minute stereo stem decodes to about 85 MB, and `MAX_SECONDS` 480 (`worker/app.py:14`) allows about 170 MB. Decode lazily and pin only what the record plays.
- The probes rely on today's shapes of `window.__audio`, `__levels`, `__engine` and `__steps`. Keep those shapes.

---

## 6. The build, in phases

Work on a new branch, `loading`, cut from `crackle` at 0a049da. Commit each phase locally when its DONE WHEN passes. Do not start a phase before the previous one passes, except where a phase says it is independent.

### Phase 0: the ledger, the probe and today's numbers
**WHAT** Add `lib/engine/ledger.ts` and wire it into the store, the engine and the rig. Promote `~/dev/producer-web-progress/loading/load.probe.mjs` and `stub-proxy.mjs` into `tests/`, and add `npm run load`. Add the mock guard to `/api/critic`, `/api/research`, `/api/attend` and `/api/step`. Log today's numbers from section 7 in `docs/GYM_LOG.md`.
**WHY** Law 8. The harnesses spend the house key until the guard exists.
**DONE WHEN** `npm run load` prints every section 7 metric from the ledger, and a mock run makes zero paid calls.

### Phase 1: stop the render loops
**WHAT** Fix the vault effect (section 5.5), the mic level ref, the localStorage writes on commit, the Board's loop mounted once, the critic keyed on structure, and one cached IndexedDB connection with `hasClip`.
**WHY** RC2. This removes 40 to 58% of the main-thread load, which otherwise pollutes every later measurement.
**FILES** `app/page.tsx`, `hooks/useVault.ts`, `lib/engine/clips.ts`, `hooks/useSpeak.ts`, `hooks/useStudio.ts`, `components/Board.tsx`, `hooks/useCritic.ts`.
**DONE WHEN** A record with a chop playing untouched for 60 s shows 0 IndexedDB opens per second and under 1 App commit per second.

### Phase 2: the clean desk (independent of loading, so it can run in parallel with Phase 1)
**WHAT** Everything in section 5.4 except the node budget and the single context: the limiter and ceiling, per-hit drum gain, retire at an audio time, duck and gate holds, one-shot fades, silent cuts, automation from the current value, no snapback, and return-to-base.
**WHY** RC4. This is the crackle Brady hears, and judging anything later by ear needs a clean desk.
**FILES** `lib/engine/board.ts`, `voices.ts`, `rig.ts`, `schedule.ts`.
**DONE WHEN** An offline render of the seed shows 0 samples on a flat top, a true peak at or below -1 dBFS, -10 to -8 LUFS, drum onset correlation of 1.0 with its own velocity, no discontinuity on a pad swap, and the master at base after the loop wrap.

### Phase 3: one asset store
**WHAT** Section 5.1: the store, the keys, the tiers, the events, the immutable `/samples` headers, the warm-up keyed on the committed song, Tone out of the first bundle, the default context disposed, and seeded kit noise.
**WHY** RC1 and laws 2 and 3.
**FILES** new `lib/engine/assets.ts`; `clips.ts`, `samples.ts`, `kits.ts`, `engine.ts`, `context.ts`, `next.config.ts`, `lib/account/clips.ts`, `hooks/useStudio.ts`.
**DONE WHEN** Across 10 cold loads, every key decodes exactly once. On a reopened sample-kit record, the manifest and kit are ready before the press and press to transport is under 300 ms. A warm reload sends 0 bytes for `/samples`. Only the studio context is open after the press.

### Phase 4: the transport-time contract
**WHAT** Section 5.2: boundaries, the ready gate, re-lay on `clip-arrived`, span catch-up, grains on the transport, automation rules, and 960 PPQ hashing.
**WHY** RC3 and laws 4 and 5. Depends on Phases 2 and 3.
**FILES** `lib/engine/engine.ts`, `rig.ts`, `schedule.ts`, `steady.ts`, `voices.ts`.
**DONE WHEN** A hat change lands on beat 1 in 10 of 10 tries. The outro fade survives a move. A loop added mid-section, and a loop region of bars 5 to 8, are audible within one bar. A restored clip becomes audible on the next bar with no other change.

### Phase 5: a deterministic start
**WHAT** Section 5.3: `Engine.arm`, the chunked build, the cached greeting, the fixed start order, and bar-swapped song switches.
**WHY** RC2 and RC5, and law 9. Depends on Phase 4.
**DONE WHEN** Over 10 reloads the order is identical: greeting, then transport. No first-word hole, and no long task over 50 ms from the press to bar 2.

### Phase 6: the audio-thread budget and one context
**WHAT** Voices build only the devices they use, meters run only when visible, the voice and mic move into the studio context, the voice gets its jitter buffer and pipelined sentences, and the sample-rate A/B runs.
**WHY** RC4 and law 7. Depends on Phases 2 and 4, because voice swaps must be click-free and bar-aligned first.
**DONE WHEN** The seed runs on under 600 native nodes, sentence holes are under 150 ms, there is one realtime context, and render capacity and underruns are measured on Brady's machine and logged.

### Phase 7: arrival bursts and memory
**WHAT** Stems decode lazily, the reference comes from worker facts, the LRU pins what plays, IndexedDB gets a meta store and eviction plus `persist()`, and cut ids are content-addressed.
**WHY** RC1 and RC2 at scale. Depends on Phase 3.
**DONE WHEN** While a 10-stem job lands mid-playback, late notes stay at 0 and underruns at 0, with the heap peak recorded.

### Phase 8: one plan and one job queue
**WHAT** Sections 3 and 4: `lib/song/plan.ts`, prompt text rendered from the plan, routing on the user's words, the typed build control, the FIFO job queue with landing promises, cancel wired to stop, undo, new and open, sequential steps, each step looping its target section with its gate, `hearNow` returning the in-flight promise instead of null, auditions that keep the music playing, and the progress bar states.
**WHY** RC5 and laws 1 and 10. Brady's "which beats first" and "keeps adding without my feedback" both live here. Depends on Phases 1 and 4.
**FILES** new `lib/song/plan.ts`; `lib/brain/rollouts.ts`, `persona.ts`, `contract.ts`, `process.ts`, `voice.ts`, `local.ts`, `flow.ts`; `lib/song/ritual.ts`; `hooks/useRollout.ts`, `useRitual.ts`, `useConversation.ts`, `useStudio.ts`; `app/page.tsx` (the progress bar).
**DONE WHEN** 20 build prompts in mock mode give the same step order. Every step lands on beat 1 of its target section. Each gate waits for a verdict or its 30 s window. "Stop" mid-build cancels it. No control is dropped in `__voice`. On a blank record, the first sound comes under 3 s after the first naming utterance.

### Phase 9: determinism cleanups
**WHAT** Temperature 0 to 0.3 on `/api/chat` and `/api/step`, a fixed model per plan step (logged), `forceEconomy` and `researchRef` reset on new and open, research awaited with a recorded outcome, and `humanize.seed` defaulting from the song id.
**WHY** Law 9. It comes last because it changes results, not timing, and is easiest to verify once runs repeat.
**DONE WHEN** The same prompt on the same record gives the same ops in 5 of 5 mock runs.

### Phase 10: the listening pass, then Brady's go
**WHAT** Run every gate from a clean build. Then take one real measurement in Brady's own Chrome on his own output device: render capacity, underruns, the device sample rate, and a loopback capture of the voice talking over the drop. Listen to the whole song end to end.
**DONE WHEN** It is clean by ear and by the numbers. Merging `crackle` and `loading` into main, the one push, `npm run deploy`, and the worker's `railway up` are each Brady's call.

---

## 7. The numbers to hold

| What | Today (measured 2026-09-26) | Target |
|---|---|---|
| IndexedDB opens per second, clip record playing | 50 to 411 | 0 |
| App commits per second, playing untouched | up to 183 | under 1 |
| Main-thread script, clip record | 390.7 ms/s | under 40 ms/s |
| Seed samples on a flat top | 1.57 to 1.63% at -2.85 dBFS | 0, true peak at or below -1 dBFS |
| Drum onset correlation with its own velocity | -0.63 | 1.0 |
| Pad swap | a pop, then silence up to 16 beats | no discontinuity, no gap |
| Master after the loop wrap | -18.00 dB | base |
| Where a change lands | the next 16th, 157 to 274 ms, anywhere in the bar | beat 1 of the next bar, 10 of 10 |
| Native nodes, seed / 12 tracks | 1,769 / 2,421 | under 600 / under 1,000 |
| Realtime AudioContexts after the press | 3 (4 after the mic) | 1 |
| Press to transport, reopened sample-kit record | 635 to 920 ms | under 300 ms |
| Decodes per key per page load | 1 to 2 | exactly 1, across 10 loads |
| `/samples` cache | `max-age=0`, 8 revalidations per reload | immutable, 0 requests on reload |
| Greeting vs record order | flipped in 2 of 4 real-voice starts | identical 10 of 10 |
| First-word hole / sentence holes | 149 ms / 325 to 1,765 ms | 0 / under 150 ms |
| Places the build order lives | 9 | 1 |
| Blank record to first sound | tens of seconds to minutes | under 3 s after the first naming utterance |
| Paid critic calls in 60 s of play | 6 (unguarded) | 0 in mock; structure-keyed and idle-debounced in prod |
| Late notes (rig counter) | 0 | 0 |
| Underruns on Brady's machine | never measured | 0 in 5 minutes of the seed drop |

---

## 8. Traps

- **Harnesses always run muted.** Chrome gets `--mute-audio` and the app gets `?e2e=1`, every time. A harness once spoke out loud on Brady's Mac over and over.
- **Paid routes.** Until Phase 0 lands, run the server as `ANTHROPIC_API_KEY= npm run serve:mock` behind `stub-proxy.mjs`, which stubs `/api/speak` and returns 503 for the four unguarded routes.
- **Port 3111.** Check `lsof -nP -iTCP:3111 -sTCP:LISTEN` and stop only your own pid. Never `pkill -f next-server`: it has killed another project's servers. Never run two harnesses at once, because they share ports.
- **Machine load.** Record `uptime` before every run. Numbers taken at a load average over 20 are marked as under-load, never used as a gate.
- **Headless is not Brady's speakers.** Headless Chrome's underrun counts are a lower bound. The crackle gate is his real Chrome.
- **Do not rewrite `rig.ts`.** Extend it (section 5.7). Do not put the playhead in React. Do not add a second listen path.
- **Tone timing.** Pass an explicit time for everything: no `.value` writes and no bare `rampTo()` inside a callback.
- **Clip ids are a contract** with saved records and the vault. New id schemes must keep old ids loadable.
- **The uncommitted `data/dna/*.json`, `data/galton.json` and `worker/__pycache__`** belong to the learning lane. Never stage, stash or reset them.
- **Pushes.** Commit locally per phase and push once when the work is done. `crackle` is not merged or deployed, and the live site runs pre-smooth code (the c7046a1 era). Deploying is Brady's call. `railway up` kills in-flight learn jobs.
- **User-facing copy** (spoken lines, flash lines, the progress bar) uses full sentences and never an em or en dash.

---

## 9. Not now

Not the full collaborative first 15 to 20 minutes (Phase 8's gates deliver its core: the producer asks after every layer). Not the meter (fixed on `crackle`). Not the Splice lane, the DNA store, the Galton work or the learning lane. Not a new UI, not worker changes, not new genres. If a phase's DONE WHEN will not pass, measure why, fix it inside the goal if the fix is targeted, and otherwise stop and say so.
