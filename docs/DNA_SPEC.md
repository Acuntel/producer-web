# DNA SPEC v1: the condensed music file and the Galton store

This is the exact contract for the data lane of V11 (docs/MASTERPROMPT_V11.md section 4.3). Scripts live in `tools/dna/`. Outputs live in `data/dna/` (gitignored except the small compiled files named below). Python 3.12 virtualenv: `/private/tmp/claude-501/-Users-bradyschwartz/ea6e9de9-3b33-4df1-a4bb-5e94483ee985/scratchpad/dna-venv/bin/python` (pandas, mido, psycopg, pyarrow, tqdm installed; add what you need with `uv pip install -p <that python> <pkg>`).

## 1. Sources (download to `data/dna/raw/`, never commit raw files)

| key | URL | format | rows | notes |
| --- | --- | --- | --- | --- |
| billboard | https://raw.githubusercontent.com/utdata/rwd-billboard-data/main/data-out/hot-100-current.csv | CSV: chart_week,current_week,title,performer,last_week,peak_pos,wks_on_chart | ~340k chart rows | Aggregate to one row per (title, performer): first_week, last_week, peak_pos (min), weeks (max wks_on_chart), weeks_at_1, entries. |
| spotify | https://huggingface.co/datasets/maharshipandya/spotify-tracks-dataset/resolve/main/dataset.csv | CSV with header: ,track_id,artists,album_name,track_name,popularity,duration_ms,explicit,danceability,energy,key,loudness,mode,speechiness,acousticness,instrumentalness,liveness,valence,tempo,time_signature,track_genre | 114k | key is pitch class 0-11 (-1 unknown), mode 1 major 0 minor. Dedupe by track_id (the same track appears under several genres: collect genres into a list). |
| chordonomicon | https://huggingface.co/datasets/ailsntua/Chordonomicon/resolve/main/chordonomicon_v2.csv | CSV: id,chords,release_date,genres,decade,rock_genre,artist_id,main_genre,spotify_song_id,spotify_artist_id (264 MB) | 680k | chords = tokens with section markers like `<verse_1>`; chord names use `min`, `s` for sharp (Cs = C#), slash bass. License CC BY-NC 4.0: only aggregates ship. |
| lakh | http://hog.ee.columbia.edu/craffel/lmd/clean_midi.tar.gz (234 MB) | tar of `Artist Name/Song Title.mid` | ~17k files | Parse with mido. Skip files that fail to parse; count them. |
| groove | https://storage.googleapis.com/magentadata/datasets/groove/groove-v1.0.0-midionly.zip (3 MB) | zip with info.csv + MIDI takes | ~1,150 | Human drummers: measure microtiming and velocity per 16th slot. |
| mcgill | https://www.dropbox.com/scl/fi/t1qd5jsowvur7qzt5jww3/billboard-2.0-salami_chords.tar.gz?rlkey=aq5wi70gzctmt4niqgt2k8xea&dl=1 | tar of salami_chords.txt per song | 890 | Header lines: `# title:`, `# artist:`, `# metre:`, `# tonic:`; body lines `time \t | chords | ...`. If the download fails twice, skip the source and say so. |
| library | data/library/*.json (already in the repo) | one JSON per measured track (see the `facts` shape in any file) | 500 | Brady's own DJ library, heard by lib/ears. |

Download with curl, resume-safe (`-C -`), skip if the file exists with the expected size. Print each source's row count when done.

## 2. The DNA record (one row per song)

Write `data/dna/songs.parquet` with exactly these columns (null when unknown):

```
id            string   stable: sha1 of f"{source}|{artist_norm}|{title_norm}"
source        string   billboard | spotify | chordonomicon | lakh | mcgill | library
title         string
artist        string
artist_norm   string   lowercase, ascii-folded, "feat"/"featuring"/"&"/"and" and anything after " feat" removed, punctuation stripped, single spaces
title_norm    string   same folding; parenthetical and bracket tails removed; " - remaster"/" - live" tails removed
year          int16
decade        int16    year // 10 * 10
genres        list<string>   lowercase tags as the source gives them
family        string   one of: pop, rock, hiphop, rnb, country, electronic, latin, jazz, classical, folk, metal, world, other (fold the source tags with a keyword map you write in tools/dna/families.py; electronic includes house, techno, edm, dance, trance, garage, dnb, dubstep, disco)
lane          string   the studio lane when it can be told from tempo + family (tech-house 120-131 electronic, hard-house 136-148 electronic, melodic 110-119 electronic, dnb 160-180, trap/hiphop, pop, rock, other) else null
tempo         float32  BPM folded into 60-180 (halve or double)
key_pc        int8     pitch class 0-11 of the tonic (C=0)
mode          string   major | minor | null
time_sig      int8
duration_sec  float32
energy, danceability, valence, loudness, acousticness, speechiness, instrumentalness, popularity   float32  (spotify priors; loudness in LUFS-ish dB)
chart_peak    int16    best Hot 100 position ever
chart_weeks   int16
chart_first   date
chart_last    date
weeks_at_1    int16
hit_tier      string   number1 | top10 | top40 | charted | none
structure     string   section letters in order, e.g. "I V C V C B C O" (I intro, V verse, P pre, C chorus, B bridge, S solo, D drop, K breakdown, U build, O outro, X other); from chordonomicon markers, mcgill labels, or lakh repetition analysis
section_count int16
first_chorus_bar int16   bar index where the first chorus/drop starts, when known
chorus_share  float32  fraction of bars that are chorus/drop
progression   string   the condensed chord progression of the whole song in Roman numerals relative to the detected key, runs collapsed, max 24 symbols, e.g. "I V vi IV" or "i bVI bIII bVII"
chorus_progression string   same, for the first chorus only, when sections exist
harmony_class string   one of: axis (I V vi IV family incl. rotations), minor_axis (i bVI bIII bVII family), blues (I IV V twelve bar), doo_wop (I vi IV V), andalusian (i bVII bVI V), two_chord, one_chord, modal_mixture, other   (write the classifier in tools/dna/harmony.py; document the rule)
chord_vocab   int16    distinct chords in the song
borrowed      int16    chords outside the diatonic set of the detected key
kick_grid     string   16 chars per bar pattern like "X...X...X...X..." (majority vote over the song's bars) from MIDI channel 10 notes 35/36
snare_grid    string   notes 38/40 (and claps 39)
hat_grid      string   notes 42/44 (closed) with "o" for 46 (open)
bass_rhythm   string   8 chars (eighths) "X" where the bass plays, from the lowest-register melodic track
syncopation   float32  0-1: share of drum onsets on weak 16ths (positions 1,3,5,7,9,11,13,15 of the 16) among all drum onsets
swing         float32  0.5 straight .. 0.67 triplet, from the median offset of offbeat 16ths (lakh/groove only)
melody_contour string  arch | rise | fall | flat | wave, from the highest-register melodic track's first 8 bars
interval_mean float32  mean absolute melodic interval in semitones
range_semis   int16
repetition    float32  0-1: share of 2-bar melodic cells that repeat an earlier cell exactly
valence_read, arousal_read, tension_read, warmth_read   float32   derived (section 4)
```

Rows from different sources describing the same song stay separate rows (the `id` includes the source). A join key `join_key = artist_norm + "|" + title_norm` lets the artist rollup merge them.

## 3. Rollups

`data/dna/artists.parquet`: one row per `artist_norm`: display name (most common spelling), song_count, chart_songs, number_ones, first_year, last_year, decades[], families[], tempo_p10/p50/p90, mode_major_share, top_keys (3), top_progressions (5 with counts), top_harmony_class, energy_p50, valence_p50, danceability_p50, structure_mode (the most common structure string), kick_grid_mode, bass_rhythm_mode, melody_contour_mode, exemplars (up to 12 titles ordered by chart_peak then popularity).

`data/dna/buckets.parquet`: the Galton bins. Bin key = (tempo_band, meter_feel, mode, decade, family, structure_archetype, harmony_class, hit_tier) with these pins:

- tempo_band: `<90`, `90-110`, `110-122`, `122-132`, `132-145`, `145-160`, `>160`
- meter_feel: `four_floor` (kick on all four beats), `backbeat` (snare 2 and 4, kick not on every beat), `broken`, `halftime`, `unknown` (no grid)
- mode: major | minor | unknown
- decade
- family
- structure_archetype: `verse_chorus` (V and C both present), `loop` (one or two section types), `build_drop` (U or D present), `through` (four or more distinct types without a chorus), `unknown`
- harmony_class (section 2)
- hit_tier

Each bin row: count, and for every numeric column p10/p50/p90, top 5 progressions with counts, top 3 kick/snare/hat grids, top 3 bass rhythms, top 3 melody contours, energy contour when available, up to 12 exemplars ("Artist: Title (year)"). Also write the marginal bins for every prefix of the pin order (tempo_band alone; tempo_band+meter_feel; ...) so a request that only names two pins still lands somewhere. Total bins should be tens of thousands at most; write them all to parquet and a compact `data/galton.json` (committed, target under 400 KB) containing only bins with count >= 20 and the fields the brain reads (count, tempo p50, mode share, top 5 progressions, top kick grid, top bass rhythm, top contour, energy contour, 6 exemplars).

`data/dna/patterns.parquet`: the archetype table: kind (kick | snare | hat | bass | contour | progression | structure), pattern, family, decade, count, hit_share (share of rows with hit_tier != none), tempo_p50.

`data/dna/humanize.json` (committed, small): from Groove MIDI: per style (funk, rock, jazz, latin, hiphop, afrobeat, ...) and per 16th slot: median timing offset in ms relative to the grid, its IQR, median velocity, velocity IQR; plus the global swing distribution. This is the "human not perfect" number set the engine's groove pool can copy.

`data/dna/hits.json` (committed, small): the answers to "why do hits work", computed as tables the brain can quote: by decade, the tempo p50 of number ones vs never-charted; mode share of number ones vs charted; first_chorus_bar distribution of number ones; structure strings of number ones (top 10); harmony_class share of number ones vs everything; median duration of number ones by decade; the most common opening progression (first 4 chords) among number ones by decade; and, from the spotify priors, energy/danceability/valence p50 by hit tier where the join finds matches (report the join rate).

## 4. Feel (derived, same rule for every row)

```
valence_read = clamp01(0.5 + 0.25*(mode==major) - 0.25*(mode==minor) + 0.20*(valence_prior - 0.5 if known else 0) + 0.10*(tempo in 100..130) - 0.10*(tension_read - 0.5))
arousal_read = clamp01(0.15 + 0.45*normalize(tempo, 60, 180) + 0.30*(energy_prior if known else 0.5) + 0.10*syncopation)
tension_read = clamp01(0.30 + 0.25*(mode==minor) + 0.30*normalize(borrowed, 0, 6) + 0.15*(harmony_class in {modal_mixture, other}))
warmth_read  = clamp01(0.35 + 0.25*(acousticness_prior if known else 0.3) + 0.20*(mode==major) - 0.20*normalize(tempo, 60, 180) + 0.10*(family in {rnb, jazz, folk}))
```

Document the formula in `tools/dna/feel.py` and keep it identical to `lib/brain/feel.ts` (the TypeScript side is written by the main session; match the constants above).

## 5. Loading into Postgres (write the loader, run it if the connection works)

`tools/dna/load_pg.py --dsn "$DNA_PG_DSN"`: creates the tables below if missing (idempotent), truncates and bulk-loads with COPY: `dna_songs` (every column of songs.parquet, lists as text[]), `dna_artists`, `dna_buckets` (bin key columns + a jsonb `stats`), `dna_patterns`. Indexes: `dna_songs (artist_norm)`, `dna_songs (title_norm)`, trigram GIN on `artist_norm` and `title_norm` (`create extension if not exists pg_trgm`), `dna_songs (lane, decade)`, `dna_artists (artist_norm)` unique, `dna_buckets (tempo_band, meter_feel, mode, decade, family, structure_archetype, harmony_class, hit_tier)`. Also `research_cache (key text primary key, answer jsonb, created_at timestamptz default now())`. Write the same DDL to `supabase/migrations/0008_dna.sql` (additive only, with RLS enabled and a read policy for authenticated users on the dna_* tables; the service role loads them).

If no DSN is given or the connection fails, skip loading, say so in the report, and leave the parquet files and `data/galton.json` as the deliverable.

## 6. Speed and honesty

- Use pandas with chunked CSV reads; the chordonomicon file is 264 MB.
- MIDI parsing with mido across 17k files should take a few minutes; run it with a multiprocessing pool.
- Print timings per stage. Print how many rows each stage dropped and why.
- Never invent a number. If a field cannot be derived for a source, it stays null.
- The final report lists: rows per source, join rate between billboard and spotify, bins written, galton.json size, load status, and five example lookups printed from the parquet: "elvis presley", "john summit", "kettama", the 122-132/four_floor/minor/2020/electronic bin, and the top opening progressions of number ones in the 1960s.
