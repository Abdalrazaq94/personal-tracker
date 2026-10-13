-- DEMO: "Smoking (demo)" bad habit with 30 realistic days (needs 002 + 003 migrations).
-- Improving from ~8 a day to 0–2, worse on Fri/Sat, triggers, urges resisted, £0.75 each, 10 a day before.
-- Added to the first account in the project. Running it again replaces the demo.

delete from public.habits where name = 'Smoking (demo)';

with u as (
  select id from auth.users order by created_at limit 1
),
h as (
  insert into public.habits (user_id, name, kind, target, cost, baseline, created_at)
  select id, 'Smoking (demo)', 'bad', 0, 0.75, 10, now() - interval '30 days' from u
  returning id, user_id
),
d as (
  select g,
         current_date - g as day,
         greatest(0,
           round(7.5 * g / 29.0)::int
           + case when extract(dow from current_date - g) in (5, 6) then 2 else 0 end
           + ((g * 7) % 3) - 1
         ) as cnt
  from generate_series(0, 29) as g
)
insert into public.habit_logs (user_id, habit_id, day, count, resisted, reasons)
select h.user_id,
       h.id,
       d.day,
       d.cnt,
       case when d.g < 15 then 1 + (d.g % 3) else d.g % 2 end,
       coalesce((
         select array_agg(
           case when extract(dow from d.day) in (5, 6)
             then (array['With friends', 'With friends', 'After eating', 'Stress'])[1 + ((d.g + n) % 4)]
             else (array['Stress', 'After coffee', 'Stress', 'Boredom', 'After eating', 'Tired'])[1 + ((d.g + n) % 6)]
           end)
         from generate_series(1, d.cnt) as n
       ), '{}')
from h, d;
