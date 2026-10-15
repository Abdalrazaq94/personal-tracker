-- The app's language (English / Arabic), so reminders arrive in the same language. Run once (safe to run again).
alter table public.user_settings add column if not exists lang text not null default 'en';
