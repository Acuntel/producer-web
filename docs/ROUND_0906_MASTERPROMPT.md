# ROUND 2026-09-06: "Vibe music" - from glitchy demo to a product a producer pays for

Brady's brief (verbatim intent): use it as a user, find what is glitchy, fix it. Accounts; projects saved in the software like Google Drive; the user enters their own API key with outbound internet. Skills inside it that teach any model to analyze music better than a producer: break a song down, find its best pieces, the science of what makes a human dance, every genre. Analyze the AI-song companies. Pull one drum, one beat, one synth from a popular song (YouTube) and use it. Clean the data. Say it and it happens (Astra). Keep iterating until it is not glitchy and ready for consumers.

## What the live test found (2026-09-06, prod, Chrome, as a user)
1. A small edit ("make the bass darker") took 12.8 s of dead air before anything happened. The whole reply arrives at once. This is the single biggest "glitchy" feeling. Law 1 wants under 2 s.
2. The new song rollout measured -4.6 LUFS at peak 0.0 dBFS: crushed. The mix check had no upper bound on loudness. GLOW sits at -8.7 which is fine.
3. The hook step's JSON got cut off and the parser's fallback made the producer SPEAK the raw JSON out loud.
4. The arrangement-craft step had 5 ops rejected on both attempts and the retry never told the model which ops were rejected (only the check text). The same step on the seed song applied 11/11, so the rejections came from ids the model invented in its own new song.
5. The hook check demands lead/pluck/arp/audio; in hard-house the hoover stab IS the hook, so the step failed twice for doing the right thing.
6. The previous song's "listen for" hint stayed on screen across a new song.
7. A pattern-variant chip ("plain") renders at the right edge of a lane and reads as debug text.
8. No accounts, no projects: the library is one localStorage list keyed by title. Nothing survives a different browser.
9. The house API key pays for everyone; no way to bring your own.
10. Mic still auto-sends ambient speech (known, Brady's call).

## The build, in order (each phase ships and is re-tested on prod)
A. Glitch fixes: parse fallback never speaks JSON; step route retries a truncated reply; rejected ops feed the retry; hook accepts a stab hook in stab-led lanes; mix check gets a "too loud" bound; deterministic auto-leveler after hearing (target -8 LUFS in the drop); stale hint cleared; variant chips only for real playlists.
B. Instant feel: /api/chat streams. The "say" sentence is parsed the moment it closes and spoken while the ops finish. First words in about 2 s instead of 13.
C. Accounts + projects + BYOK on Supabase (new project ref eqskttzzncshzplpzwzi, org "The Producer"): email sign-in, projects with versions (every auto-save is a version), a Projects browser (open, rename, duplicate, delete, new), Settings with the user's Anthropic key (validated live, AES-GCM encrypted at rest with a server key, never logged) and optional ElevenLabs key. Routes use the user's key when present and fall back to the house key. Local storage becomes a device cache; first sign-in imports it.
D. Skills: knowledge/skills/*.md compiled into lib/brain/skills.ts and injected per intent (song breakdown, dance science with citations, sampling and stems, vocals, genre index). Kept out of the cached system prefix so caching survives.
E. Song analysis and stems: a Railway worker (yt-dlp + demucs + onset slicing + librosa) behind /api/stems. Paste a link or upload a file; get stems, a drum kit of one-shots (kick, snare, hat) from THAT record, its tempo and key, and the "best 8 bars" by energy. Personal-use framing; the original is never stored past the job.
F. Clean data: Supabase schema replaces the localStorage pile; taste ledger and A/B pairs become rows per user.
G. Loop: unit tests, e2e, screenshots at 390 and 1440, brain battery, deploy, re-test on prod as a user, repeat.

## Gates before any deploy
tsc clean, next build, unit tests, node tests/e2e.mjs, brain battery, cdp-shot at 390 and 1440 LOOKED AT.
