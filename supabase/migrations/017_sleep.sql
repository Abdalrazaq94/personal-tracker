-- Sleep: when you went to bed and when you woke up, one row per night.
-- "night" = the date of the morning you woke up (the night of Tue→Wed is saved as Wednesday).
-- Run once in Supabase → SQL Editor (safe to run again).
create table if not exists public.sleep_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  night      date not null,
  bed_at     timestamptz not null,
  wake_at    timestamptz,                                   -- empty while you're still asleep
  quality    smallint check (quality between 1 and 5),      -- how well you slept (optional)
  note       text not null default '' check (length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, night),
  constraint sleep_logs_order check (wake_at is null or (wake_at > bed_at and wake_at < bed_at + interval '20 hours'))
);
alter table public.sleep_logs enable row level security;
drop policy if exists "own rows" on public.sleep_logs;
create policy "own rows" on public.sleep_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists sleep_logs_user_night on public.sleep_logs (user_id, night desc);

-- How many hours you want to sleep (default 8).
alter table public.user_settings add column if not exists sleep_goal numeric(3, 1) not null default 8
  check (sleep_goal between 4 and 12);
