-- Fair-use limits: one account can't fill the whole database (sign-ups are open).
-- The limits are far above normal use (e.g. 50,000 tasks); only abuse ever reaches them.
-- Run once in Supabase → SQL Editor (safe to run again).

create or replace function public.enforce_row_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  max_rows integer := coalesce(tg_argv[0]::integer, 20000);
  n integer;
begin
  -- the server (reminders, Wallet) is trusted; limits are for app users
  if auth.uid() is null then return new; end if;
  execute format('select count(*) from public.%I where user_id = $1', tg_table_name) into n using new.user_id;
  if n >= max_rows then
    raise exception 'Limit reached: you can keep up to % items here. Delete some old ones first.', max_rows
      using errcode = 'P0001';
  end if;
  return new;
end $$;

do $$
declare
  r record;
begin
  for r in select * from (values
    ('tasks', 50000), ('plans', 50000), ('expenses', 100000), ('words', 20000), ('notes', 20000),
    ('notebooks', 500), ('links', 20000), ('link_sections', 500), ('habits', 500), ('habit_logs', 200000),
    ('prayer_logs', 100000), ('sleep_logs', 20000), ('promises', 500), ('promise_logs', 100000),
    ('practices', 500), ('practice_logs', 200000), ('workouts', 20000), ('workout_sets', 300000),
    ('body_weights', 20000), ('push_subscriptions', 30)
  ) as t(name, max_rows)
  loop
    if to_regclass('public.' || r.name) is not null then
      execute format('drop trigger if exists row_limit on public.%I', r.name);
      execute format('create trigger row_limit before insert on public.%I for each row execute function public.enforce_row_limit(%s)', r.name, r.max_rows);
    end if;
  end loop;
end $$;

-- the Home layout saved in your account stays small
alter table public.user_settings drop constraint if exists user_settings_home_layout_size;
alter table public.user_settings add constraint user_settings_home_layout_size
  check (home_layout is null or pg_column_size(home_layout) < 20000) not valid;
