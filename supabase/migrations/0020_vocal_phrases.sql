-- Where a voice sits against a record's peaks, learned from every record the worker hears (a person's stems job
-- and the learning lane alike). Numbers only: no audio, no lyric text. Keyed by the SOURCE record's family, tempo
-- band and structure archetype, never by the lane of the song it was pulled into (docs/MASTERPROMPT_PRODUCER.md
-- section 6). tools/dna/vocal_drops.py rolls these rows up into data/dna/vocal_drops.json for the planner.
-- Written 2026-09-27 on producer-worker. NOT applied: applying migrations to the live project is Brady's call.

create table if not exists public.dna_vocal_phrases (
  record_key text not null,            -- the key dna_heard uses: id:<recognition key>, else job:<job id>
  phrase integer not null,             -- the phrase id in the record's vocal map
  family text, tempo real, tempo_band text, archetype text,
  section text,                        -- intro, verse, chorus, build, drop, break, outro (the source's own)
  start_sec real, end_sec real, dur_beats real,
  source_bar integer, source_beat real, pickup_beats real,
  peak_label text, peak_bar integer,   -- the next peak (a drop or a chorus) at or after the phrase
  lead_in_beats real,                  -- from the phrase's end to that peak's first downbeat
  anchor_to_peak_beats real,           -- from the stressed syllable to that downbeat
  bar_in_section real, section_bars integer,
  boundary_beats real,                 -- from the nearest section boundary to the stressed syllable
  hook_score real, repeats integer, is_hook boolean,
  key_rel integer, in_key real, vocal_share real,
  measured_at timestamptz not null default now(),
  primary key (record_key, phrase)
);
create index if not exists dna_vocal_phrases_pins on public.dna_vocal_phrases(family, tempo_band, archetype);
alter table public.dna_vocal_phrases enable row level security;
drop policy if exists dna_vocal_phrases_read on public.dna_vocal_phrases;
create policy dna_vocal_phrases_read on public.dna_vocal_phrases for select using (true);

-- The lead-in rows gain the same pins, and say who measured them: rows the browser wrote before this migration
-- were filed under the lane of the song the vocal went into, which is the bug this corrects.
alter table public.dna_vocal_drops add column if not exists tempo_band text;
alter table public.dna_vocal_drops add column if not exists archetype text;
alter table public.dna_vocal_drops add column if not exists measured_by text;   -- 'worker', 'backfill' or null (the browser, lane-keyed)
create index if not exists dna_vocal_drops_pins on public.dna_vocal_drops(family, tempo_band, archetype);
