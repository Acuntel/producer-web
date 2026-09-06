-- The Producer: accounts, projects, versions, clips, taste, jobs. One owner per row, RLS everywhere.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  anthropic_key_enc text,
  anthropic_key_hint text,
  elevenlabs_key_enc text,
  elevenlabs_key_hint text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  title text not null,
  lane text,
  bpm numeric,
  key text,
  song jsonb not null,
  facts jsonb,
  version_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  opened_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists projects_owner_updated on public.projects(owner, updated_at desc);

create table if not exists public.versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  song jsonb not null,
  label text,
  facts jsonb,
  created_at timestamptz not null default now()
);
create index if not exists versions_project_created on public.versions(project_id, created_at desc);

create table if not exists public.clips (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  name text not null,
  storage_path text not null,
  mime text,
  duration_sec numeric,
  bpm numeric,
  key text,
  source jsonb,
  created_at timestamptz not null default now()
);
create index if not exists clips_owner_created on public.clips(owner, created_at desc);

create table if not exists public.taste_events (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists taste_owner_created on public.taste_events(owner, created_at desc);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  kind text not null,
  source jsonb not null,
  status text not null default 'queued',
  progress integer not null default 0,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_owner_created on public.jobs(owner, created_at desc);

-- updated_at upkeep
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs for each row execute function public.touch_updated_at();

-- a profile row for every new user
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- RLS: you see and touch only your own rows
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.versions enable row level security;
alter table public.clips enable row level security;
alter table public.taste_events enable row level security;
alter table public.jobs enable row level security;

drop policy if exists profiles_own on public.profiles;
create policy profiles_own on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists projects_own on public.projects;
create policy projects_own on public.projects for all using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists versions_own on public.versions;
create policy versions_own on public.versions for all using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists clips_own on public.clips;
create policy clips_own on public.clips for all using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists taste_own on public.taste_events;
create policy taste_own on public.taste_events for all using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists jobs_own on public.jobs;
create policy jobs_own on public.jobs for all using (owner = auth.uid()) with check (owner = auth.uid());

-- The encrypted key columns are written only by the server (service role); the client never reads them back.
revoke select (anthropic_key_enc, elevenlabs_key_enc) on public.profiles from anon, authenticated;

-- Storage: one private bucket, files live under <owner uuid>/...
insert into storage.buckets (id, name, public, file_size_limit)
  values ('clips', 'clips', false, 104857600)
  on conflict (id) do update set public = false, file_size_limit = 104857600;
drop policy if exists clips_bucket_own on storage.objects;
create policy clips_bucket_own on storage.objects for all
  using (bucket_id = 'clips' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'clips' and (storage.foldername(name))[1] = auth.uid()::text);
