-- Section 18: the charts (every genre, every year) and the fame score per song.
create table if not exists public.dna_charts (
  id bigserial primary key,
  chart text not null, source_page text, year smallint, position integer, yearend boolean not null default false,
  artist text, title text, artist_norm text, title_norm text, store_family text
);
create index if not exists dna_charts_year_chart_idx on public.dna_charts (year, chart);
create index if not exists dna_charts_family_year_idx on public.dna_charts (store_family, year);
create index if not exists dna_charts_names_idx on public.dna_charts (artist_norm, title_norm);
alter table public.dna_charts enable row level security;
drop policy if exists charts_read on public.dna_charts;
create policy charts_read on public.dna_charts for select using (true);

create table if not exists public.dna_fame (
  artist_norm text not null, title_norm text not null, artist text, title text,
  fame real not null, chart_score real, listen_score real, buys real, listens bigint,
  best_rank integer, chart_hits integer, chart_families integer, chart_years integer, charts jsonb, years jsonb,
  primary key (artist_norm, title_norm)
);
create index if not exists dna_fame_fame_idx on public.dna_fame (fame desc);
alter table public.dna_fame enable row level security;
drop policy if exists fame_read on public.dna_fame;
create policy fame_read on public.dna_fame for select using (true);
