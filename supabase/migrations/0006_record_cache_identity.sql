-- A record identified by sound (its recognition key) is served from the cache from any copy or capture.
alter table public.record_cache add column if not exists identity text;
create index if not exists record_cache_identity on public.record_cache(identity);
