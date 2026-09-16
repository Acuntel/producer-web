-- Section 16: MusicBrainz's fine genres as a table the research lane can answer from.
create table if not exists public.dna_genres (
  genre text primary key,
  artists integer not null, primary_artists integer, songs integer, chart_songs integer,
  tempo_p50 real, energy_p50 real, family text, exemplars jsonb
);
create index if not exists dna_genres_trgm_idx on public.dna_genres using gin (genre gin_trgm_ops);
alter table public.dna_genres enable row level security;
drop policy if exists genres_read on public.dna_genres;
create policy genres_read on public.dna_genres for select using (true);
