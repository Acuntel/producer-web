-- Where the voice sits before the drop, measured on records the studio has actually heard.
-- One row per record: the phrases found in its isolated vocal, and how far the last one finished
-- before the record's own drop. The placement rule reads the median of these instead of a constant.
create table if not exists public.dna_vocal_drops (
  key text primary key,                 -- the same record key dna_heard uses
  artist text, title text,
  family text, tempo real, drop_sec real,
  phrases integer not null default 0,   -- how many phrases the isolated vocal held
  lead_in_sec real,                     -- from the end of the last phrase before the drop, to the drop
  lead_in_beats real,
  phrase_sec real,                      -- how long that phrase was
  carries_through boolean,              -- whether the voice keeps going past the drop
  measured_at timestamptz not null default now()
);
create index if not exists dna_vocal_drops_family on public.dna_vocal_drops(family, tempo);
alter table public.dna_vocal_drops enable row level security;
drop policy if exists dna_vocal_drops_read on public.dna_vocal_drops;
create policy dna_vocal_drops_read on public.dna_vocal_drops for select using (true);
