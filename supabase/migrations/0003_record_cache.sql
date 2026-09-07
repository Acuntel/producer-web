-- One analyzed record serves everyone: a fingerprint keyed cache, and a shared read-only storage area.
create table if not exists public.record_cache (
  fingerprint text primary key,
  base_path text not null,
  result jsonb not null,
  first_owner uuid,
  hits integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.record_cache enable row level security;
drop policy if exists record_cache_read on public.record_cache;
create policy record_cache_read on public.record_cache for select to authenticated using (true);
-- Any signed-in user may READ shared/* in the clips bucket; only the service role writes there.
drop policy if exists clips_shared_read on storage.objects;
create policy clips_shared_read on storage.objects for select to authenticated
  using (bucket_id = 'clips' and (storage.foldername(name))[1] = 'shared');
