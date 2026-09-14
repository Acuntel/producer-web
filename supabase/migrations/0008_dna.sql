-- The Galton store: one song is one row of condensed DNA (docs/DNA_SPEC.md).
-- Loaded by tools/dna/load_pg.py (service role); read-only for the app.
create extension if not exists pg_trgm;

create table if not exists public.dna_songs (
  id text primary key,
  source text, title text, artist text, artist_norm text, title_norm text, join_key text,
  year smallint, decade smallint, genres text[], family text, lane text,
  tempo real, key_pc smallint, mode text, time_sig smallint, duration_sec real,
  energy real, danceability real, valence real, loudness real, acousticness real,
  speechiness real, instrumentalness real, popularity real,
  chart_peak smallint, chart_weeks smallint, chart_first date, chart_last date, weeks_at_1 smallint,
  hit_tier text,
  structure text, section_count smallint, first_chorus_bar smallint, chorus_share real,
  progression text, chorus_progression text, harmony_class text,
  chord_vocab smallint, borrowed smallint,
  kick_grid text, snare_grid text, hat_grid text, bass_rhythm text,
  syncopation real, swing real,
  melody_contour text, interval_mean real, range_semis smallint, repetition real,
  valence_read real, arousal_read real, tension_read real, warmth_read real
);
create index if not exists dna_songs_artist_norm_idx on public.dna_songs (artist_norm);
create index if not exists dna_songs_title_norm_idx on public.dna_songs (title_norm);
create index if not exists dna_songs_artist_norm_trgm_idx on public.dna_songs using gin (artist_norm gin_trgm_ops);
create index if not exists dna_songs_title_norm_trgm_idx on public.dna_songs using gin (title_norm gin_trgm_ops);
create index if not exists dna_songs_lane_decade_idx on public.dna_songs (lane, decade);
alter table public.dna_songs enable row level security;
drop policy if exists dna_songs_read on public.dna_songs;
create policy dna_songs_read on public.dna_songs for select to authenticated using (true);

create table if not exists public.dna_artists (
  artist_norm text primary key,
  display_name text, song_count integer, chart_songs integer, number_ones integer,
  first_year smallint, last_year smallint, decades smallint[], families text[],
  tempo_p10 real, tempo_p50 real, tempo_p90 real, mode_major_share real,
  top_keys jsonb, top_progressions jsonb, top_harmony_class text,
  energy_p50 real, valence_p50 real, danceability_p50 real,
  structure_mode text, kick_grid_mode text, bass_rhythm_mode text, melody_contour_mode text,
  exemplars text[]
);
create unique index if not exists dna_artists_artist_norm_idx on public.dna_artists (artist_norm);
alter table public.dna_artists enable row level security;
drop policy if exists dna_artists_read on public.dna_artists;
create policy dna_artists_read on public.dna_artists for select to authenticated using (true);

-- One row per Galton bin, at every prefix level of the pin order (1-8 pins
-- populated; the rest null for a marginal bin). Rich per-bin content
-- (percentiles, top progressions/grids/exemplars) lives in `stats` jsonb.
create table if not exists public.dna_buckets (
  id bigserial primary key,
  level smallint not null,
  tempo_band text, meter_feel text, mode text, decade text, family text,
  structure_archetype text, harmony_class text, hit_tier text,
  count integer not null, mode_share real,
  stats jsonb
);
create index if not exists dna_buckets_pins_idx on public.dna_buckets
  (tempo_band, meter_feel, mode, decade, family, structure_archetype, harmony_class, hit_tier);
alter table public.dna_buckets enable row level security;
drop policy if exists dna_buckets_read on public.dna_buckets;
create policy dna_buckets_read on public.dna_buckets for select to authenticated using (true);

create table if not exists public.dna_patterns (
  id bigserial primary key,
  kind text not null, pattern text, family text, decade text,
  count integer not null, hit_share real, tempo_p50 real
);
create index if not exists dna_patterns_kind_idx on public.dna_patterns (kind, count desc);
alter table public.dna_patterns enable row level security;
drop policy if exists dna_patterns_read on public.dna_patterns;
create policy dna_patterns_read on public.dna_patterns for select to authenticated using (true);

create table if not exists public.research_cache (
  key text primary key,
  answer jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.research_cache enable row level security;
drop policy if exists research_cache_read on public.research_cache;
create policy research_cache_read on public.research_cache for select to authenticated using (true);
