-- How often an unanswered reminder rings again (minutes). Run once in Supabase → SQL Editor.
alter table public.user_settings add column if not exists ring_every integer not null default 2;
