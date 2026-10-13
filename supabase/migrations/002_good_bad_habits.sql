-- Good / bad habits.
-- Run once in Supabase → SQL Editor (safe to run again).
-- Good habit: target = times per day you want to do it.
-- Bad habit:  target = the most times per day you allow yourself (0 = avoid completely).

alter table public.habits add column if not exists kind text not null default 'good';

alter table public.habits drop constraint if exists habits_kind_check;
alter table public.habits add constraint habits_kind_check check (kind in ('good', 'bad'));

alter table public.habits drop constraint if exists habits_target_check;
alter table public.habits add constraint habits_target_check check (target >= 0);
