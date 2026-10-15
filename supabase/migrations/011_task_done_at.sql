-- When each task was finished (for the Home chart). Filled in automatically. Run once (safe to run again).
alter table public.tasks add column if not exists done_at timestamptz;
-- tasks finished before today: we don't know the day, so use the day they were added
update public.tasks set done_at = created_at where status = 'done' and done_at is null;

create or replace function public.tasks_set_done_at() returns trigger language plpgsql as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' or new.done_at is null then
      new.done_at := coalesce(case when tg_op = 'UPDATE' and old.status = 'done' then old.done_at end, now());
    end if;
  else
    new.done_at := null;
  end if;
  return new;
end $$;

drop trigger if exists tasks_done_at on public.tasks;
create trigger tasks_done_at before insert or update on public.tasks
  for each row execute function public.tasks_set_done_at();
