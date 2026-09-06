-- Memory: a project carries its conversation and a one-line summary so a session picks up where it left off.
alter table public.projects add column if not exists chat jsonb not null default '[]'::jsonb;
alter table public.projects add column if not exists summary text;
alter table public.projects add column if not exists notes text;
