# THE PRODUCER MASTERPROMPT: smooth as butter

You are taking over an AI music producer that already works and already sounds like something. Your job is not features. Your job is that the music never stutters, the product never makes anyone wait, and the machine works the way a real producer works, because we went and watched one.

Repo: `~/dev/producer-web` (Next.js, Tone.js, a Python stems worker on Railway, Supabase). Read this whole file before you touch anything. Every file path below was verified by reading the code on 2026-09-22.

---

## 1. What a human actually does (measured, not guessed)

On 2026-09-21 we ran local ears over 31 minutes of a real producer, Sam, flipping a famous vocal over a beat while Brady watched. Full evidence: `~/.dictation/producer/learning/2026-09-21_2313/LEARNINGS.md`, with the labeled transcript beside it. This is not a theory of how music gets made. It is what happened, in order.

1. **Source, tempo first.** 23:14:47, him: "The tempo of the song, What's Next by Rick." He names the record and asks its tempo before touching anything else. Every music read all night sat at 128 bpm. One grid, decided first.
2. **Chop.** 23:15:09: "I'm making a chop," said three times.
3. **Loop the vocal alone, and sing it back.** 23:15 to 23:17 the chopped phrase runs on repeat with nothing under it while he sings it back twice. He learns the phrase by mouth before he builds under it.
4. **Hunt clips quietly, for ten minutes.** Small reactions only: "Oh, that's a good one." The tool is named later, at 23:43: "What software is that? Splice." Brady's question in the room, and the real bottleneck: "How do you grab just like a good clip?"
5. **Bring the beat to the vocal, at the vocal's tempo.** 23:27:02: "Let's go. To the beat."
6. **Let it run while life happens.** 23:28 to 23:34 the loop plays under six minutes of unrelated conversation. The maker's silence is not a stop.
7. **Verdict in one spoken line, socially, inside 30 seconds.** 23:35:02, him: "I kinda like that." Brady answers with a reference: "sounds like that Michael Jordan song."
8. **Layer, then go.** 23:36 the vocal lands over the beat, and in the same breath: "I'm going to go to the next one." Candidates are a stream. He swaps before he polishes.
9. **Short passes, and a mute-to-listen.** Two to five passes per loop. At 23:40:32 everything is pulled down at once (bass down 11 dB, chords down 13, hats down 8, snare down 6) to hear the seed again.
10. **A second record inside the half hour.** 23:42, a different lyric in G minor, same 128 grid, seven minutes after the first verdict.

### The seven laws

1. **Decide the grid first.** Ask the source record's tempo and key before you make a single sound, and put everything on it.
2. **The vocal is the seed.** Loop the chop alone before anything is built under it, and check it by singing it back. If it cannot be sung, it is the wrong chop.
3. **The beat comes to the vocal.** Build at the vocal's tempo. Never ask the vocal to move.
4. **Judge in one line, out loud, inside thirty seconds,** and say taste as a reference to a record, not as an adjective.
5. **Go to the next one.** Stream candidates. Swap before you polish. Three passes without a verdict means the idea is wrong, not that it needs work.
6. **Mute to listen.** When the picture gets crowded, pull everything down and hear the seed again.
7. **Never stop the music.** Silence from the human is not a stop. Talk, life and thinking all happen over a running loop.

---

## 2. Why the music is glitchy today

The scheduling core is not the problem, and you must not rewrite it. `lib/engine/rig.ts` already does the hard part correctly: voices survive a change, parts are content addressed by a hash of their hits (`hashEvents`, rig.ts:27), a swapped instrument crosses over in 15 ms (`FADE_SEC`, rig.ts:24), and a turned-off trance gate is restored by `tune` (lib/engine/voices.ts:156). The glitches are at the edges.

1. **The first sound waits on work nobody needed to wait for.** `Engine.start` (engine.ts:35) runs `await Tone.start()`, then `await this.prepare(song)`, and only then starts the transport. `prepare` (engine.ts:121) decodes every clip the record references and renders the drum kit through six `OfflineAudioContext` passes (`renderKit`, kits.ts:44). The user presses the one button and hears nothing while that happens.
2. **Two changes can race.** `Engine.update` (engine.ts:51) is async, awaits `prepare`, and holds no sequence guard. Two quick ops interleave two `lay()` passes over one rig, and an older record can land after a newer one. The listening path already solved this exact problem with a latest-wins guard (`hearNow`, useStudio.ts:146). The engine never got the same treatment.
3. **A shortened record jumps mid-bar.** `lay()` (engine.ts:140) does `if (pos > end) this.transport.ticks = pos % end`. That modulo lands anywhere, including the middle of a beat. The ear hears a stumble.
4. **Stop cuts the tail.** `Engine.stop` (engine.ts:48) calls `transport.cancel()` and tears the rig down, and `Rig.dispose` (rig.ts:201) disposes every voice at once. A ringing reverb or a held pad is chopped off. There is no master fade.
5. **An audition can be louder than the record and can clip.** `previewClip` (engine.ts:102) does `new Tone.Player(buf).toDestination()`, which bypasses the entire master chain built in `board.ts` (compressor, makeup, limiter, soft clipper) and the duck bus. It also starts with no ramp.
6. **The duck is global.** `duck()` (engine.ts:111) ramps `Tone.getDestination().volume`, so it ducks previews, auditions and anything else sharing the destination, not just the music bus.
7. **Overlapping risers share one envelope.** The riser part mutates `synth.envelope.attack` inside the audio callback (rig.ts:147). Two sections whose risers overlap fight over the same object.

---

## 3. Why the product has friction today

1. **The greeting waits for the audio graph.** `boot()` (useStudio.ts:528) dynamically imports the engine, awaits `eng.start`, and only then speaks. The first thing a new user experiences is a pause of unknown length with nothing said.
2. **The first listen is deliberately late.** `refreshEars(songRef.current, 2500)` (useStudio.ts:548) delays the first measurement by 2.5 seconds so it does not fight the first bar. Correct instinct, wrong mechanism: the render should move off the critical path, not be delayed.
3. **The producer interrupts too soon.** The initiative timer fires after two minutes of quiet (useStudio.ts:523). The human we watched worked through six minutes of unrelated conversation with the loop running. Two minutes of quiet is normal, not a cue.
4. **Nothing in the product matches "go to the next one."** `useStems` already holds ranked `candidates` (useStems.ts:34, 483) and a `grab` that pulls a part of a heard record into this one (useStems.ts:217), but there is no op, no voice control and no card that means "play me the next candidate."

---

## 4. What the ears get wrong

The browser ears are good and should be trusted. `estimateTempo` (lib/ears/rhythm.ts:44) does harmonic summation with explicit impostor rejection and a dance prior, and returns `confidence` and `alt` (lib/ears/facts.ts:50), which reach the UI (lib/ears/browser.ts:25).

The Python worker is the weak one, and it is the path that hears real records. `worker/analysis.py:58` calls `librosa.beat.beat_track` and reports a single bpm with no confidence at all, then folds octaves blindly. We just measured this exact failure class in our own local ears the same night: a beat tracker returned a constant default on imperfect audio, nothing flagged it, and a whole session of loop identity was wrong. The fix that worked was estimating tempo from the separated drums with onset-envelope autocorrelation at a fine hop, plus a confidence value and a refusal to report below a floor.

There are also two implementations of hearing, `lib/ears/*.ts` and `worker/hearing.py`, with overlapping responsibilities. They will drift.

---

## 5. The build, in order

Do these in order. Do not start a phase before the previous one's DONE WHEN passes.

### Phase 0: write down today's numbers
**WHAT** Run `npm run serve` then `npm run glitch` and `npm run audible`, and paste the output into `docs/GYM_LOG.md` under today's date.
**WHY** You cannot claim smooth without a before.
**DONE WHEN** The log holds today's late-event count, thinnest scheduling margin, longest main-thread block, rebuild cost, graphs alive after stop, and master peak.

### Phase 1: seamless playback
**WHAT** Fix the seven edges in section 2. Specifically: warm the kit and the clips before the button is pressed; give `Engine.update` a latest-wins sequence guard modeled on `hearNow`; snap the shorten-jump to a bar; fade the master down 40 ms before teardown in `stop`; route `previewClip` through `board.buses.master` with a 5 ms attack ramp; move `duck` from the global destination onto the music bus; give each riser event its own envelope values or its own synth.
**WHY** Laws 7 and 3. A change must never be audible as a change.
**FILES** `lib/engine/engine.ts`, `lib/engine/rig.ts`, `lib/engine/board.ts`, `lib/engine/kits.ts`.
**DONE WHEN** `npm run glitch` reports CLEAN (zero late events, no leak), the longest main-thread block stays under 50 ms across ten moves, and `npm run audible` still passes.

### Phase 2: zero friction in the first minute
**WHAT** Start rendering the kit and decoding the seed clips when the landing page mounts, not when the button is pressed. Speak the greeting immediately and let the transport join underneath it. Move the first listen into the worker so it needs no delay. Raise the initiative timer to six minutes of quiet.
**WHY** Laws 7 and 4. The product must feel like the loop was already running.
**FILES** `hooks/useStudio.ts` (boot, refreshEars, the initiative interval), `components/Landing.tsx`, `lib/engine/kits.ts`.
**DONE WHEN** A cold load to first audible sound is under 2.0 seconds measured in `tests/audible.mjs`, and the greeting's first word is spoken before the transport starts.

### Phase 3: the human process, as real ops
**WHAT** Add what the laws need and the vocabulary lacks. Today `lib/song/ops.ts` has 32 ops and none of them is a chop; `lib/engine/slice.ts` can already cut a one-shot on a transient but is not in the op vocabulary. Add, as ops and as voice controls:
- `source` : name a record, fetch its tempo and key, and set the song's grid from it before anything else exists.
- `chop` : cut a phrase (not a one-shot) off a stem, store it as a clip, and put it on an audio track alone.
- `alone` : loop the chop with everything else muted, which is also the sing-back check.
- `beat` : build the first drums and bass at the source tempo, never at a default.
- `next` : play the next ranked candidate from `useStems.candidates` and keep the stream moving.
- `down` : pull every track except one down 10 dB for a listen, and bring them back on the next word.
**WHY** All seven laws. This is the observed process turned into things the machine can actually do.
**FILES** `lib/song/ops.ts`, `lib/song/types.ts`, `lib/engine/slice.ts`, `lib/brain/voice.ts` (VoiceControl), `lib/brain/parse.ts` (BrainAction), `hooks/useConversation.ts`, `hooks/useStems.ts`, `lib/brain/persona.ts` and `lib/brain/contract.ts`.
**DONE WHEN** A single scripted session in `tests/ritual.e2e.mjs` runs the whole observed order by voice: name a record, get its tempo, chop a phrase, loop it alone, build a beat at that tempo, hear a verdict prompt inside 30 seconds, say "next one" and get a different candidate, say "pull it down" and hear the seed alone.

### Phase 4: where the sounds come from
**WHAT** Three lanes, kept legally separate. Bring-your-own Splice through its official MCP server at `https://mcp.splice.com/mcp` (search by feel, build stacks, download samples; free accounts can search, downloads need a paid plan, one credit each, 100 per rolling 24 hours). Famous records through the user's own Tracklib account (stems, clearance on paid tiers, about 60 seconds, the user registers the derivative work). An owned starter library from Freesound CC0 and commissioned sounds, every file carrying its license in a manifest.
**WHY** Law 5 needs a real candidate stream, and finding a good clip is the actual job.
**FILES** a new `lib/sources/`, `app/api/find`, `hooks/useStems.ts`, `docs/` for the manifest.
**DONE WHEN** A sample pulled through a user's own Splice account lands in that user's own project with the certified license in their name, and a repo-wide audit finds zero third-party audio in our storage or our training data.

### Phase 5: the ledger learns from verdicts
**WHAT** Every move already logs through `lib/taste`. Make the verdict window match the human: a move is judged by what is said in the 30 seconds after it lands, and three passes without a verdict marks the idea dead rather than unfinished.
**WHY** Laws 4 and 5.
**FILES** `lib/taste`, `hooks/useStudio.ts` (verdict, lastMoveId), `lib/scorecard.ts`.
**DONE WHEN** A session's taste file shows verdicts attached to moves with their 30-second window, and a scripted three-pass-no-verdict case marks the idea dead.

---

## 6. The numbers to hold

| What | Today | Target |
|---|---|---|
| Late note events over ten moves | measure in Phase 0 | 0 |
| Longest main-thread block during a move | measure in Phase 0 | under 50 ms |
| Cold load to first audible sound | not measured | under 2.0 s |
| Graphs alive after stop | measure in Phase 0 | same as before start |
| Seconds from a new element to a verdict prompt | varies | 30 |
| Passes on one loop before offering a swap | unbounded | 3 |
| Quiet before the producer takes initiative | 2 min (useStudio.ts:523) | 6 min |
| Brain spend per record | governed at $5 (useStudio.ts:11) | unchanged |

---

## 7. Traps

- **Do not rewrite `rig.ts`.** Content-addressed parts, surviving voices, the 15 ms crossfade and the gate restore in `tune` are the result of a measured glitch hunt that took late events from 126 to between 1 and 5. Read `docs/MASTERPROMPT_V11.md` before you touch it.
- **Do not put the playhead in React.** The board reads the transport directly at 60 fps on purpose. A state update every 90 ms used to re-render the page eleven times a second and starve the scheduler.
- **Do not add a second listen path.** `hearNow` is latest-wins with a 500 ms debounce for a reason. Two renders racing is the studio competing with itself for the thread that has to hit the next beat.
- **Watch for silent-default estimators.** Any tempo, key or chord function that can return a plausible constant without a confidence value is the bug we already hit. Every estimate carries a confidence, and low confidence is said out loud rather than rounded away.
- **The Splice license is a hard line.** Terms of 2026-07-24, section 3.1.1.3: Sounds may not be used as AI training material, used in a manner competitive to Splice, transferred to third parties outside a finished work, or redistributed in isolation. We never host, cache, serve or train on Splice audio. Bring-your-own-account only. Full brief: `~/.dictation/producer/knowledge/splice.md`.
- **Harness gotchas.** `npx -y tsx` costs about 110 seconds of registry lookup before it runs a line; use the cached binary. Never run two end-to-end harnesses at once, they share a fixed Chrome port and the second kills the first.
- **GitHub Actions on Acuntel is out of paid minutes as of 2026-09-22.** Commit locally, prove locally, do not push or open PRs until Brady says billing is fixed.

---

## 8. Not now

Not a new UI. Not a mobile app. Not more lanes or genres. Not stem separation improvements. Not the DNA store, the Galton work or the learning lane, which already run. Not anything that needs a Splice partnership before Splice has answered in writing. If a phase's DONE WHEN will not pass, say so and stop, rather than widening the work.
