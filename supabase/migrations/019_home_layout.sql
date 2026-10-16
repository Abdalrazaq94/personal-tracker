-- "Customise Home": which features and Home cards you show, in your order (same on all your devices).
-- Run once in Supabase → SQL Editor (safe to run again).
alter table public.user_settings add column if not exists home_layout jsonb;
