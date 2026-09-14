-- Billboard credits featured/backing acts inline ("Elvis Presley With The
-- Jordanaires"); billboard.py now folds those rows into the head artist so
-- the artist rollup attributes all of an artist's charting correctly, and
-- keeps the literal chart credit here for anyone who wants it.
alter table public.dna_songs add column if not exists performer_raw text;
