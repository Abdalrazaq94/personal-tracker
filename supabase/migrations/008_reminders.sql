-- Reminders: phone notifications for plans (with a time) and prayers.
-- Run once in Supabase → SQL Editor (safe to run again).
-- Needs the "notify" Edge Function deployed (with Verify JWT OFF).

-- 1) plans: important, remind earlier, postpone, and what was already sent
alter table public.plans add column if not exists plan_time       time;
alter table public.plans add column if not exists important       boolean not null default false;
alter table public.plans add column if not exists remind_before   integer not null default 0;   -- minutes before (0, 15, 60, 1440)
alter table public.plans add column if not exists snoozed_until   timestamptz;
alter table public.plans add column if not exists notify_count    integer not null default 0;
alter table public.plans add column if not exists last_notified   timestamptz;

-- 2) where to send notifications (one row per phone / browser)
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  secret     text not null,                       -- lets the notification's Done / Postpone buttons work
  device     text not null default '',
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own rows" on public.push_subscriptions;
create policy "own rows" on public.push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3) your reminder settings (time zone, prayer reminders)
alter table public.user_settings add column if not exists tz               text not null default 'Europe/London';
alter table public.user_settings add column if not exists prayer_place     jsonb;
alter table public.user_settings add column if not exists prayer_notify    boolean not null default false;
alter table public.user_settings add column if not exists prayer_repeat    boolean not null default true;

-- 4) prayer reminders already sent (so each prayer is announced once, then repeated only if you asked)
create table if not exists public.prayer_alerts (
  user_id       uuid not null references auth.users(id) on delete cascade,
  day           date not null,
  prayer        text not null,
  count         integer not null default 0,
  last_at       timestamptz,
  snoozed_until timestamptz,
  primary key (user_id, day, prayer)
);
alter table public.prayer_alerts enable row level security;
drop policy if exists "own rows" on public.prayer_alerts;
create policy "own rows" on public.prayer_alerts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5) the server's own keys (only the server can read this table: no policies)
create table if not exists public.push_config (
  id          integer primary key default 1 check (id = 1),
  public_key  text,
  private_jwk jsonb,
  cron_secret text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
);
alter table public.push_config enable row level security;
insert into public.push_config (id) values (1) on conflict (id) do nothing;

-- 6) every minute, ask the "notify" function to send what is due
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('tracker-reminders') where exists (select 1 from cron.job where jobname = 'tracker-reminders');
select cron.schedule(
  'tracker-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://sxokmmvvsrcwherlcoxv.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', (select cron_secret from public.push_config where id = 1)),
    body    := '{"action":"tick"}'::jsonb
  );
  $$
);
