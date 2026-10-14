-- Commitments → Prayer: which of the 5 prayers you prayed each day, and whether it was late.
-- Run once in Supabase → SQL Editor (safe to run again).

create table if not exists public.prayer_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  prayer     text not null check (prayer in ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha')),
  late       boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, day, prayer)
);

alter table public.prayer_logs enable row level security;
drop policy if exists "own rows" on public.prayer_logs;
create policy "own rows" on public.prayer_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists prayer_logs_user_idx on public.prayer_logs (user_id);
