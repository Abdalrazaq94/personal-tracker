-- Habits v2: choose days, skip days, "I resisted", triggers, money saved.
-- Run once in Supabase → SQL Editor (safe to run again).

-- which weekdays a habit is planned for (0 = Sunday … 6 = Saturday)
alter table public.habits add column if not exists days smallint[] not null default '{0,1,2,3,4,5,6}';
-- bad habits: cost each time (e.g. 0.75 per cigarette) and how many a day you used to do before
alter table public.habits add column if not exists cost numeric(10, 2) not null default 0;
alter table public.habits add column if not exists baseline int not null default 0;

-- per day: skipped (sick / travelling), urges resisted, and what triggered each slip
alter table public.habit_logs add column if not exists skipped boolean not null default false;
alter table public.habit_logs add column if not exists resisted int not null default 0;
alter table public.habit_logs add column if not exists reasons text[] not null default '{}';
