-- A DJ mix read once (its tracklist) serves everyone who asks for that mix again.
create table if not exists public.mix_cache (
  source_url text primary key,
  result jsonb not null,
  hits integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.mix_cache enable row level security;
drop policy if exists mix_cache_read on public.mix_cache;
create policy mix_cache_read on public.mix_cache for select to authenticated using (true);
