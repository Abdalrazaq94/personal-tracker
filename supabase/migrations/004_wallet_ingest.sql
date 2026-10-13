-- Automatic spending from Google Wallet notifications.
-- Run once in Supabase → SQL Editor (safe to run again).

-- each user's private key for sending payments to the "ingest" function
alter table public.user_settings add column if not exists ingest_token text;
create unique index if not exists user_settings_ingest_token_key
  on public.user_settings (ingest_token) where ingest_token is not null and ingest_token <> '';

-- where a spend came from ('' = typed in the app, 'wallet' = Google Wallet) and a key to skip duplicates
alter table public.expenses add column if not exists source text not null default '';
alter table public.expenses add column if not exists external_id text;
create unique index if not exists expenses_external_id_key
  on public.expenses (user_id, external_id) where external_id is not null;
