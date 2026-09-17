-- The vault: every piece of audio a record references can be found again from any device.
-- The browser names its clips (clip_..., stem_..., shot_..., grab_...); that name is what a song
-- carries, so it is what the row has to be found by.
alter table public.clips add column if not exists clip_key text;
alter table public.clips add column if not exists bytes bigint;
create unique index if not exists clips_owner_clip_key on public.clips(owner, clip_key) where clip_key is not null;
create index if not exists clips_project_created on public.clips(project_id, created_at desc);
