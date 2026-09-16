-- Section 14 of the masterprompt: the server-side usage ledger with the house allowance, and the taste ledger per account.
create table if not exists public.usage_events (
  id bigserial primary key,
  user_id uuid,
  key_source text not null,
  route text not null,
  model text,
  input_tokens integer not null default 0, output_tokens integer not null default 0,
  cache_read integer not null default 0, cache_write integer not null default 0, searches integer not null default 0,
  usd numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_user_day_idx on public.usage_events (user_id, created_at desc);
create index if not exists usage_events_day_idx on public.usage_events (created_at desc);
alter table public.usage_events enable row level security;
drop policy if exists "own usage" on public.usage_events;
create policy "own usage" on public.usage_events for select using (auth.uid() = user_id);

-- Today's house-key spend (UTC day): the caller's and everyone's. Security definer so the service role is not needed to read.
create or replace function public.usage_today(uid uuid)
returns table (mine numeric, "all" numeric) language sql security definer stable as $$
  select coalesce(sum(usd) filter (where user_id = uid), 0) as mine, coalesce(sum(usd), 0) as "all"
  from public.usage_events
  where key_source = 'house' and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;

create table if not exists public.taste_moves (
  id text primary key,
  user_id uuid not null,
  at bigint not null,
  title text, said text, move text, listen text, facts_summary text,
  verdict text,
  updated_at timestamptz not null default now()
);
create index if not exists taste_moves_user_at_idx on public.taste_moves (user_id, at desc);
alter table public.taste_moves enable row level security;
drop policy if exists "own taste" on public.taste_moves;
create policy "own taste" on public.taste_moves for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.taste_pairs (
  id bigserial primary key,
  user_id uuid not null,
  at bigint not null,
  title text, label text, chosen text, a_diff text, b_diff text
);
create index if not exists taste_pairs_user_at_idx on public.taste_pairs (user_id, at desc);
alter table public.taste_pairs enable row level security;
drop policy if exists "own pairs" on public.taste_pairs;
create policy "own pairs" on public.taste_pairs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
