-- Records the studio has actually heard: every stems job (any user, any source) leaves one row,
-- keyed by identity when Shazam named it, else by the job's name. Store rebuilds never touch it.
create table if not exists public.dna_heard (
  key text primary key,
  title text,
  artist text,
  artist_norm text,
  title_norm text,
  year integer,
  label text,
  isrc text,
  tempo real,
  key_name text,
  bars integer,
  energy_contour jsonb,
  hearing jsonb,
  heard_count integer not null default 1,
  first_heard timestamptz not null default now(),
  last_heard timestamptz not null default now()
);
create index if not exists dna_heard_artist_norm_idx on public.dna_heard (artist_norm);
create index if not exists dna_heard_title_norm_idx on public.dna_heard (title_norm);
alter table public.dna_heard enable row level security;
drop policy if exists heard_read on public.dna_heard;
create policy heard_read on public.dna_heard for select using (auth.role() = 'authenticated');
