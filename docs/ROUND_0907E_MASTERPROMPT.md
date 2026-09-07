# ROUND 2026-09-07 E: five dollars a song. The hard parts get the best model, the easy parts get the cheap one.

Brady's brief: "it needs to cost around 5 dollars to make a song. Not a set limit, a general idea. The difficult parts use a good model, the easy parts use a non-expensive model, based on the system we have created."

This document is the plan. Everything in it is grounded in the code as of commit 668dcec and in Anthropic's list prices on 2026-09-07. Nothing here is built yet.

## 1. The bill today, call by call (measured from the code)

Prices per million tokens: Opus 5 in $5, out $25, cache read $0.50, cache write $6.25. Sonnet 5 in $2, out $10, read $0.20, write $2.50. Haiku 4.5 in $1, out $5, read $0.10. Web search $10 per 1,000 searches.

The system prefix every brain call carries (persona + contract + process + mind), measured: 94,190 characters, about 24,800 tokens. The contract is 6,800 of that and has grown with every feature; the mind is 15,000. It is cached with one breakpoint on the last block, five minute TTL.

| Call | Route, model today | What it sends besides the prefix | Output | Cost per call, estimated |
|---|---|---|---|---|
| Conversational move | /api/chat, Opus 5, effort low, web_search tool attached to every call | song block 3 to 6k tokens uncached, facts 0.5k, lane and DNA 0.5k, skills 0 to 3k, last 24 messages 3 to 6k | say + ops 300 to 1,500 tokens | $0.06 to $0.12 (Sonnet: $0.025 to $0.05) |
| Cold cache write | any route, first call after a 5 minute gap | the whole prefix written again | | $0.155 on Opus, $0.062 on Sonnet, per cold miss |
| Rollout step | /api/step; blueprint, bass, verdict, extend, fix on Opus; drums, harmony, hook, craft, mix on Sonnet | scoped song, facts, recipe | blueprint writes a full song, 6 to 10k tokens; others 500 to 2k | blueprint about $0.35, other deep steps $0.08 to $0.10, fast steps $0.03 to $0.05; each step may retry once on a failed check, plus a truncation retry |
| Critic note | /api/critic, Sonnet 5 | role + contract + process (8.5k cached) + song | 800 | about $0.02, keyed on real song changes |
| Attention | /api/attend, Haiku 4.5, 5 output tokens | the sentence | 1 word | about $0.001 per utterance |
| Verify | /api/chat again, Opus, only when the ears say the move missed its own expectation | as a move | as a move | as a move, conditional |
| Initiative | /api/chat, Opus, after two quiet minutes, at most every six | as a move | as a move | rare |

A typical voice-built song today: 30 moves + 1 rollout + 20 critic notes + 40 attention checks, on the tuned setup, about $4 in brain tokens; a long session (80 to 100 moves, a rebuild, two references) runs $8 to $12. Speech (ElevenLabs) is separate, about $0.50 a session. Where the money goes, in order: the uncached song block on every Opus move, the prefix cache re-writes after pauses, the blueprint's full-song output, the 24-message window, then everything else.

Nothing meters this. The routes receive `usage` from the API and drop it. The first deliverable is a meter, because a target without a meter is a wish.

## 2. The target and how it is measured

- A finished record, built by voice in one session, costs about $5 in brain tokens at p50 and under $8 at p90, with the producer no worse on the ears than today.
- Measured by a `usage` table written by every brain route (owner, project, route, model, input, cache_read, cache_write, output, web_searches, cost_usd, at), a live "this record so far: $1.84" meter on the listen side, and a per-song line on the scorecard. The gym harness prints the cost of every song it builds.
- Quality is measured by what already exists: the rollout step checks (the ears grade every step: hook present, loudness in band, low end shape), the verdict, the brain battery (11 asks), and verify-after-move pass rates. A change that saves money and fails more checks is reverted.

## 3. The tier map: which calls earn which model

Rule: the model tier follows the musical judgment in the call, not the route. Anything that decides what the record IS gets Opus. Anything that edits a known thing inside a known frame gets Sonnet. Anything that is words about the record, not the record, gets Haiku.

| Tier | Model, effort | Calls |
|---|---|---|
| A, judgment | Opus 5, effort low (blueprint at medium, measured) | blueprint (the whole record from a sentence), emulate against a reference, verdict, extend and fix-section, any conversational move that changes the song's identity: new section, new arrangement, "make it feel like X", taste words across more than one track, a lane change; the fix after a failed verify |
| B, craft | Sonnet 5, effort low | drums, harmony, hook, craft, mix steps (already); ordinary ops moves: one or two tracks, a parameter, a swap, a pattern, "louder", "darker", "add a clap"; the critic; the record breakdown (turning the listening report into prose); the tracklist narration; sound search follow-ups |
| C, words | Haiku 4.5 | attention (already); reactions and questions that change nothing ("what did you change", "is that the hook", "nice"); the interview at the start of a session; the title ask; greetings and "where were we"; the one-line acknowledgements after a hidden system message (record pulled in, vocal rendered, identified) |

The router decides the tier BEFORE the call, deterministically, from signals the studio already computes: the attention intent (command, talk, ignore), the quick gate, `rolloutIntent`, `tryLocal` (instant words), the roles named in the sentence, the taste words, whether a reference is loaded, and whether the song is blank. Talk goes to C. A command that names one or two roles or one parameter goes to B. A command with rollout intent, a lane, an artist, a section, a reference, or more than two roles goes to A. Unsure goes to B with escalation.

Escalation, the pattern the cost guide measured (93 percent pass for $0.70 per task by running everything cheap and re-running failures at the higher tier, against 91.7 percent for $1.39 running everything at the default): a tier B move that applies zero ops, or whose verify fails, or whose step check fails twice, is re-asked once on tier A with the failure attached. The harness counts escalations; a route that escalates more than a fifth of the time is misrouted and moves up permanently.

Per-user choice in Settings: Best (Opus for A and B, the way it works today), Balanced (this map, the default), Economy (Sonnet for A too, the harness setting). BYOK users pay their own key either way.

## 4. Free wins first, in this order (the guide's order: caching, input, loop hygiene, output; then effort; model last)

1. Meter everything. `usage` table, cost per call from the usage fields at list prices, the meter in the UI, the scorecard line, the harness assertion. Two hours. Nothing else is measured without it.
2. Prefix cache TTL one hour on every route. A voice session has gaps longer than five minutes; every gap re-writes 24.8k tokens at $0.155 on Opus. A one-hour write costs twice a five-minute write and pays for itself on the first prevented miss.
3. The song block diet. Today every move carries every track's full patterns. Send a per-track summary (role, name, pattern names, note count, volume, key sends) for the whole song and the full detail only for the tracks the sentence names or the step scopes; the step route already scopes, the chat route does not. Expected: 3 to 6k tokens to 1 to 2k per call, the single biggest saving on tier A moves. Prove: the brain battery still passes and rejected-op rate does not rise.
4. The conversation window. 24 messages to 10, plus the project's running summary (projects.summary already exists) as one line at the top of the user block. Expected: 2 to 4k tokens off every call.
5. Prompt diet on the contract. It is 6,800 tokens and every feature added a paragraph. Move the paragraphs that only matter per intent into the skills mechanism that already loads per intent: hum, slice, sliced drums, analyze and finder, identify and tracklist, vocal, deep listen, sound search. The contract keeps the ops grammar, the response format and the transport. Expected: contract to about 3,500 tokens; cache reads and writes fall with it. Prove: the battery, the rollout checks, and every harness pass unchanged.
6. The mind diet, carefully. 15,000 tokens of laws, numbers, grammars, DNA and taste. Split into a core the producer needs on every call (laws, grammars, the process checklist, about 5k) and lane and topic blocks loaded when the song is in that lane or the sentence names the topic, through the same skills loader. This is the riskiest diet because the ears cannot grade taste; do it last among the free wins and A/B it with the verdict step.
7. Web search only when asked for. The tool is attached to every chat call; attach it only when the sentence names an artist, a record or a link (the detectors `findReference` and `artistDna` already run). Saves the tool schema on every call and stray searches at a cent each.
8. Output shape. Blueprint stays a full song; every other step and move must answer with ops only, never a song. The step route already retries a cut-off reply; keep it, and log the retry as its own usage row so its cost is visible.
9. Critic cadence. It already keys on real changes. Add: not during a rollout (the steps have their own checks), and at most once per two minutes of moves.

## 5. Then the tradeoffs, one at a time, measured

10. Effort sweep on the same model before any model change. Blueprint at medium versus low on Opus (the one call where more thinking may buy a better record); every other call stays low. Read the rollout checks and the verdict.
11. The tier map from section 3, with the router and escalation. Measure on the harness: cost per built song, step check pass rate, escalation rate, battery pass rate, before and after.
12. Only if the ears agree: tier C on Haiku for the "words" calls. Never on anything that emits ops.

## 6. Guardrails

- A per-user daily cap on the house key (default $10) with a plain message and the path to their own key; BYOK has no cap.
- The harness runs in economy mode (as now) and asserts cost per built song under $3 at that setting; a balanced-mode run of the same harness is the weekly number that answers Brady's question with a measurement.
- Never a Claude Max login as the key (terms, and it rate-limits Opus at once). Never Haiku on a call that writes ops. Never trim the mind without the verdict A/B.
- Every lever is its own commit with the before and after numbers in docs/GYM_LOG.md, so any one can be reverted alone.

## 7. Order of execution and the proof lines

1. Meter (usage table, cost math, UI meter, scorecard line, harness assertion). Proof: a harness song prints its cost; the meter moves during a move.
2. Cache TTL one hour. Proof: `cache_read_input_tokens` dominates `input_tokens` on the second call after a six minute pause.
3. Song block diet. Proof: median tokens per move before and after; battery 11 of 11; rejected ops unchanged.
4. Window to 10 plus summary. Proof: tokens per move; the producer still remembers the record's name and the last two moves in the battery's memory asks.
5. Contract to skills. Proof: prefix tokens; every harness green.
6. Web search gated. Proof: tool present only on reference asks in the request log.
7. Router and tiers with escalation. Proof: cost per built song (economy, balanced, best), step check pass rates, escalation rate under 20 percent.
8. Mind split, A/B on the verdict. Proof: verdict scores equal or better on five songs each.
9. Cap and Settings modes. Proof: the cap message on a throwaway user; a mode switch changes the model in the usage rows.

Expected outcome if every lever lands: the same 30-move song at about $2, the long session at about $5, and a live number on the screen for every record so the next question is answered by looking, not estimating.
