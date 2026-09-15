-- Section 13: Postgres holds only what the product reads. The full record stays in data/dna/songs.parquet.
alter table public.dna_songs
  drop column if exists performer_raw, drop column if exists join_key, drop column if exists genres, drop column if exists lane,
  drop column if exists time_sig, drop column if exists duration_sec, drop column if exists loudness, drop column if exists acousticness,
  drop column if exists speechiness, drop column if exists instrumentalness, drop column if exists popularity,
  drop column if exists chart_first, drop column if exists chart_last, drop column if exists weeks_at_1,
  drop column if exists section_count, drop column if exists first_chorus_bar, drop column if exists chorus_share,
  drop column if exists chorus_progression, drop column if exists harmony_class, drop column if exists chord_vocab, drop column if exists borrowed,
  drop column if exists kick_grid, drop column if exists snare_grid, drop column if exists hat_grid, drop column if exists bass_rhythm,
  drop column if exists syncopation, drop column if exists swing, drop column if exists melody_contour, drop column if exists interval_mean,
  drop column if exists range_semis, drop column if exists repetition,
  drop column if exists valence_read, drop column if exists arousal_read, drop column if exists tension_read, drop column if exists warmth_read,
  drop column if exists voice, drop column if exists artist_mbid, drop column if exists decade;
drop index if exists public.dna_songs_lane_decade_idx;
