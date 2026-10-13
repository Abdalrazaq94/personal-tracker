-- Extra demo data for "Smoking (demo)": a cost per cigarette, how many a day before,
-- triggers on smoking days and some "I resisted" clicks. Run AFTER 003_habits_v2.sql.
update public.habits set cost = 0.75, baseline = 8 where name = 'Smoking (demo)';

update public.habit_logs l
set reasons = (
      select coalesce(array_agg((array['Stress','After coffee','Boredom','With friends','Stress','After eating'])[1 + ((extract(day from l.day)::int + n) % 6)]), '{}')
      from generate_series(1, l.count) n
    ),
    resisted = (extract(day from l.day)::int % 3)
from public.habits h
where h.id = l.habit_id and h.name = 'Smoking (demo)';
