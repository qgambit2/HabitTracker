-- HabitTracker — Supabase schema + Row-Level Security
-- Paste this whole file into the Supabase dashboard → SQL Editor → New query → Run.
--
-- Mirrors the TypeScript model in hooks/use-habits.ts:
--   Habit    { id, name, emoji, kind, target, log, reminder? }
--   Challenge{ id, title, habitId|null, lengthDays, startDate, progressDates, status }
--   Settings { soundEnabled, onboarded }   (one row per user)
--
-- Every table carries user_id (defaults to the caller) and is protected by RLS so a
-- user can only ever see/modify their own rows. This is HOW per-user data isolation is
-- enforced — at the database, not in app code. auth.uid() is the logged-in user's id.

-- ---------------------------------------------------------------------------
-- habits
-- ---------------------------------------------------------------------------
create table if not exists public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name        text not null check (char_length(name) <= 200),
  emoji       text not null default '',
  kind        text not null default 'check' check (kind in ('check', 'count')),
  target      integer not null default 1 check (target >= 1 and target <= 1000),
  log         jsonb not null default '{}'::jsonb,   -- Record<'YYYY-MM-DD', number>
  reminder    jsonb,                                -- { time, ..., notificationId? } | null
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- challenges
-- ---------------------------------------------------------------------------
create table if not exists public.challenges (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title          text not null check (char_length(title) <= 200),
  habit_id       uuid references public.habits (id) on delete set null,  -- null = any habit counts
  length_days    integer not null check (length_days >= 1 and length_days <= 3650),
  start_date     date not null,
  progress_dates jsonb not null default '[]'::jsonb,   -- string[] of 'YYYY-MM-DD'
  status         text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- settings (one row per user)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  user_id       uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  sound_enabled boolean not null default true,
  onboarded     boolean not null default false,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-Level Security: each user sees only their own rows.
-- ---------------------------------------------------------------------------
alter table public.habits     enable row level security;
alter table public.challenges enable row level security;
alter table public.settings   enable row level security;

-- habits policies
create policy "habits: select own"  on public.habits for select using ( (select auth.uid()) = user_id );
create policy "habits: insert own"  on public.habits for insert with check ( (select auth.uid()) = user_id );
create policy "habits: update own"  on public.habits for update using ( (select auth.uid()) = user_id ) with check ( (select auth.uid()) = user_id );
create policy "habits: delete own"  on public.habits for delete using ( (select auth.uid()) = user_id );

-- challenges policies
create policy "challenges: select own" on public.challenges for select using ( (select auth.uid()) = user_id );
create policy "challenges: insert own" on public.challenges for insert with check ( (select auth.uid()) = user_id );
create policy "challenges: update own" on public.challenges for update using ( (select auth.uid()) = user_id ) with check ( (select auth.uid()) = user_id );
create policy "challenges: delete own" on public.challenges for delete using ( (select auth.uid()) = user_id );

-- settings policies
create policy "settings: select own" on public.settings for select using ( (select auth.uid()) = user_id );
create policy "settings: insert own" on public.settings for insert with check ( (select auth.uid()) = user_id );
create policy "settings: update own" on public.settings for update using ( (select auth.uid()) = user_id ) with check ( (select auth.uid()) = user_id );

-- ---------------------------------------------------------------------------
-- keep updated_at fresh on every update
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

create trigger habits_touch     before update on public.habits     for each row execute function public.touch_updated_at();
create trigger challenges_touch before update on public.challenges for each row execute function public.touch_updated_at();
create trigger settings_touch   before update on public.settings   for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- insights — cached AI coaching artifacts (see supabase/insights.sql)
-- Written by the `coach` edge function, read by the Coach tab. Append-only;
-- no updated_at trigger (rows are immutable once generated).
-- ---------------------------------------------------------------------------
create table if not exists public.insights (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  type       text not null check (type in ('nudge', 'weekly', 'monthly')),
  content    text not null check (char_length(content) <= 4000),
  created_at timestamptz not null default now()
);

alter table public.insights enable row level security;

create policy "insights: select own" on public.insights for select using ( (select auth.uid()) = user_id );
create policy "insights: insert own" on public.insights for insert with check ( (select auth.uid()) = user_id );
create policy "insights: delete own" on public.insights for delete using ( (select auth.uid()) = user_id );

create index if not exists insights_user_type_created
  on public.insights (user_id, type, created_at desc);

-- ---------------------------------------------------------------------------
-- coach_calls — append-only per-user log of *paid* AI generations.
-- The `coach` edge function counts rows here in a rolling window and refuses to call
-- Claude once a user exceeds the cap. Intentionally INSERT/SELECT only (NO delete policy)
-- so a user cannot erase their rate-limit history — unlike `insights`, which they can
-- delete. This is the tamper-resistant backing store for abuse control.
-- ---------------------------------------------------------------------------
create table if not exists public.coach_calls (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.coach_calls enable row level security;

create policy "coach_calls: select own" on public.coach_calls for select using ( (select auth.uid()) = user_id );
create policy "coach_calls: insert own" on public.coach_calls for insert with check ( (select auth.uid()) = user_id );

create index if not exists coach_calls_user_created
  on public.coach_calls (user_id, created_at desc);

-- Atomic rate-limit reservation: insert a coach_calls row ONLY IF the caller is still
-- under the cap within the rolling window, in a single statement (no count-then-insert
-- race). Returns true if a slot was reserved. SECURITY INVOKER so RLS still scopes it to
-- the caller. See supabase/migrations/20260608190000_atomic_coach_rate_limit.sql.
create or replace function public.reserve_coach_call(p_limit integer, p_window_ms bigint)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_since timestamptz := now() - make_interval(secs => p_window_ms / 1000.0);
  v_inserted integer;
begin
  insert into public.coach_calls (user_id)
  select auth.uid()
  where (
    select count(*) from public.coach_calls
    where user_id = auth.uid() and created_at >= v_since
  ) < p_limit;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;
