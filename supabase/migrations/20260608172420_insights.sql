-- HabitTracker — AI coaching insights
-- Paste into the Supabase dashboard → SQL Editor → New query → Run,
-- or apply via `supabase db push` (this file is mirrored as a migration).
--
-- Caches each Claude-generated coaching artifact so we don't re-pay the
-- Anthropic API on every app open, and so the throttle (one nudge/day, one
-- reflection/week-or-month) and a small history are possible. The `coach`
-- edge function inserts rows here; the Coach tab reads the newest per type.
--
-- type:
--   'nudge'   — short daily motivational nudge
--   'weekly'  — weekly reflection summary
--   'monthly' — monthly reflection summary

create table if not exists public.insights (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  type       text not null check (type in ('nudge', 'weekly', 'monthly')),
  content    text not null,
  created_at timestamptz not null default now()
);

-- Each user sees only their own insights (same RLS pattern as habits/challenges/settings).
-- (auto-rls.sql's event trigger also flips RLS on for new tables; we still declare it
-- explicitly to match schema.sql and to be safe if the trigger isn't installed.)
alter table public.insights enable row level security;

create policy "insights: select own" on public.insights for select using ( (select auth.uid()) = user_id );
create policy "insights: insert own" on public.insights for insert with check ( (select auth.uid()) = user_id );
create policy "insights: delete own" on public.insights for delete using ( (select auth.uid()) = user_id );

-- Newest-per-type lookups (the throttle check + the Coach tab read) hit this index.
create index if not exists insights_user_type_created
  on public.insights (user_id, type, created_at desc);
