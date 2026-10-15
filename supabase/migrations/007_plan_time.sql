-- Plans can have a time ("buy milk tomorrow at 15:40").
-- Run once in Supabase → SQL Editor (safe to run again).
alter table public.plans add column if not exists plan_time time;
