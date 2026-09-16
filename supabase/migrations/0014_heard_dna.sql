-- Section 15: every heard record carries its DNA fields, computed from the hearing by the heard route.
alter table public.dna_heard
  add column if not exists key_pc smallint, add column if not exists mode text,
  add column if not exists progression text, add column if not exists harmony_class text,
  add column if not exists chords text, add column if not exists structure text,
  add column if not exists kick_grid text, add column if not exists snare_grid text, add column if not exists hat_grid text,
  add column if not exists bass_rhythm text, add column if not exists bass_root text, add column if not exists syncopation real,
  add column if not exists energy real, add column if not exists family text, add column if not exists descriptors text;
