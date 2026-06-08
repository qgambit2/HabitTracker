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
  name        text not null,
  emoji       text not null default '',
  kind        text not null default 'check' check (kind in ('check', 'count')),
  target      integer not null default 1 check (target >= 1),
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
  title          text not null,
  habit_id       uuid references public.habits (id) on delete set null,  -- null = any habit counts
  length_days    integer not null check (length_days >= 1),
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
