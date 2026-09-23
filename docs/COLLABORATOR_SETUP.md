# Running The Producer on your own machine

The Producer is a voice-driven AI music producer. You talk, and it builds the record in front of you. It's a Next.js app with a Tone.js audio engine in the browser, a brain on the Anthropic API, a voice on ElevenLabs (or a free local voice), and a Python stems worker for hearing real records.

**Every key you run it with is your own.** No key lives in this repo, and none ever has: `.env*` is gitignored. Nothing here reaches Brady's accounts.

## 1. Get it running (about five minutes)

```bash
git clone https://github.com/Acuntel/producer-web.git
cd producer-web
npm ci                      # use ci, not install: it keeps the lockfile exact
touch .env.local            # then fill it in, see below
npm run dev                 # http://localhost:3000
```

The smallest `.env.local` that gives you the whole studio:

```bash
ANTHROPIC_API_KEY=sk-ant-...        # your key, from console.anthropic.com. This is the brain.
```

That's enough to open the app, talk to the producer and have it build records. Use Chrome with headphones. The microphone is asked for on your first press.

**No-spend mode.** To work on the UI or the engine without calling any model, start it with the mock brain. It answers from `lib/brain/mock.ts`:

```bash
npm run build && PRODUCER_MOCK=1 npm run serve   # http://localhost:3111
```

The test harnesses in `tests/` expect that server on port 3111.

## 2. Everything else is optional

Each of these switches a feature on. Leave any of them out and that feature steps aside; the rest keeps working.

| Variable | What it turns on | Without it |
|---|---|---|
| `ELEVENLABS_API_KEY` | The producer's voice (ElevenLabs flash TTS) and ElevenLabs speech to text | The free local voice (Kokoro in the browser), then the browser's own voice; Chrome's own speech recognition hears you |
| `ELEVENLABS_VOICE_ID` | A different voice | A default voice |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Accounts, cloud projects, the clip vault, the DNA store | Records save in the browser only |
| `KEY_ENCRYPTION_KEY` | Lets signed-in users save their own keys in Settings (encrypted at rest) | Keys come from `.env.local` only |
| `STEMS_WORKER_URL`, `STEMS_WORKER_SECRET` | Stems, identify, find and learn (hearing real records); they also need a signed-in account, so Supabase too | Those tools say the worker is not configured |
| `PRODUCER_MODEL`, `PRODUCER_FAST_MODEL`, `PRODUCER_VOICE_MODEL`, `PRODUCER_CRITIC_MODEL`, `PRODUCER_ATTEND_MODEL` | Model overrides per role | Sensible defaults |
| `HOUSE_USER_DAILY_USD`, `HOUSE_GLOBAL_DAILY_USD` | Daily spend caps on the server's own key | $5 per user and $40 overall a day |

**Your own Supabase.** Create a project at supabase.com, put its three values above, and apply `supabase/migrations/` in order (`0001` to the newest) in the SQL editor or with the Supabase CLI.

**Your own stems worker.** It lives in `worker/` (see `worker/README.md`). Locally: `cd worker && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && WORKER_SECRET=anything uvicorn app:app --port 8080`, then set `STEMS_WORKER_URL=http://localhost:8080` and `STEMS_WORKER_SECRET=anything`. It needs your Supabase values too, because it writes stems to storage. Demucs separation is heavy; the Dockerfile shows the production setup.

## 3. Where things are

- `lib/engine/`: the audio engine (Tone.js). `rig.ts` keeps voices alive across changes, and parts are content-addressed. Read `docs/MASTERPROMPT_V11.md` before changing it; the glitch work behind it was measured.
- `lib/brain/`: the producer's mind. Persona, contract, parse, the voice controls, and the mock brain.
- `lib/song/`: the song model and every op the brain can apply.
- `lib/ears/`: the browser ears (tempo, key, chords, grids), each estimate with a confidence.
- `hooks/`: the studio state (`useStudio`), conversation, stems and voice.
- `worker/`: the Python stems and analysis worker.
- `docs/VISION.md`: what this is for. `docs/GYM_LOG.md`: every measured round, with numbers.
- Checks: unit tests with `npx tsx --test tests/*.test.mjs` (the `npm test` script points at a cached tsx on Brady's Mac, so run the command directly), `npx tsc --noEmit` (types), and with the mock server up, `npm run glitch` (stutter), `npm run audible` (sound out), `npm run ritual` (the voice flow end to end). Run one Chrome harness at a time; they share debug ports.

## 4. Working together

- Work on a branch and open a pull request into `main`. Don't push to `main` directly.
- Never commit a `.env*` file or a key. If one slips into a commit, rotate that key first, then fix the history.
- There's no CI on this repo, so run the unit tests and `npx tsc --noEmit` before you open a PR.
