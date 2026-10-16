-- Promises: things you promise yourself — "not to smoke", "no coffee", "read every day"… with streaks and progress.
-- Run once in Supabase → SQL Editor (safe to run again).

create table if not exists public.promises (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null check (length(trim(title)) between 1 and 120),
  why        text not null default '' check (length(why) <= 300),          -- your reason, shown when it gets hard
  emoji      text not null default '🤝' check (length(emoji) <= 16),
  kind       text not null default 'avoid' check (kind in ('avoid', 'do')), -- avoid = "not to …", do = "to … every day"
  start_date date not null default current_date,
  goal_days  integer check (goal_days is null or goal_days between 1 and 3650), -- empty = for good
  cost       numeric(10, 2) check (cost is null or cost >= 0),            -- money saved for each day kept (optional)
  ended_at   date,                                                         -- finished or stopped
  created_at timestamptz not null default now()
);

-- One row per day you said something: kept = true (I kept it) or false (I broke it), with an optional note.
-- "avoid" promises count a day as kept unless you say you broke it; "do" promises need a tick.
create table if not exists public.promise_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  promise_id uuid not null references public.promises(id) on delete cascade,
  day        date not null,
  kept       boolean not null,
  note       text not null default '' check (length(note) <= 300),
  created_at timestamptz not null default now(),
  unique (promise_id, day)
);

alter table public.promises enable row level security;
alter table public.promise_logs enable row level security;
drop policy if exists "own rows" on public.promises;
create policy "own rows" on public.promises for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- a log must belong to you AND to one of your own promises
drop policy if exists "own rows" on public.promise_logs;
create policy "own rows" on public.promise_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (select 1 from public.promises p where p.id = promise_id and p.user_id = auth.uid()));
create index if not exists promises_user on public.promises (user_id);
create index if not exists promise_logs_promise_day on public.promise_logs (promise_id, day desc);
create index if not exists promise_logs_user on public.promise_logs (user_id);
