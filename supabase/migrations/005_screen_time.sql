-- Phone time: how long you used your phone each day, and on which apps.
-- Run once in Supabase → SQL Editor (safe to run again).

create table if not exists public.screen_time (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day           date not null,
  total_minutes integer not null default 0 check (total_minutes between 0 and 1440),
  unlocks       integer,
  apps          jsonb not null default '[]'::jsonb,   -- [{ "name": "WhatsApp", "minutes": 52 }, …]
  source        text not null default '',            -- 'photo' = read from a screenshot, '' = typed in
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, day)
);

alter table public.screen_time enable row level security;
drop policy if exists "own rows" on public.screen_time;
create policy "own rows" on public.screen_time for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists screen_time_user_idx on public.screen_time (user_id);

-- the private key the phone helper uses (same key as Google Wallet; safe if it already exists)
alter table public.user_settings add column if not exists ingest_token text;
create unique index if not exists user_settings_ingest_token_key
  on public.user_settings (ingest_token) where ingest_token is not null and ingest_token <> '';
