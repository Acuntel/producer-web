# producer-stems worker
A link, a name or an uploaded file in; stems, drum one-shots (kick, snare, hat, perc as wav) and facts (tempo, key, best 8 bars, blocks) out. The voice comes first: the best 16 bars' vocal (`preview-vocals.flac`), then the whole vocal (`vocals.flac`, lossless), then drums, bass and other (mp3). Writes to Supabase storage bucket `clips` under `<owner>/stems/<job>/` and to the `jobs` and `clips` tables. The original audio never outlives the job.

A name is resolved identity first (`resolver.py`): candidates are ranked on the uploader being the artist, the duration against the catalog, and cover, karaoke, remix, live, sped up and nightcore markers; each download is named by Shazam and only the original is taken. Otherwise the job ends with `status: error`, the one line to say in `error`, and `result: {version, versionNote, identity, candidateUrl, needsConsent: true}`; posting the same job again with `source.accept_version` (`cover`, `remix`, `live`, `unverified` or `any`) takes it, labelled.

Separation (`separate.py`) is Kim Mel-Band RoFormer (MIT weights, `roformer.py`); no Demucs. Licenses: `docs/SOURCES_AUDIT.md`.

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_SECRET, MAX_SECONDS (480), PORT,
SEPARATOR_BACKEND (`local`, or `modal` for `gpu/modal_app.py`, not deployed), MODEL_DIR (/models), KIM_CKPT, ROFORMER_OVERLAP (2),
ROFORMER_DEVICE (cpu), MSST_DIR + SCNET_CKPT (optional SCNet XL IHF for drums, bass and other), MAX_VERIFY_DOWNLOADS (3).
Run: `uvicorn app:app --port 8080`. Local analysis test: `python analysis.py track.mp3 --stems`.
Tests: `PYTHONDONTWRITEBYTECODE=1 python -m pytest -q -p no:cacheprovider tests/` from `worker/` (no network, no models).
