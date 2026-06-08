-- HabitTracker — coach rate-limit log + user-text length bounds
-- Paste into the Supabase dashboard → SQL Editor → New query → Run,
-- or apply via `supabase db push`.
--
-- Two security hardening changes (mirrors the additions in supabase/schema.sql):
--
-- 1. coach_calls — an append-only, per-user log of *paid* AI generations. The `coach`
--    edge function counts rows here within a rolling window and refuses to call Claude
--    once a user exceeds the cap. It is deliberately INSERT/SELECT only (NO delete
--    policy) so a user cannot erase their own rate-limit history to keep spending — the
--    weakness in throttling on the user-deletable `insights` table alone.
--
-- 2. CHECK constraints capping the length of free-text columns, so a client can't store
--    multi-megabyte habit names / titles / insight bodies (storage + abuse bound).

-- ---------------------------------------------------------------------------
-- coach_calls — append-only rate-limit log
-- ---------------------------------------------------------------------------
create table if not exists public.coach_calls (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.coach_calls enable row level security;

-- Users may record and read their own calls. There is intentionally NO update or delete
-- policy: rows are immutable and permanent, so the rate-limit count can't be tampered with.
create policy "coach_calls: select own" on public.coach_calls
  for select using ( (select auth.uid()) = user_id );
create policy "coach_calls: insert own" on public.coach_calls
  for insert with check ( (select auth.uid()) = user_id );

-- The rate-limit check filters by user_id (via RLS) and a created_at window.
create index if not exists coach_calls_user_created
  on public.coach_calls (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Length bounds on user-authored / generated free text
-- ---------------------------------------------------------------------------
alter table public.habits
  add constraint habits_name_len check (char_length(name) <= 200);

alter table public.challenges
  add constraint challenges_title_len check (char_length(title) <= 200);

alter table public.insights
  add constraint insights_content_len check (char_length(content) <= 4000);

-- ---------------------------------------------------------------------------
-- Upper bounds on user-supplied integers (the UI already clamps these, but the
-- frontend can be bypassed — a crafted client could otherwise store an arbitrarily
-- large value). Mirrors the bounds in supabase/schema.sql and hooks/use-habits.ts.
-- ---------------------------------------------------------------------------
alter table public.habits
  add constraint habits_target_max check (target <= 1000);

alter table public.challenges
  add constraint challenges_length_days_max check (length_days <= 3650);
