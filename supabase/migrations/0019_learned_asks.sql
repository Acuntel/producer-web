-- What the studio has already gone looking for, under the name the CHART calls it.
--
-- A record comes back from the ears under the name the recognition service knows ("HAVEN. & Kaitlin
-- Aragon"), which is not the name the chart printed ("Haven featuring Kaitlin Aragon"). Matching the
-- heard rows against the charts by name therefore never matches, and the studio learns the same
-- record again and again. This table remembers the asking, not the answer.
create table if not exists public.dna_learned_asks (
  artist_norm text not null,
  title_norm text not null,
  heard_key text,                 -- the dna_heard row it turned into, when it turned into one
  ok boolean not null default false,
  tries integer not null default 1,
  last_error text,
  last_try timestamptz not null default now(),
  primary key (artist_norm, title_norm)
);
alter table public.dna_learned_asks enable row level security;
drop policy if exists dna_learned_asks_read on public.dna_learned_asks;
create policy dna_learned_asks_read on public.dna_learned_asks for select using (true);
