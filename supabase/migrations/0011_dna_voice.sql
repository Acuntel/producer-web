-- Section 12 of the masterprompt: the voice probability and the MusicBrainz artist gid ride with every song.
alter table public.dna_songs add column if not exists voice real;
alter table public.dna_songs add column if not exists artist_mbid text;
