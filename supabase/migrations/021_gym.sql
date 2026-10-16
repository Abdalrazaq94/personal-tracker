-- Gym: your plan, every workout with its sets, and body weight. Run once in Supabase → SQL Editor (safe to run again).

-- your plan: which program, which days, reminder, and your own workouts (for "My own workouts")
create table if not exists public.gym_plans (
  user_id       uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  program       text not null default 'home' check (program in ('home', 'beginner', 'ppl', 'custom')),
  days          smallint[] not null default '{1,3,5}' check (days <@ array[0,1,2,3,4,5,6]::smallint[]),
  remind_time   text check (remind_time is null or remind_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  remind        boolean not null default false,
  routines      jsonb not null default '[]'::jsonb check (jsonb_typeof(routines) = 'array' and pg_column_size(routines) < 60000),
  last_notified date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- one row per workout you did
create table if not exists public.workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day         date not null,
  program     text not null default '',
  workout_key text not null default '',
  title       text not null default '' check (length(title) <= 80),
  started_at  timestamptz,
  finished_at timestamptz,
  note        text not null default '' check (length(note) <= 300),
  created_at  timestamptz not null default now()
);

-- every set: reps and weight (kg), or seconds for timed exercises like a plank
create table if not exists public.workout_sets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_id  uuid not null references public.workouts(id) on delete cascade,
  exercise_id text not null check (length(exercise_id) <= 80),
  set_no      smallint not null default 1 check (set_no between 1 and 50),
  reps        smallint check (reps is null or reps between 0 and 1000),
  weight      numeric(7, 2) check (weight is null or weight between 0 and 2000),
  seconds     integer check (seconds is null or seconds between 0 and 36000),
  created_at  timestamptz not null default now()
);

create table if not exists public.body_weights (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  kg         numeric(5, 2) not null check (kg between 20 and 400),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

alter table public.gym_plans enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;
alter table public.body_weights enable row level security;
drop policy if exists "own rows" on public.gym_plans;
create policy "own rows" on public.gym_plans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own rows" on public.workouts;
create policy "own rows" on public.workouts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own rows" on public.body_weights;
create policy "own rows" on public.body_weights for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- a set must belong to you AND to one of your own workouts
drop policy if exists "own rows" on public.workout_sets;
create policy "own rows" on public.workout_sets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()));
create index if not exists workouts_user_day on public.workouts (user_id, day desc);
create index if not exists workout_sets_workout on public.workout_sets (workout_id);
create index if not exists workout_sets_user_ex on public.workout_sets (user_id, exercise_id);
