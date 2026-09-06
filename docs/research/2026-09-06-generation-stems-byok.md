# Generation APIs, self-hostable song models, YouTube-to-stems, and BYOK (research, 2026-09-06)

Scope: the four questions the lead asked on 2026-09-06 for The Producer (`~/dev/producer-web`, Next.js + Tone.js + Claude brain, Vercel, no server workers yet). This pass does NOT redo the 09-01 perception research (`docs/EARS_MASTERPROMPT.md`, memory `project_producer_web_ears_research.md`). Everything below was checked against live pages on 2026-09-06 unless marked "unverified". Prices are the vendor's own numbers where the vendor page loaded, otherwise the best secondary source is named. No em dashes anywhere in this file.

Verification legend: [V] = read on the vendor's or project's own page today. [S] = secondary source only. [U] = unverified or conflicting.

---

## A. How the AI-song companies do it (state as of September 2026)

### A.1 Suno (v5.5 "Fenix", March 25-26, 2026)

- Architecture: Suno has never published its architecture. Public reporting and its own release notes describe the "Chirp" model family; v5.5 adds Voices (upload or record your own singing voice, with a liveness check), Custom Models (fine-tune on your own catalog), and My Taste (personalization). [S: Suno release notes and blog, third-party writeups]
- Reference audio: yes on paid plans. Upload audio for Covers/extend, and v5.5 lets Pro and Premier subscribers upload their own voice. Suno's ToS (rev. Aug 10, 2026, effective Sep 3, 2026) forbids uploading "an audio recording of another person's voice" for a Voice Model. [V: suno.com/terms]
- Stems: paid plans can split generated songs into stems; Suno Studio extracts MIDI from a stem for 10 credits. Third-party API resellers list a 2-stem split at about $0.05 and a 10-way split at about $0.20, but only on a Suno `clip_id`, not on arbitrary uploaded audio. [S: Unifically, gptproto]
- API: **there is still no official self-serve Suno API.** In July 2026 Suno said it was "exploring a developer API" with a curated partner group; no public docs, endpoints, or pricing exist. [S: gptproto, dated July 2026] Six-plus resellers (PiAPI, Unifically, sunoapi, AIMusicAPI, etc.) sell "Suno API" access at roughly $0.014 to $0.11 per song. Suno's ToS bans "data mining, robots, scraping, or similar data gathering or extraction methods" and forbids circumventing IP blocks, so a reseller-backed integration is a ToS violation waiting to be enforced, plus a rights problem (the reseller's Suno account owns the output, not you). [V: suno.com/terms]
- Commercial use: Pro and Premier get an assignment of Suno's rights in outputs; Free/Basic outputs are personal and non-commercial only. Suno itself warns commercial permission does not guarantee the song is copyrightable. [V: suno.com/terms; S: gptproto]
- Litigation: UMG and Sony v. Suno continues in D. Mass. (dispositive motions due April 9, 2027); Warner settled Nov 25, 2025; GEMA won against Suno in Munich on July 31, 2026 (six compositions, damages, immediately enforceable, appeal pending). [S: Chartlex tracker, updated Aug 20, 2026]

### A.2 Udio

- After settling with UMG (Oct 29, 2025, reported per-generation royalty of $0.002 to $0.005) and Warner (Nov 25, 2025), Udio moved to a licensed "walled garden": generations stream inside Udio and cannot be downloaded or exported. Downloads were briefly reopened for 48 hours after user outcry. Sony continues to litigate and filed a second suit on July 20, 2026 over 30,117 more recordings. [S: Chartlex, Music Ally coverage, WebProNews]
- API: none, and Udio has said it is building a licensed consumer experience, not a developer platform. Not callable. [S: aimusicapi.ai/udio-api, Chartlex]

### A.3 Riffusion / Producer.ai / Google Flow Music

- Riffusion rebranded to Producer.ai (July 2025, FUZZ-2.0 model, "agentic producer" with replace, extend, cover, stem separation). **Google acquired Producer.ai on Feb 24, 2026** and folded it into Google Labs as "Google Flow Music", now running on Gemini, Lyria 3, Veo and Nano Banana. riffusion.com redirects to Flow Music. [S: Music Ally 2026-02-25, Music Business Worldwide, Crunchbase]
- API: no official third-party API. Resellers now advertise a "Producer API powered by Lyria 3 Pro", which is marketing for their own Lyria wrapper. Treat FUZZ as gone; the relevant Google surface is Lyria (A.5). [U: reseller claims]

### A.4 Stability AI, Stable Audio 2.5

- Architecture: latent diffusion (DiT) over a VAE, post-trained with Stability's "Adversarial Relativistic-Contrastive" (ARC) method; up to 3 minutes in under 2 seconds on a GPU; trained on a "fully licensed dataset" and marketed as commercially safe for enterprise. Announced Sep 10, 2024 (page still current). [V: stability.ai news post]
- Inputs: text-to-audio, audio-to-audio (upload a reference and transform it), and inpainting (give it your audio, choose where it starts, it fills in). **Instrumental and sound design only; it does not produce vocals** (fal's model table lists vocals: no; Stable Audio Open's card says "not able to generate realistic vocals"). [V: stability.ai; S: fal learn article Jun 27, 2026]
- API and price: Stability Developer Platform at 20 credits = $0.20 per generation regardless of duration; also on fal ($0.20/audio) and Replicate; on-prem via enterprise license. [S: api-evangelist notes, fal table, Pixazo]
- Commercial use: outputs usable commercially under Stability's API terms; enterprise license for on-prem. [V: stability.ai]

### A.5 Google Lyria (Lyria 3, Lyria 3.5, Lyria RealTime)

- Lyria 3.5 in the Gemini API: full songs up to about 3 minutes, real vocals with timed custom lyrics using `[Verse]`, `[Chorus]` tags, timestamps to control where vocal and instrumental sections land, instrumental-only mode, multilingual, 44.1 kHz stereo, MP3 or WAV, SynthID watermark on every output. Inputs are text, lyrics, and up to 10 images. **No reference-audio input in the API.** Restrictions: no named-artist voice requests, no copyrighted lyrics, single-turn (no "extend this" continuation), safety filters, non-deterministic. [V: ai.google.dev music-generation doc; deepmind.google/models/lyria]
- Pricing (Gemini API pricing page, read today): Lyria 3.5 = **$0.08 per song**; Lyria 3 Clip Preview (fixed 30 s) = $0.04 per song; Lyria 3 Pro Preview = $0.08 per song. No free tier. Paid tier: content not used to improve Google's products. Also on Vertex AI (public preview) and on fal at the same $0.04 / $0.08. [V: ai.google.dev/gemini-api/docs/pricing; S: fal]
- Lyria RealTime (`lyria-realtime-exp`): experimental streaming engine, text-only weighted prompts steered live, 48 kHz stereo 16-bit PCM, about 2 s control latency, **no vocals**, no audio input. Pricing is not on the pricing page today. [V: ai.google.dev lyria-realtime-exp doc] The 09-01 pass estimated about $0.04 per 30 s from older material; treat as [U].
- Stems: not offered. Commercial use: governed by Gemini API terms; DeepMind's page gives no explicit music-license text. Google carries the training-data risk, not the caller.

### A.6 ElevenLabs Music (Music v2)

- Architecture: unpublished. Product facts: v2 improves prompt adherence, composition, multilingual output and "vocal delivery"; section-level editing of sound and lyrics, inpainting of a section without touching the rest, mid-track genre transitions, "composition plan" control over structure, vocals or instrumental, 3 s to 5 min. **Audio Reference: upload about 30 s of audio to guide the generation** (explicitly "not designed for genre transformation"). Output MP3 (44.1 kHz, 128-192 kbps) or WAV. No stems. [V: elevenlabs.io/docs music capability page]
- API price: **$0.15 per generated minute** on every tier via the ElevenLabs API pricing page today (so about $0.45 for a 3-minute song). Music bills at 900 credits per minute from the shared pool. Commercial licensing on Starter ($6/mo, 3 music minutes included) and up. fal resells "Eleven Music" at $0.80/min, so go direct. [V: elevenlabs.io/pricing/api; S: fal table, BIGVU]
- Terms: outputs cleared for "nearly all commercial uses" per the Music Terms; you cannot resell the service itself; Enterprise plans are barred from putting more than 100 outputs into a library licensed to third parties or onto Spotify/Apple/Amazon/Pandora. Prohibited-sector list applies. [S: elevenlabs.io/music-terms, music-api-terms, terms.law summary]

### A.7 2026 entrants worth knowing

- **Mureka (Kunlun Tech)**: lyrics-first models V7.5 (Sep 25, 2025), V7.6 + O2 reasoning model (Dec 9, 2025), V8 (Mar 2, 2026), V9 (Apr 9, 2026), V9.5 (Jul 2026). Consumer: $8/mo for 400 songs with commercial rights; 5- and 12-stem downloads on Pro ($24/mo). Official developer API sold as prepaid top-ups with concurrency bands ($30 for 1 concurrent request up to $30,000 for 150); per-song about $0.03 (V7.6), $0.045 (V8/V9/O2), $0.15 list for V9.5 with a $0.045 beta rate to Aug 28, 2026; stems free to download. Reference-track and hummed-melody input exist in the consumer app; API support for a reference song is [U]. Training-data provenance undisclosed. platform.mureka.ai/pricing did not render for the fetcher, so all prices are [S: invideo Aug 7, 2026; apiframe; useapi.net].
- **MiniMax Music 2.5 / 2.6 / 3.0**: $0.15 per up-to-5-minute song, vocals, lyrics input, on fal at $0.15/audio. **MiniMax's own pricing page says: "Starting August 20, 2026, the paid APIs (Music Generation and Lyrics Generation) will no longer be available to new users."** Do not build on it. [V: platform.minimax.io pricing]
- **ACE-Step hosted (acemusic.ai, fal, Replicate, WaveSpeed)**: see Section B; on fal it is $0.0002 per second of audio (a 3-minute song is about $0.036), on Replicate about $0.04 per run. [V: fal model page; S: Replicate fishaudio/ace-step-1.5]
- Others on fal's June 2026 list: Sonilo v1.1 ($0.0025/s, up to 600 s), CassetteAI ($0.02/min). Not evaluated. [S: fal]

### A.8 Callable today, cost per 3-minute song

| Vendor | Vocals | Reference audio in | Stems out | Official API | Price per 3-min song | Notes |
|---|---|---|---|---|---|---|
| Google Lyria 3.5 (Gemini API) | Yes, timed lyrics | No (images only) | No | Yes [V] | $0.08 | SynthID; no extend; no artist voices |
| ElevenLabs Music v2 | Yes | Yes, about 30 s | No | Yes [V] | about $0.45 ($0.15/min) | Section edit + inpaint; 5-min max |
| Stable Audio 2.5 | No | Yes (audio-to-audio, inpaint) | No | Yes [V] | $0.20 flat | Instrumental/sound design |
| Mureka O2/V9 | Yes | Consumer yes, API [U] | Yes (5/12) | Yes [S] | about $0.045 to $0.15 | Prepaid top-ups; provenance unknown |
| ACE-Step 1.5 (fal/Replicate) | Yes | Yes (cover, repaint, reference) | Yes (track separation) | Hosted OSS | about $0.04 | Open weights; quality below Suno v5 |
| Suno v5.5 | Yes, best-in-class | Yes (paid) | Yes (paid) | **No** | about $0.06 via resellers | ToS violation via resellers |
| Udio | Yes | n/a | n/a | **No** | n/a | Walled garden, no export |
| MiniMax Music | Yes | No | No | Closed to new users Aug 20, 2026 | $0.15 | Dead end |
| Riffusion/Producer.ai | n/a | n/a | n/a | Acquired by Google Feb 2026 | n/a | Use Lyria instead |

**What this means for The Producer (A):**
1. Wire **Lyria 3.5 via the Gemini API first**: $0.08 per full song with real vocals and timed lyrics, an official key, Google carrying the training-data liability, and a 20-line integration. Its gaps (no reference audio, no extend) are exactly what our own engine already does.
2. Add **ElevenLabs Music v2** as the second render layer for the "make it sound like this" moment: it is the only official API that takes a 30 s reference clip and does section-level inpainting, at about $0.45 per song.
3. Do not build on Suno resellers, Udio, MiniMax, or anything Riffusion-branded; all four are closed, closing, or a ToS violation.
4. Stems from these APIs are not a thing (except Mureka and ACE-Step), so the stem story stays ours: our separation pipeline (Section C) runs on whatever the render API returns.
5. Budget: at $10k/month positioning, 200 renders a month per heavy user is about $16 (Lyria) to $90 (ElevenLabs), so generation cost is not the constraint; quality and control are.

---

## B. Open-weights models we could self-host (vocals and full songs)

Legend for license column: OK = commercial use permitted by the license text; NC = non-commercial, do not ship.

| Model | License | Params | VRAM | Vocals | Quality read | Hosted | Approx $/song self-hosted |
|---|---|---|---|---|---|---|---|
| **ACE-Step 1.5** (Feb 3, 2026) | **MIT** per README [V] (1.0 was Apache 2.0) | DiT 2B (about 4.7 GB bf16) or XL 4B (about 9 GB); LM 0.6B / 1.7B / 4B | 2B turbo runs in 6 GB or less with INT8 + offload; 8-16 GB for 2B + 0.6-1.7B LM; 20-24 GB for XL | Yes, 50+ languages | Self-claimed "between Suno v4.5 and v5"; under 2 s per song on A100, under 10 s on RTX 3090; LoRA on 8 songs in about 1 h on a 3090 | fal $0.0002/s; Replicate about $0.04/run; WaveSpeed; acemusic.ai free web | Modal L4 at $0.000222/s: 10-20 s of GPU = about $0.005 plus cold start; call it $0.01 to $0.02 warm |
| **HeartMuLa OSS-3B** (Jan 14, 2026; Apache 2.0 since Jan 20, 2026) | **Apache 2.0** [V] | 3B (7B announced, not released) | about 6 GB with 4-bit, 12 GB recommended | Yes, lyrics + tags | "Best open-source lyrics controllability"; internal 7B claimed on par with Suno but unreleased; RTF about 1.0 (a 3-min song takes about 3 min of GPU), community optimizations get 1.3-1.6x RTF | WaveSpeed about $0.10/run; ComfyUI nodes; HeartMuLa-Studio (community) adds reference-audio style transfer | L4 for 180 s = about $0.04; A10 about $0.055 |
| **YuE** (HKUST/M-A-P) | **Apache 2.0** [V] | 7B LM + 1B codec + upsampler | 24 GB for 1-2 sessions; full songs with 4+ sessions want 80 GB | Yes; dual-track vocal + accompaniment output; ICL with a 30 s reference (voice/style transfer) | Musical but slow: 360 s per 30 s of audio on a 4090, 150 s on H800 | Replicate community forks only | About 36 min on a 4090 per 3-min song; on Modal A100-80 about $0.60 to $1.00. Research tool, not a product path |
| **DiffRhythm 2** (ASLP-lab + Xiaomi, Oct 30, 2025) | **Apache 2.0** (code and weights) [V] | about 1.1B (16 LLaMA layers, 2048 hidden) [S] | Not documented for v2; v1 ran in 8 GB chunked, fp16 v1 did a 285 s song in 30 s on a 6 GB 3060 [S: issue #53] | Yes, precise lyric alignment | "Semi-autoregressive block flow matching"; fast; quality is a step below ACE-Step 1.5 in community tests [U] | None official | Cents per song on an L4 |
| **SongBloom** (Tencent AI Lab / Cypress Yang) | **Apache 2.0** for code and weights per LICENSE update commit [S] | about 2B [U] | Not documented | Yes, 10 s reference audio prompt + lyrics | Interleaved AR sketching + diffusion refinement; solid demos, English/Chinese | None | Cents per song on an L4 |
| **LeVo 2 / SongGeneration 2** (Tencent, v2-large 4B, Mar 1, 2026) | **NC. Tencent custom license: "only for academic, research and education purposes ... refrain from using it for any commercial or production purposes under any circumstances."** [S: HF README, insmelo] | 4B | Not documented | Yes; self-reported PER 8.55% vs Suno v5 12.4% | Best OSS vocals by its own evals | Hugging Face Space | **Do not ship** |
| **SongGen** (ICML 2025) | Apache 2.0 [V] | 1.3B | Not documented | Yes, mixed or dual-track, reference voice | 30 s max, English only, research grade | None | n/a |
| **InspireMusic** (Alibaba FunAudioLLM) | Code Apache 2.0; **weights license not stated** [V] | 1.5B, Long variant | Not documented | **No** (instrumental), 24/48 kHz | Continuation and reconstruction tasks | None | n/a |
| **Stable Audio Open Small** | Stability AI Community License: free under $1M annual revenue, enterprise license above [V] | 0.5B | Runs on Arm CPU | **No** realistic vocals; up to 11 s | Good for SFX and one-shots, weak on music | Replicate | Cents |
| **Magenta RealTime 2 / Lyria RT** (from 09-01 pass) | Apache 2.0 code, CC-BY weights | 230M-class | Runs on a Mac | No vocals; MIDI-conditioned | Reference renders from SongDoc MIDI | Lyria RealTime API (experimental) | Cents |
| MusicGen / AudioCraft, MERT, MuQ, Music Flamingo, LarsNet | **NC** (CC-BY-NC) | n/a | n/a | n/a | n/a | n/a | **Do not ship** (carried over from 09-01; LarsNet added here) |

Hosting reference prices read today: Modal per second: T4 $0.000164, L4 $0.000222, A10 $0.000306, L40S $0.000542, A100-40 $0.000583, A100-80 $0.000694, H100 $0.001097; CPU $0.0000131 per core-second; RAM $0.00000222 per GiB-second; $30/month free credits on Starter. [V: modal.com/pricing] RunPod pods per hour: RTX 4090 $0.34 community / $0.74 secure, L4 $0.44 / $0.49, L40S $0.79 / $1.09, A100-80 $1.19 to $1.59, H100 $1.99 to $3.49. [V: runpod.io/pricing]

Notes and traps:
- ACE-Step 1.5's README says MIT; the 09-01 memory says Apache 2.0 (true for 1.0). Either way commercial is fine. It is also the only open model with the full toolset we want: cover, selective repaint, extend, track separation, reference-audio guidance, BPM/key/time-signature metadata control, lyric timestamps, quality scoring, and an audio-understanding head (BPM/key extraction). [V]
- HeartMuLa's claim of parity with Suno is for the unreleased 7B; the 3B that exists is slower (RTF about 1) and its reference-audio conditioning is still "planned" upstream, though a community studio ships style transfer. [V: heartlib README; S: HeartMuLa-Studio]
- YuE's dual-track output (vocal and accompaniment as separate tracks) is architecturally the closest thing to "give me the vocal alone" without a separation pass, but at 36 minutes per song on a 4090 it is not a product path today.
- No newer 2026 open release beyond ACE-Step 1.5, HeartMuLa, LeVo 2 and SongBloom surfaced in searches; the only "beats ACE-Step" claims come from LeVo 2, which is non-commercial.

**What this means for The Producer (B):**
1. **Test ACE-Step 1.5 XL first**, on Modal (L4 or A10, weights in a Volume) or via fal at $0.036 per song while we measure; MIT license, vocals, reference-audio cover mode, repaint, track separation, and LoRA on 8 songs are exactly the "build with the drum I like" primitives.
2. HeartMuLa 3B is the second test only if ACE-Step's vocals disappoint on our lane tests; budget 3 minutes of GPU per song (about $0.04) and no upstream reference audio yet.
3. LeVo 2 is the best-sounding open vocals and is **non-commercial**; use it only as a benchmark for what "good" means, never in the product. Same for LarsNet and MusicGen.
4. Self-hosting beats API pricing only at volume: at $0.04 per Lyria/ACE hosted song, 10,000 songs a month is $400, versus Modal L4 minimums plus engineering; do it for control (LoRA on a user's taste, repaint, stems), not for cost.
5. Keep a "commercial spine" file: MIT/Apache only (ACE-Step, HeartMuLa, YuE, DiffRhythm 2, SongBloom, SongGen, Stable Audio Open under $1M revenue), and re-read the LICENSE file in the actual weights repo before every deploy, because Tencent shipped two models the same season with opposite licenses.

---

## C. YouTube link to usable stems and one-shots

### C.1 The pipeline

1. **Acquire audio.** `yt-dlp -x --audio-format wav` (or m4a then ffmpeg). In 2026 this fails from datacenter IPs far more often than it works: YouTube returns "Sign in to confirm you're not a bot" for AWS/GCP/Azure/most VPS ranges; PO-token providers "no longer bypass the bot check for the majority of cases"; the remaining workarounds are browser cookies plus a rotating player client, which break weekly. [V: yt-dlp PO Token Guide wiki; S: dalvo.io, yt-dlp.net, ansaribilal 2026] Even before the legal section, a server-side YouTube fetch is not a dependable product surface. The dependable input is a file the user already has.
2. **Separate.** Options shipped by `audio-separator` (MIT wrapper, credits UVR) [V: nomadkaraoke README]:
   - `htdemucs_ft` (Meta, MIT): 4 stems (vocals, drums, bass, other). MUSDB18-HQ SDR about 8.9 vocals / 9.5 drums / 9.4 bass / 6.4 other, avg 8.5 dB. `htdemucs_6s` adds guitar and piano. [S: aistemsplitter 2026 benchmark]
   - **BS-RoFormer** (`model_bs_roformer_ep_317_sdr_12.9755`, the audio-separator default): 2-stem vocals/instrumental, about 12.98 dB vocals SDR; won SDX23; 9.80 dB average on MUSDB without extra data. Slower and heavier than htdemucs. **Checkpoint license unverified** (community UVR/ZFTurbo/viperx checkpoints; the 09-01 pass flagged the same). [V: audio-separator README; S: arXiv 2309.02612, benchmark]
   - **Mel-Band RoFormer**: adds 0.43 to 0.58 dB over band-split on vocals; also 2-stem checkpoints by default. [S: arXiv 2310.01809]
   - **MDX23C**: UVR's MDX-Net v3 family; middle of the pack; ONNX so it runs on CPU acceptably.
   - Time per 3-minute song on an A40 GPU: htdemucs 30-45 s, htdemucs_6s 40-60 s, htdemucs_ft 90-150 s, BS-RoFormer 60-120 s. [S: aistemsplitter] On CPU, htdemucs runs at about 1 to 1.5x real time (3-5 min for a 3-min song on a multi-core box) and htdemucs_ft is about 4x slower than that (12-20 min). RAM: works from about 3 GB, 7 GB is the comfortable guide; the `segment` argument (max 7.8 s for htdemucs) is the memory lever, `shifts` multiplies time. [S: tomodahinata production guide, StemSplit setup guide]
   - Practical pick: **htdemucs_ft for 4 stems** (clean MIT weights, best "drums" and "bass" stems) plus **BS-RoFormer only for the vocal** when the user asks for the vocal specifically and once the checkpoint license is confirmed.
3. **Drum one-shots** from the drums stem. Three routes, cleanest license first:
   - Our own DSP (all MIT/ISC): onset detection on the drums stem (librosa `onset_detect` server-side, or the onset envelope already in `lib/ears/rhythm` in the browser), slice each onset with a 5 ms pre-roll and a 300-800 ms tail with a short fade, compute per-slice features (low-band energy ratio below 150 Hz, spectral centroid, decay time, noisiness), k-means with k = 3 or 4, label clusters by centroid order (kick lowest, snare mid with a noisy tail, hat highest), then pick the exemplar with the least neighbor overlap and highest peak in each cluster. This yields "one kick, one snare, one hat" without any extra model.
   - `cukas/drumsep` (MIT): pure-Python HPSS + frequency masking + transient detection that splits an already-isolated drums stem into kick, snare, hi-hat, cymbals, toms; under 100 ms startup, CPU only, about 50 MB install. Rough but deterministic. [V: GitHub]
   - `inagoy/drumsep` (Hybrid Demucs fine-tune, kick/snare/toms/cymbals): **license "unknown"** on the HF mirror. [V: HF card] **LarsNet** (5 drum stems, faster than real time, StemGMD 1,224 h dataset): **CC BY-NC 4.0, do not ship.** [S: mvsep, polimi-ispl GitHub]
4. **Melodic stem to MIDI.** Spotify **Basic Pitch** (Apache 2.0) on the "other", bass, or vocal stem; the TypeScript build `@spotify/basic-pitch` runs in the browser (already in the 09-01 spine). Polyphonic, pitch-bend aware, good enough to grab "that synth line" as notes. RipX and Fadr are the commercial references for what "good" looks like here.
5. **Tempo and key alignment.** Tempo and key come from `lib/ears` today (beat-this server-side later for better beat grids). Time-stretch and pitch-shift: in the browser, Tone.js GrainPlayer or a phase-vocoder in `lib/ears/dsp`; server-side, librosa (ISC) phase vocoder. **Avoid Rubber Band (GPL) unless we buy the commercial license**; SoundTouch is LGPL.

### C.2 Where to run it

| Runtime | Latency per 3-min track | Cost per track | RAM/VRAM | Verdict |
|---|---|---|---|---|
| **In-browser** (demucs-rs: Rust to WASM + WebGPU, Apache 2.0, ships htdemucs 84 MB, htdemucs_6s 84 MB, htdemucs_ft 333 MB; demucs-web: ONNX Runtime Web WebGPU/WASM, 172 MB model; Kitmul: WASM only; StemSplitio htdemucs-onnx and htdemucs-ft-onnx on HF) | WASM: "a 4-minute song takes roughly 3-5 minutes on a modern laptop" (Kitmul). WebGPU: faster, unquantified in READMEs; demucs-rs says the WASM build is "significantly slower than the native CLI" | $0 | Client GPU/CPU; 84-333 MB model download, cached | **Usable today for a privacy-first "your file never leaves your machine" tier.** No RoFormer in-browser yet. Phones will struggle. [V: demucs-rs README; S: Kitmul post, demucs-web README] |
| **Modal GPU function** (L4 or T4) | 30-90 s warm (htdemucs_ft), plus 10-20 s cold start with weights in a Volume | L4: 90 s x $0.000222 = $0.02; T4: about $0.015; add drum sub-split + Basic Pitch + beat-this on the same container: about $0.03 total | 24 GB L4, 16 GB T4 | **Recommended.** Scale-to-zero, $30/month free credits, Python image with audio-separator + basic-pitch + beat-this. |
| **Replicate ryan5453/demucs** (A100-40) | about 25 s | about $0.028 per run | n/a | Fine as a stopgap for separation only; no custom post-processing. [V: Replicate page] |
| **Railway CPU worker** (4 vCPU / 8 GB) | 5-8 min for htdemucs, 15-25 min for htdemucs_ft | $0.0278 per vCPU-hour + $0.0139 per GB-hour, so about $0.02 of metered compute per track, but a worker kept warm at 4 vCPU / 8 GB costs about $160/month if fully utilized | 8 GB is enough with `segment` lowered | Works, too slow for a conversational product; use only as an overflow queue. [V: railway.com/pricing] |

### C.3 Legal (honest read, not legal advice)

- **YouTube ToS** (effective Dec 15, 2023): you may not "access, reproduce, download, distribute, transmit, broadcast, display, sell, license, alter, modify or otherwise use any part of the Service or any Content except: (a) as expressly authorized by the Service", may not "circumvent, disable ... any part of the Service ... including security-related features", and may not access it "using any automated means (such as robots, botnets or scrapers)" without written permission. A product that runs yt-dlp server-side breaches this contract on every request; Google's remedies are blocking, account termination, and civil claims. [V: youtube.com/t/terms]
- **DMCA 1201 (anti-circumvention) is the sharper edge for a company**, separate from copyright infringement and untouched by fair use. The RIAA's position since 2020 is that YouTube's "rolling cipher" is a technological protection measure and stream-rippers circumvent it. In *Yout LLC v. RIAA* the district court dismissed Yout's declaratory-judgment suit (2022) because Yout could not show it does not circumvent; the Second Circuit heard argument Feb 5, 2024 and the docket showed supplemental briefing as late as Nov 10, 2025 (Suno filed an amicus in Oct 2025); **I could not find a final appellate decision, treat as pending [U].** Separately, on Feb 5, 2026 a magistrate judge in N.D. Cal. (*Cordova v. Huneault*) let a 1201 claim proceed on the theory that the rolling cipher is an access control even though the videos are publicly viewable. Note also that yt-dlp the tool is legal to distribute (GitHub restored youtube-dl in 2020 after the EFF letter); what is exposed is a commercial service that downloads on users' behalf. [S: TorrentFreak, Courthouse News, CourtListener docket, Slashdot Feb 5, 2026, EFF/GitHub 2020]
- **Copyright in the samples.** Extracting a stem does not create any rights in it. Sixth Circuit (*Bridgeport v. Dimension Films*, 2005): "get a license or do not sample", no de minimis defense for sound recordings. Ninth Circuit (*VMG Salsoul v. Ciccone*, 2016): de minimis applies, but that case was a 0.23-second horn hit; a recognizable drum loop, vocal chop, or synth phrase is not de minimis anywhere. Commercial release of anything built on an extracted stem needs master and publishing clearance. [S: Wikipedia, Pace and WashU law review notes]
- **How the incumbents survive.** Moises and LALAL.AI accept **user-uploaded files only**; Moises explicitly refuses streaming or YouTube URLs. Their ToS require that you own or have rights to the audio, frame the service as practice, learning and creation, ban "consumption" use, make the user solely responsible for what they do with the output, and (Moises) reserve the right to terminate accounts used mainly for consumption. RipX, Serato Stems, Fadr and every DAW stem tool ship the same way: local processing of the user's file, no library, no redistribution. The Chartlex 2026 lawsuit tracker lists **no suit against a stem-separation tool**; every music suit targets training data (Suno, Udio, OpenAI) or distribution. Splice is the other model: a licensed, royalty-free library where creators are paid and AI training on the content is banned by ToS. [S: Moises ToS and help center, LALAL terms, Chartlex tracker, Splice licensing FAQ]
- **The line, in one sentence:** processing a file the user supplies, privately, for that user, is what every surviving competitor does; fetching from YouTube on the server or letting extracted samples move between users is what gets companies sued.
- Safe framing for The Producer: (1) input is always the user's file (drag, record, or their own export), never a server-side YouTube fetch; if a link is pasted, we open it for listening and ask for the file, exactly like Moises; (2) processing is per-user and ephemeral (private Supabase Storage bucket, 24-72 h TTL, no cross-user access, no public library of extracted stems); (3) the default "build with it" path extracts **DNA, not the recording**: MIDI from Basic Pitch, tempo, key, envelope and timbre descriptors, drum-hit classes, then re-synthesizes with our instruments or a generation API; (4) "use the actual sample" stays available as a personal-use, non-exportable-mix option behind a rights attestation checkbox; (5) register a DMCA agent, publish a repeat-infringer policy and a takedown route so 17 U.S.C. 512 safe harbor covers user-stored content; (6) the sellable palette is a licensed one-shot library (our own recordings, CC0 packs, or a Splice-style licensed deal), and extracted one-shots are training data for taste, not merchandise.

### C.4 Recommended architecture and cost

Phase 1 (no new infra, ship first): browser-only. User drops a file (or records). demucs-rs or demucs-web via WebGPU when available, WASM fallback, htdemucs 84 MB (upgrade to htdemucs_ft when WebGPU is present) gives 4 stems in 1-5 minutes. `lib/ears` already has onset, tempo, key; add the drum-slice clustering (C.1 step 3, first bullet) and Basic Pitch TS. Cost $0 per track, zero custody of the user's audio.

Phase 2 (one Modal GPU function): `separate(track_url) -> {stems, drum_hits, midi, facts}`. Image: audio-separator (htdemucs_ft, optional BS-RoFormer vocal pass once its license clears), cukas/drumsep or our clustering, basic-pitch, beat-this. Input from a signed Supabase Storage URL, output stems and JSON back to a private bucket with TTL. Warm latency 30-90 s. Cost about $0.03 per track, so about $30 per 1,000 tracks and $300 per 10,000, with no idle cost. Railway CPU stays as an overflow queue only.

**What this means for The Producer (C):**
1. **Never download from YouTube server-side.** It is unreliable from datacenter IPs in 2026, it breaches YouTube's ToS on every call, and the 1201 rolling-cipher theory is live in court (Yout pending, Cordova proceeding). Take the user's file, as Moises does.
2. Ship in-browser separation now (demucs-rs / ONNX WebGPU, htdemucs weights are MIT) as the zero-custody tier; it is slow but real, and it gives us the "one drum, one synth, one vocal" flow today.
3. Add a Modal L4 function for quality (htdemucs_ft + drum sub-split + Basic Pitch + beat-this) at about $0.03 per track and 30-90 s.
4. Extract DNA by default (MIDI, tempo, key, drum classes, envelopes) and re-generate; keep the raw sample as a personal-use, non-exportable option behind a rights attestation.
5. Do not ship LarsNet (CC BY-NC) or the unknown-license drumsep weights; our own onset-plus-clustering on the demucs drum stem is MIT-clean and good enough for one-shots.

---

## D. Bring-your-own-API-key in a consumer web app

### D.1 How shipping products do it

| Product | Where the key lives | Transit | Notes |
|---|---|---|---|
| **TypingMind** | Browser only (localStorage), optional AES encryption with a user password via CryptoJS | Browser calls the vendor directly; "never sent to TypingMind's servers" | Static app, no backend; per-device. [S: docs.typingmind.com FAQs] |
| **Cursor** | Not stored server-side; kept by the client | "It is sent to our backend with every request because all requests are routed through Cursor's servers for final prompt building. The key is transmitted over encrypted connections and is not persisted after the request completes." Custom keys only work for chat models. | Pass-through pattern. [V: cursor.com/help/models-and-usage/api-keys] |
| **Continue** | User secrets: stored in the hub, sent to the IDE alongside config; Org secrets: never sent to clients, LLM calls proxied through api.continue.dev | Proxy for org secrets | Two tiers by trust. [S: docs.continue.dev secret-types] |
| **Open WebUI** | Database; community discussions (#8534, #21903) note user "valve" secrets are stored **plaintext**; hardening docs push DB-level encryption (TDE, encrypted volumes, SQLCipher) | Server-side calls | WEBUI_SECRET_KEY signs JWTs and protects OAuth session data, it does not encrypt stored provider keys. Cautionary example. [S: docs.openwebui.com hardening, GitHub discussions] |

### D.2 Anthropic's actual policy text

- Commercial Terms of Service (effective June 17, 2025): Anthropic grants access "to power products and services Customer makes available to its own customers and end users"; "Customer is responsible for all activity under its account"; "Customer may not ... resell the Services except as expressly approved by Anthropic"; Customer and its Users must comply with the Usage Policy. No clause names BYOK. [V: anthropic.com/legal/commercial-terms]
- Consumer Terms (effective Oct 8, 2025): "You may not share your Account login information, Anthropic API key, or Account credentials with anyone else." API keys themselves are governed by the Commercial Terms. [V: anthropic.com/legal/consumer-terms]
- **"Authentication and credential use" (added around Feb 17-19, 2026):** "OAuth authentication used with Free, Pro, and Max plans is intended exclusively for Claude Code and Claude.ai. Using OAuth tokens obtained through Claude Free, Pro, or Max accounts in any other product, tool, or service, including the Agent SDK, is not permitted." Anthropic "does not permit third-party developers to offer Claude.ai login or to route requests through Free, Pro, or Max plan credentials on behalf of their users." Third-party products "should use API key authentication through Claude Console or a supported cloud provider." Enforcement started Jan 9, 2026 and OpenCode removed Claude subscription auth by Feb 20, 2026; API-key access "remains unaffected". [S: The Register 2026-02-20, Aperant issue #1871 quoting the policy, yage.ai summary]
- Help Center "API Key Best Practices" (Mar 16, 2026): "When you upload your API key to third-party tools or platforms, you are giving the developer of that tool access to your Claude Console account." This is a caution to users, not a prohibition on the tool. [V: support.claude.com article 9767949]
- Usage Policy (Sep 15, 2025): consumer-facing chatbots must disclose AI involvement "at a minimum at the beginning of each chat session"; no bypassing product guardrails; no facilitating access from unsupported regions. [V: anthropic.com/legal/aup]
- Browser-direct calls are officially supported: the `anthropic-dangerous-direct-browser-access: true` header enables CORS (Aug 2024), and the TypeScript SDK exposes `dangerouslyAllowBrowser: true`; Anthropic and Simon Willison both name BYOK client-side apps as the legitimate use case. [S: simonwillison.net 2024-08-23, SDK issues]

**Reading:** an end user pasting their own Console API key into The Producer is permitted; they are the "Customer" under the Commercial Terms and their key powers their own usage. What is prohibited is offering claude.ai login or piping Pro/Max OAuth tokens. Our obligations: keep the key confidential, follow the Usage Policy (AI disclosure at session start), never resell access, and do not accept OAuth tokens. Flag: no Anthropic page says the word "BYOK"; the permission is inferred from the API-key language plus the Feb 2026 clarification.

### D.3 Validation and hygiene

- Validate with `GET https://api.anthropic.com/v1/models` with `x-api-key` and `anthropic-version: 2023-06-01`. It costs no tokens; 200 means the key authenticates, 401 `authentication_error` means it does not. It does not prove the key has credit; the first real Messages call surfaces a 400/402-class billing error, so handle that path in the UI. [V: platform.claude.com/docs/en/api/models-list]
- Never put the key in a URL, query string, or GET body (edge and CDN logs capture URLs). Send it in a header or POST body over TLS only.
- Logging: never log request configs or SDK error objects raw; redact anything matching `sk-ant-` before it reaches a logger. Sentry: keep `sendDefaultPii: false`, rely on the default denylist (auth, token, password), add a `beforeSend` scrubber, and pin `@sentry/nextjs` at 10.27.0 or later: CVE-2025-65944 (SDK 10.11.0 to 10.26.0) leaked `Authorization` and `Cookie` headers into span attributes when `sendDefaultPii` was true, and Sentry's server-side scrubber missed them too. Vercel runtime logs only capture stdout/stderr, so a clean `console` discipline is the whole story there. [S: GitHub advisory GHSA-6465-jgvq-jhgp, Sentry docs]
- Show only the last 4 characters after save; support rotate and delete; rate-limit the validation endpoint; keep a usage audit table (counts and models, never the key).

### D.4 Recommended pattern for Next.js + Supabase (one pattern, two modes)

**Default mode: server-side, encrypted at rest in Supabase Vault.**
1. Vault is libsodium AEAD; the per-project encryption key is held in Supabase's backend, not in the database, so a dumped DB yields only ciphertext; `vault.decrypted_secrets` decrypts at query time and is never written to disk or backups. Vault does not depend on pgsodium, which is being deprecated; the Vault API stays stable. [V: supabase.com/docs/guides/database/vault; S: pgsodium deprecation note, supabase/postgres PR 1452]
2. Schema: `user_provider_keys(user_id, provider, vault_secret_id uuid, last4, status, created_at, last_validated_at, last_used_at)`. RLS: users read and delete their own rows only; nobody but the service role can touch `vault.*`. Never grant `authenticated` or `anon` any access to `vault.decrypted_secrets`.
3. Save flow (route handler): verify the Supabase session, call `GET /v1/models` with the pasted key, on 200 run `select vault.create_secret(key, 'anthropic:' || user_id)` through a `SECURITY DEFINER` RPC executed with the service-role client, store the returned id and last4, return only `{last4, status}`.
4. Use flow (the existing brain route): verify session, `select decrypted_secret from vault.decrypted_secrets where id = $1` via the service-role client, instantiate the Anthropic client per request with that key, stream the response, drop the key from memory; the response never carries the key. If the row is absent, fall back to the house key and metered credits as today.
5. Rotate and delete: `vault.update_secret` / delete by id; delete the metadata row in the same transaction.

**Opt-in mode: zero-custody browser-direct.** For users who will not hand over a key, store it in `localStorage` (optionally wrapped with a passphrase via WebCrypto AES-GCM), and call Anthropic straight from the browser with `anthropic-dangerous-direct-browser-access: true` / `dangerouslyAllowBrowser: true`. Trade-offs to state in the UI: server-side tools, prompt assembly and MusicFacts injection must then happen client-side, the key is exposed to any XSS, and it is per-device. This is the TypingMind pattern and it is what Anthropic built the CORS header for.

**What this means for The Producer (D):**
1. BYOK with a Console API key is permitted by Anthropic's terms; claude.ai logins and Pro/Max OAuth tokens are not, so the settings screen accepts `sk-ant-` keys only and never offers "sign in with Claude".
2. Store keys server-side in Supabase Vault (libsodium, key outside the DB), decrypt only inside the brain route via a service-role RPC, never expose `vault.decrypted_secrets` to app roles.
3. Validate with the free `GET /v1/models` call, keep last4 only in the UI, and handle the "valid key, no credit" case on the first Messages call.
4. Logging is the real leak: `sendDefaultPii: false`, Sentry 10.27+, redact `sk-ant-`, never log SDK errors raw, no keys in URLs.
5. Offer the browser-direct zero-custody mode as an opt-in for the paranoid tier; it is officially supported via the CORS header and costs us nothing but a client-side prompt builder.

---

## Sources

### A
- https://gptproto.com/blog/suno-api
- https://unifically.com/blogs/suno
- https://suno.com/terms
- https://suno.com/release-notes/introducing-v5-5-voices-custom-models-and-my-taste
- https://about.suno.com/blog/v5-5
- https://piapi.ai/suno-v5
- https://aitoolsdevpro.com/ai-tools/suno-guide/
- https://www.chartlex.com/blog/business/udio-umg-walled-garden-explained-2026
- https://www.chartlex.com/blog/business/music-industry-ai-lawsuits-tracker-2026
- https://newindustryfocus.com/articles/udio-allows-downloads-for-48-hours-following-umg-deal-outcry
- https://www.webpronews.com/udio-halts-ai-song-downloads-after-copyright-settlement-with-umg-warner/
- https://aimusicapi.ai/en/udio-api
- https://musically.com/2026/02/25/google-buys-ai-music-startup-producerai-formerly-riffusion/
- https://www.musicbusinessworldwide.com/google-acquires-ai-music-platform-and-suno-challenger-producerai/
- https://www.crunchbase.com/acquisition/google-acquires-riffusion--677a8058
- https://musicapi.ai/producer-ai-api
- https://stability.ai/news-updates/stability-ai-introduces-stable-audio-25-the-first-audio-model-built-for-enterprise-sound-production-at-scale
- https://github.com/api-evangelist/stability-audio
- https://www.pixazo.ai/models/audio-generation/stable-audio-2-5-api
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/music-generation
- https://ai.google.dev/gemini-api/docs/models/lyria-realtime-exp
- https://deepmind.google/models/lyria/
- https://cloud.google.com/blog/products/ai-machine-learning/lyria-3-and-lyria-3-pro-on-vertex-ai
- https://elevenlabs.io/docs/overview/capabilities/music
- https://elevenlabs.io/pricing/api
- https://elevenlabs.io/music-terms
- https://elevenlabs.io/music-api-terms
- https://terms.law/ai-output-rights/elevenlabs/
- https://bigvu.tv/blog/elevenlabs-pricing-2026-plans-credits-commercial-rights-api-costs/
- https://fal.ai/learn/tools/best-text-to-music-apis-2026
- https://platform.minimax.io/docs/guides/pricing-paygo
- https://invideo.io/blog/mureka-ai-music-generator/
- https://apiframe.ai/blog/ai-music-api-pricing-2026
- https://useapi.net/docs/api-mureka-v1
- https://platform.mureka.ai/pricing

### B
- https://github.com/ace-step/ACE-Step-1.5/blob/main/README.md
- https://ace-step.github.io/ace-step-v1.5.github.io/
- https://gigazine.net/gsc_news/en/20260204-ace-step-music-generation/
- https://fal.ai/models/fal-ai/ace-step
- https://replicate.com/fishaudio/ace-step-1.5
- https://wavespeed.ai/models/wavespeed-ai/ace-step-1.5
- https://github.com/HeartMuLa/heartlib
- https://arxiv.org/html/2601.10547v1
- https://github.com/fspecii/HeartMuLa-Studio
- https://wavespeed.ai/models/wavespeed-ai/heartmula/generate-music
- https://github.com/multimodal-art-projection/YuE
- https://github.com/ASLP-lab/DiffRhythm2
- https://github.com/xiaomi-research/diffrhythm2
- https://github.com/ASLP-lab/DiffRhythm/issues/53
- https://huggingface.co/tencent/SongGeneration
- https://github.com/tencent-ailab/SongGeneration/blob/main/README.md
- https://insmelo.com/blog/levo-2-song-generation
- https://github.com/tencent-ailab/SongBloom
- https://github.com/Cypress-Yang/SongBloom/commit/397476c9d1b80cdac48cab7b0070f953942b54ca
- https://github.com/LiuZH-19/SongGen
- https://github.com/FunAudioLLM/InspireMusic
- https://huggingface.co/stabilityai/stable-audio-open-small
- https://stability.ai/license
- https://github.com/facebookresearch/audiocraft/issues/198
- https://modal.com/pricing
- https://www.runpod.io/pricing
- https://www.it-jim.com/blog/best-open-source-ai-music-generator/
- https://medium.com/@aitoolscan/ace-step-1-5-vs-heartmula-the-state-of-local-ai-music-generation-in-2026-c37cb86351bf

### C
- https://github.com/nomadkaraoke/python-audio-separator
- https://pypi.org/project/audio-separator/
- https://arxiv.org/pdf/2310.01809
- https://aistemsplitter.org/blog/htdemucs-vs-bs-roformer-vs-spleeter-2026-benchmark
- https://tomodahinata.com/en/blog/demucs-v4-music-source-separation-production-guide
- https://stemsplit.io/blog/demucs-local-setup-guide
- https://replicate.com/ryan5453/demucs
- https://github.com/nikhilunni/demucs-rs
- https://github.com/timcsy/demucs-web
- https://huggingface.co/StemSplitio/htdemucs-onnx
- https://huggingface.co/StemSplitio/htdemucs-ft-onnx
- https://kitmul.com/en/blog/audio-stem-splitter-ai-source-separation-browser
- https://github.com/olilarkin/free-music-demixer
- https://github.com/cukas/drumsep
- https://huggingface.co/vincewin/drumsep
- https://github.com/polimi-ispl/larsnet
- https://mvsep.com/algorithms/31
- https://arxiv.org/html/2312.09663v2
- https://github.com/spotify/basic-pitch
- https://github.com/yt-dlp/yt-dlp/wiki/PO%20Token%20Guide
- https://dalvo.io/blog/yt-dlp-sign-in-to-confirm-not-a-bot
- https://ansaribilal.com/blog/ytagent-datacenter-ip-block-youtube-ai-agents-2026/
- https://www.youtube.com/t/terms
- https://www.courtlistener.com/docket/66697744/yout-llc-v-recording-industry-association-of-america-inc/
- https://torrentfreak.com/appeals-court-hears-riaa-and-yout-in-high-stakes-streamripper-case-240209/
- https://courthousenews.com/tech-company-defends-youtube-downloading-software-at-second-circuit/
- https://news.slashdot.org/story/26/02/05/1924252/court-rules-that-ripping-youtube-clips-can-violate-the-dmca
- https://www.billboard.com/pro/yout-violates-dmca-youtube-ripper-copyright-law
- https://en.wikipedia.org/wiki/Bridgeport_Music,_Inc._v._Dimension_Films
- https://openscholarship.wustl.edu/law_lawreview/vol95/iss1/9/
- https://digitalcommons.pace.edu/pipself/vol7/iss1/4/
- https://help.moises.ai/hc/en-us/articles/7401394754962-Terms-of-Service
- https://help.moises.ai/hc/en-us/articles/18322457396508-How-do-streaming-services-work-and-why-can-t-we-accept-their-URL-links-on-Moises
- https://www.lalal.ai/terms-and-conditions/
- https://www.chartlex.com/blog/marketing/ai-stem-separation-tools-2026
- https://support.splice.com/en/articles/8652642-splice-sounds-licensing-faq
- https://splice.com/terms
- https://railway.com/pricing

### D
- https://cursor.com/help/models-and-usage/api-keys
- https://docs.typingmind.com/general-faqs
- https://docs.continue.dev/hub/secrets/secret-types
- https://docs.openwebui.com/getting-started/advanced-topics/hardening/
- https://github.com/open-webui/open-webui/discussions/8534
- https://github.com/open-webui/open-webui/discussions/21903
- https://supabase.com/docs/guides/database/vault
- https://supabase.com/docs/guides/database/extensions/pgsodium
- https://github.com/supabase/postgres/pull/1452
- https://www.anthropic.com/legal/commercial-terms
- https://www.anthropic.com/legal/consumer-terms
- https://www.anthropic.com/legal/aup
- https://support.claude.com/en/articles/9767949-api-key-best-practices-keeping-your-keys-safe-and-secure
- https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/
- https://github.com/AndyMik90/Aperant/issues/1871
- https://yage.ai/share/claude-code-subscription-not-a-developer-credential-en-20260321.html
- https://dev.to/mcrolly/anthropic-kills-claude-subscription-access-for-third-party-tools-like-openclaw-what-it-means-for-3ipc
- https://platform.claude.com/docs/en/api/models-list
- https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/
- https://github.com/vercel/ai/issues/3041
- https://github.com/getsentry/sentry-javascript/security/advisories/GHSA-6465-jgvq-jhgp
- https://docs.sentry.io/platforms/javascript/data-management/sensitive-data/
- https://docs.warp.dev/agent-platform/inference/bring-your-own-api-key/
