-- Pick a sound (and "ring until I answer" or "once") for each kind of reminder, and reminders for tasks.
-- Run once in Supabase → SQL Editor (safe to run again).
alter table public.user_settings add column if not exists ring_every    integer not null default 2;
alter table public.user_settings add column if not exists sounds        jsonb;

alter table public.tasks add column if not exists remind_at     timestamptz;
alter table public.tasks add column if not exists snoozed_until timestamptz;
alter table public.tasks add column if not exists notify_count  integer not null default 0;
alter table public.tasks add column if not exists last_notified timestamptz;
