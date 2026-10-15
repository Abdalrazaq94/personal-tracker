-- Monthly budget: how much you plan to spend each month, and which warning was last sent (so each is sent once).
-- Run once in Supabase → SQL Editor (safe to run again).
alter table public.user_settings add column if not exists budget         numeric(12, 2) check (budget is null or budget > 0);
alter table public.user_settings add column if not exists budget_notify  boolean not null default true;
alter table public.user_settings add column if not exists budget_alerted text;   -- e.g. '2026-10:80' = the 80% warning for October was sent
