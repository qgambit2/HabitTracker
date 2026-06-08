-- HabitTracker — atomic coach rate-limit reservation
-- Paste into the Supabase dashboard → SQL Editor → New query → Run,
-- or apply via `supabase db push`.
--
-- The `coach` edge function previously did count-then-insert against `coach_calls`:
--   1. count rows in the rolling window
--   2. if under the cap, insert a row
-- A burst of truly concurrent requests can all pass step 1 before any step-2 insert
-- lands, overshooting the cap. This function folds both steps into ONE statement so the
-- decision is atomic: it inserts a row ONLY IF the windowed count is still under the cap,
-- and returns whether a reservation was made. No read-then-write gap to race through.
--
-- SECURITY INVOKER (the default) so RLS still applies — the function only ever sees and
-- inserts the *calling* user's rows. user_id defaults to auth.uid() on insert, matching
-- the coach_calls insert policy's WITH CHECK.

create or replace function public.reserve_coach_call(p_limit integer, p_window_ms bigint)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_since timestamptz := now() - make_interval(secs => p_window_ms / 1000.0);
  v_inserted integer;
begin
  -- Single atomic statement: insert one row for the caller, but only if the count of
  -- their rows inside the window is still below the cap. INSERT...SELECT takes the
  -- appropriate locks, so concurrent callers serialize on the count rather than racing.
  insert into public.coach_calls (user_id)
  select auth.uid()
  where (
    select count(*) from public.coach_calls
    where user_id = auth.uid() and created_at >= v_since
  ) < p_limit;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;  -- true = reserved (proceed), false = over the cap
end;
$$;
