-- The cache matches by fingerprint similarity, not an exact hash: keep the raw fingerprint and the duration.
alter table public.record_cache add column if not exists raw jsonb;
alter table public.record_cache add column if not exists duration_sec numeric;
create index if not exists record_cache_duration on public.record_cache(duration_sec);
