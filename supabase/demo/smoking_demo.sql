-- DEMO DATA: adds a bad habit "Smoking (demo)" with 30 days of history,
-- alternating: one day smoked (1–3 times), the next day clean (0).
-- Run in Supabase → SQL Editor. Needs 002_good_bad_habits.sql to have been run first.
-- It is added to the FIRST account in your project (yours, if you are the only user).
-- To remove it later, run supabase/demo/remove_demo.sql

with u as (
  select id from auth.users order by created_at limit 1
),
h as (
  insert into public.habits (user_id, name, kind, target, created_at)
  select id, 'Smoking (demo)', 'bad', 0, now() - interval '30 days' from u
  returning id, user_id
)
insert into public.habit_logs (user_id, habit_id, day, count)
select h.user_id,
       h.id,
       current_date - g,
       case when g % 2 = 1 then 1 + (g % 3) else 0 end   -- odd days back: smoked 1–3 times; even: clean
from h, generate_series(0, 29) as g;
