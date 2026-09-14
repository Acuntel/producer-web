-- The dance canon: what DJs actually play, read from their mixes by the worker's tracklist jobs.
-- One row per identified record in a mix; one row per mix. Additive, RLS on, readable by signed-in users.
create table if not exists public.dna_canon_mixes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  dj text,
  query text,
  source_url text,
  duration_sec numeric,
  covered_sec numeric,
  entries integer not null default 0,
  job_id uuid,
  created_at timestamptz not null default now()
);
create table if not exists public.dna_canon (
  id uuid primary key default gen_random_uuid(),
  mix_id uuid not null references public.dna_canon_mixes(id) on delete cascade,
  mix_name text not null,
  dj text,
  position_sec numeric,
  artist text,
  title text,
  artist_norm text,
  title_norm text,
  year integer,
  label text,
  isrc text,
  pitch_pct numeric,
  hits integer,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists dna_canon_artist_norm_idx on public.dna_canon (artist_norm);
create index if not exists dna_canon_dj_idx on public.dna_canon (dj);
alter table public.dna_canon_mixes enable row level security;
alter table public.dna_canon enable row level security;
drop policy if exists canon_mixes_read on public.dna_canon_mixes;
create policy canon_mixes_read on public.dna_canon_mixes for select using (auth.role() = 'authenticated');
drop policy if exists canon_read on public.dna_canon;
create policy canon_read on public.dna_canon for select using (auth.role() = 'authenticated');
