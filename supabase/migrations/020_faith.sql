-- Faith for everyone: daily practices for Christianity, Judaism, Hinduism or your own (Islam keeps its prayer page).
-- Your faith choice is saved with your Home layout (019_home_layout.sql).
-- Run once in Supabase → SQL Editor (safe to run again).

create table if not exists public.practices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  faith         text not null default 'custom' check (faith in ('islam', 'christian', 'jewish', 'hindu', 'custom')),
  title         text not null check (length(trim(title)) between 1 and 80),
  emoji         text not null default '✨' check (length(emoji) <= 16),
  kind          text not null default 'check' check (kind in ('check', 'count')),  -- tick once, or count up to a target (e.g. japa 108)
  target        integer not null default 1 check (target between 1 and 10000),
  unit          text not null default '' check (length(unit) <= 30),
  days          smallint[] check (days is null or days <@ array[0,1,2,3,4,5,6]::smallint[]),  -- 0 = Sunday … 6 = Saturday; empty = every day
  time          text check (time is null or time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),          -- "07:00", shown and used for the reminder
  remind        boolean not null default false,
  special       text check (special is null or special in ('shabbat')),               -- Shabbat: time from your city's sunset
  sort          integer not null default 0,
  archived      boolean not null default false,
  last_notified date,
  created_at    timestamptz not null default now()
);

create table if not exists public.practice_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  day         date not null,
  count       integer not null default 1 check (count between 0 and 100000),
  created_at  timestamptz not null default now(),
  unique (practice_id, day)
);

alter table public.practices enable row level security;
alter table public.practice_logs enable row level security;
drop policy if exists "own rows" on public.practices;
create policy "own rows" on public.practices for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own rows" on public.practice_logs;
create policy "own rows" on public.practice_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (select 1 from public.practices p where p.id = practice_id and p.user_id = auth.uid()));
create index if not exists practices_user on public.practices (user_id);
create index if not exists practice_logs_practice_day on public.practice_logs (practice_id, day desc);
create index if not exists practice_logs_user_day on public.practice_logs (user_id, day);
