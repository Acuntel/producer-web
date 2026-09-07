-- A record seen at a known link is served without downloading it again.
alter table public.record_cache add column if not exists source_urls jsonb not null default '[]'::jsonb;
create index if not exists record_cache_urls on public.record_cache using gin (source_urls);
