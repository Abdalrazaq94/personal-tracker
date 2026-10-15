-- App adhan: the app owner uploads one adhan recording that every user gets as their prayer sound.
-- Run once in Supabase → SQL Editor. FIRST change the email on the line marked ✏️ to the email YOU log in to Tracker with.

create table if not exists public.app_config (
  id            integer primary key default 1 check (id = 1),
  owner_email   text,
  adhan_label   text,
  adhan_version bigint
);
alter table public.app_config enable row level security;

-- ✏️ your Tracker login email:
insert into public.app_config (id, owner_email) values (1, 'you@example.com')
  on conflict (id) do update set owner_email = excluded.owner_email;

-- everyone signed in can read the adhan name/version (not the owner's email); only the owner can change it
revoke all on public.app_config from anon, authenticated;
grant select (id, adhan_label, adhan_version) on public.app_config to authenticated;
grant update (adhan_label, adhan_version) on public.app_config to authenticated;
drop policy if exists "read" on public.app_config;
create policy "read" on public.app_config for select to authenticated using (true);
drop policy if exists "owner updates" on public.app_config;
create policy "owner updates" on public.app_config for update to authenticated
  using (lower(auth.jwt() ->> 'email') = lower(owner_email))
  with check (lower(auth.jwt() ->> 'email') = lower(owner_email));

create or replace function public.is_app_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select lower(owner_email) = lower(auth.jwt() ->> 'email') from public.app_config where id = 1), false)
$$;
grant execute on function public.is_app_owner() to authenticated;

-- a public folder for the recording (anyone can play it; only the owner can upload)
insert into storage.buckets (id, name, public) values ('app-sounds', 'app-sounds', true)
  on conflict (id) do update set public = true;
drop policy if exists "owner manages app sounds" on storage.objects;
create policy "owner manages app sounds" on storage.objects for all to authenticated
  using (bucket_id = 'app-sounds' and public.is_app_owner())
  with check (bucket_id = 'app-sounds' and public.is_app_owner());
