-- Atomic AI usage reservation. Apply BEFORE deploying the updated AI Edge Function.
-- Calls for the same signed-in user are serialized by a transaction-scoped advisory lock.
create or replace function public.reserve_ai_usage(max_per_hour integer, max_per_day integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  now_at timestamptz;
  hour_count bigint;
  day_count bigint;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- Never allow callers to raise the server's maximum limits.
  if max_per_hour is null or max_per_day is null or
     max_per_hour < 1 or max_per_day < 1 or
     max_per_hour > 60 or max_per_day > 300 then
    raise exception 'Invalid AI usage limits' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text, 90317));
  now_at := pg_catalog.clock_timestamp();

  select count(*) into day_count
    from public.ai_usage
    where user_id = caller and at >= now_at - interval '24 hours';
  if day_count >= max_per_day then return 'day'; end if;

  select count(*) into hour_count
    from public.ai_usage
    where user_id = caller and at >= now_at - interval '1 hour';
  if hour_count >= max_per_hour then return 'hour'; end if;

  insert into public.ai_usage (user_id, at) values (caller, now_at);
  return 'ok';
end;
$$;

revoke all on function public.reserve_ai_usage(integer, integer) from public, anon;
grant execute on function public.reserve_ai_usage(integer, integer) to authenticated;
