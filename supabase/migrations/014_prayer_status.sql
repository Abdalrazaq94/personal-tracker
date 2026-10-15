-- Prayer status: on time / late / Qada (prayed later, after its time) / didn't pray.
-- Run once in Supabase → SQL Editor (safe to run again). Old rows keep their meaning: late → 'late', otherwise 'ontime'.
alter table public.prayer_logs add column if not exists status text;
update public.prayer_logs set status = case when late then 'late' else 'ontime' end where status is null;
alter table public.prayer_logs alter column status drop default;   -- left empty, the line below works it out from "late"
alter table public.prayer_logs drop constraint if exists prayer_logs_status_check;
alter table public.prayer_logs add constraint prayer_logs_status_check check (status in ('ontime', 'late', 'qada', 'missed'));

-- Keep the old "late" flag in step with the status (so an older copy of the app still reads it right).
create or replace function public.prayer_logs_sync_status() returns trigger
language plpgsql as $$
begin
  if new.status is null then
    new.status := case when new.late then 'late' else 'ontime' end;
  elsif tg_op = 'UPDATE' and new.status = old.status and new.late is distinct from old.late then
    new.status := case when new.late then 'late' else 'ontime' end;   -- an older app only changed "late"
  end if;
  new.late := new.status <> 'ontime';
  return new;
end $$;
drop trigger if exists prayer_logs_sync_status on public.prayer_logs;
create trigger prayer_logs_sync_status before insert or update on public.prayer_logs
  for each row execute function public.prayer_logs_sync_status();
