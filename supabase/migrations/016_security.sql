-- Security update. Run once in Supabase → SQL Editor (safe to run again).

-- 1) AI use per person, so one account can't use up the AI allowance for everyone.
--    The app can add and read its own rows, but never change or delete them.
create table if not exists public.ai_usage (
  id      bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists ai_usage_user_at on public.ai_usage (user_id, at desc);
alter table public.ai_usage enable row level security;
drop policy if exists "add own" on public.ai_usage;
drop policy if exists "read own" on public.ai_usage;
create policy "add own" on public.ai_usage for insert to authenticated with check (auth.uid() = user_id);
create policy "read own" on public.ai_usage for select to authenticated using (auth.uid() = user_id);
revoke update, delete on public.ai_usage from anon, authenticated;
-- tidy up: old rows aren't needed (runs daily if pg_cron is on; ignored otherwise)
do $$ begin
  perform cron.unschedule('ai-usage-cleanup') where exists (select 1 from cron.job where jobname = 'ai-usage-cleanup');
  perform cron.schedule('ai-usage-cleanup', '17 3 * * *', $c$delete from public.ai_usage where at < now() - interval '2 days'$c$);
exception when others then null;
end $$;

-- 2) Saved phones must be real push services (https), not any web address.
alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_https;
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_https
  check (endpoint ~ '^https://[^/:]+/') not valid;   -- "not valid" = old rows are left alone

-- 3) Uploaded adhan: audio files only, at most 15 MB.
update storage.buckets set file_size_limit = 15728640, allowed_mime_types = array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/x-m4a', 'audio/mp3', 'audio/m4a']
  where id = 'app-sounds';

-- 4) The Wallet key and the reminder button key must be long random values.
alter table public.user_settings drop constraint if exists user_settings_ingest_token_len;
alter table public.user_settings add constraint user_settings_ingest_token_len
  check (ingest_token is null or ingest_token = '' or length(ingest_token) >= 24) not valid;
alter table public.push_subscriptions drop constraint if exists push_subscriptions_secret_len;
alter table public.push_subscriptions add constraint push_subscriptions_secret_len
  check (secret is null or length(secret) >= 24) not valid;
