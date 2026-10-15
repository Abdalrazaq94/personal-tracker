-- Personal Tracker – database schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Every table is private: Row Level Security means each user only sees their own rows.

create extension if not exists "pgcrypto";

-- ---------- Words ----------
create table if not exists public.words (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  word        text not null,
  translation text not null default '',
  status      text not null default 'new' check (status in ('new', 'learning', 'memorized')),
  created_at  timestamptz not null default now()
);

-- ---------- Daily tasks ----------
create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null,
  priority   text not null default 'normal' check (priority in ('important', 'normal')),
  status     text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  created_at timestamptz not null default now()
);

-- ---------- Habits ----------
create table if not exists public.habits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  kind       text not null default 'good' check (kind in ('good', 'bad')),
  target     int  not null default 1 check (target >= 0),  -- good: times per day · bad: max allowed per day
  days       smallint[] not null default '{0,1,2,3,4,5,6}',  -- planned weekdays, 0 = Sunday
  cost       numeric(10, 2) not null default 0,               -- bad habits: cost each time
  baseline   int  not null default 0,                         -- bad habits: times per day before
  created_at timestamptz not null default now()
);

create table if not exists public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id   uuid not null references public.habits(id) on delete cascade,
  day        date not null,
  count      int  not null default 0 check (count >= 0),
  skipped    boolean not null default false,
  resisted   int  not null default 0,
  reasons    text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (habit_id, day)
);

-- ---------- Daily spending ----------
create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount     numeric(12, 2) not null check (amount > 0),
  note       text not null default '',
  spent_on   date not null default current_date,
  source     text not null default '',            -- 'wallet' = added from Google Wallet
  external_id text,                               -- skips duplicate notifications
  created_at timestamptz not null default now()
);

-- ---------- Plan (tomorrow / week) ----------
create table if not exists public.plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null,
  plan_date  date not null,
  plan_time  time,                               -- optional, e.g. 15:40
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Saved links (sections + links) ----------
create table if not exists public.link_sections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.links (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  section_id uuid not null references public.link_sections(id) on delete cascade,
  url        text not null,
  title      text not null default '',
  image      text not null default '',   -- preview picture URL
  site       text not null default '',   -- e.g. YouTube, TikTok
  created_at timestamptz not null default now()
);

-- ---------- Notes (notebooks + note cards) ----------
create table if not exists public.notebooks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  notebook_id uuid not null references public.notebooks(id) on delete cascade,
  title       text not null default '',
  body        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Per-user settings (Trello connection) ----------
create table if not exists public.user_settings (
  user_id         uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  trello_key      text not null default '',
  trello_token    text not null default '',
  trello_board_id text not null default '',
  ingest_token    text,                           -- private key for Google Wallet auto-add
  updated_at      timestamptz not null default now()
);

-- ---------- Commitments: prayers ----------
create table if not exists public.prayer_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  prayer     text not null check (prayer in ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha')),
  late       boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, day, prayer)
);

-- ---------- Security: each user can only touch their own rows ----------
do $$
declare t text;
begin
  foreach t in array array['words', 'tasks', 'habits', 'habit_logs', 'expenses', 'plans',
                           'link_sections', 'links', 'notebooks', 'notes', 'user_settings', 'prayer_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_idx', t);
  end loop;
end $$;

create unique index if not exists user_settings_ingest_token_key
  on public.user_settings (ingest_token) where ingest_token is not null and ingest_token <> '';
create unique index if not exists expenses_external_id_key
  on public.expenses (user_id, external_id) where external_id is not null;
