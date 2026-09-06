# producer-stems worker
A link or an uploaded file in; stems (drums, bass, vocals, other as mp3), drum one-shots (kick, snare, hat, perc as wav), and facts (tempo, key, best 8 bars, blocks) out. Writes to Supabase storage bucket `clips` under `<owner>/stems/<job>/` and to the `jobs` and `clips` tables. The original audio never outlives the job.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_SECRET, MAX_SECONDS (480), PORT.
Run: `uvicorn app:app --port 8080`. Local analysis test: `python analysis.py track.mp3 --stems`.
