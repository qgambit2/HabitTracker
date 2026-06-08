import {
  applyCloudState,
  getAllState,
  whenHydrated,
  type Challenge,
  type Habit,
  type HabitKind,
  type Settings,
} from '@/hooks/use-habits';
import { supabase } from '@/lib/supabase';

/**
 * Offline-first full-state sync (v1).
 *
 * The local store (use-habits) stays the UI's source of truth for instant reads. This
 * module mirrors it to Supabase:
 *   - pullOnLogin(): on sign-in, load the user's cloud rows. Cloud wins if it has data;
 *     otherwise seed the cloud from whatever is local.
 *   - schedulePush(): debounced full upsert of habits/challenges/settings on any change.
 *
 * Last-write-wins per device; no per-field merge (matches the agreed v1 scope).
 * Maps local camelCase <-> DB snake_case here so the rest of the app never sees columns.
 */

// ---- row <-> model mappers -------------------------------------------------

type HabitRow = {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  kind: string;
  target: number;
  log: Record<string, number>;
  reminder: Habit['reminder'] | null;
};

type ChallengeRow = {
  id: string;
  user_id: string;
  title: string;
  habit_id: string | null;
  length_days: number;
  start_date: string;
  progress_dates: string[];
  status: string;
};

function habitToRow(h: Habit, userId: string): HabitRow {
  return {
    id: h.id,
    user_id: userId,
    name: h.name,
    emoji: h.emoji,
    kind: h.kind,
    target: h.target,
    log: h.log,
    reminder: h.reminder ?? null,
  };
}

function rowToHabit(r: HabitRow): Habit {
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    kind: (r.kind as HabitKind) ?? 'check',
    target: r.target,
    log: r.log ?? {},
    reminder: r.reminder ?? undefined,
  };
}

function challengeToRow(c: Challenge, userId: string): ChallengeRow {
  return {
    id: c.id,
    user_id: userId,
    title: c.title,
    habit_id: c.habitId,
    length_days: c.lengthDays,
    start_date: c.startDate,
    progress_dates: c.progressDates,
    status: c.status,
  };
}

function rowToChallenge(r: ChallengeRow): Challenge {
  return {
    id: r.id,
    title: r.title,
    habitId: r.habit_id,
    lengthDays: r.length_days,
    startDate: r.start_date,
    progressDates: r.progress_dates ?? [],
    status: r.status as Challenge['status'],
  };
}

// ---- pull ------------------------------------------------------------------

/**
 * Load cloud data for the signed-in user into the local store. If the cloud already has
 * habits, it wins (replaces local). If the cloud is empty, seed it from current local
 * state so the user's existing habits aren't lost.
 */
export async function pullOnLogin(userId: string): Promise<void> {
  // Wait for local hydration first so pull and hydrate don't race and clobber each other.
  await whenHydrated();

  const [habitsRes, challengesRes, settingsRes] = await Promise.all([
    supabase.from('habits').select('*'),
    supabase.from('challenges').select('*'),
    supabase.from('settings').select('*').maybeSingle(),
  ]);

  if (habitsRes.error || challengesRes.error || settingsRes.error) {
    // Leave local state as-is on a failed pull; the next change will retry the push.
    return;
  }

  const cloudHabits = (habitsRes.data as HabitRow[]) ?? [];
  const cloudChallenges = (challengesRes.data as ChallengeRow[]) ?? [];
  const cloudSettings = settingsRes.data as
    | { sound_enabled: boolean; onboarded: boolean }
    | null;

  if (cloudHabits.length > 0) {
    // Cloud wins.
    applyCloudState({
      habits: cloudHabits.map(rowToHabit),
      challenges: cloudChallenges.map(rowToChallenge),
      settings: {
        soundEnabled: cloudSettings?.sound_enabled ?? true,
        onboarded: cloudSettings?.onboarded ?? true,
      },
    });
  } else {
    // Cloud empty — seed it from local.
    await pushNow(userId);
  }
}

// ---- push ------------------------------------------------------------------

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let currentUserId: string | null = null;

/** Debounced push (500ms) of the full local state to the cloud. */
export function schedulePush(): void {
  if (!currentUserId) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    if (currentUserId) void pushNow(currentUserId);
  }, 500);
}

/**
 * Immediate full sync of habits/challenges/settings for the user: upsert everything that
 * exists locally, then delete any cloud rows that no longer exist locally (so deleting a
 * habit/challenge in the app removes it from the cloud too — no resurrection on next pull).
 * Supabase query builders are thenables, so they can be awaited directly.
 */
export async function pushNow(userId: string): Promise<void> {
  const { habits, challenges, settings } = getAllState();

  // 1. Upsert current rows.
  const upserts: PromiseLike<unknown>[] = [];
  if (habits.length > 0) {
    upserts.push(supabase.from('habits').upsert(habits.map((h) => habitToRow(h, userId))));
  }
  if (challenges.length > 0) {
    upserts.push(
      supabase.from('challenges').upsert(challenges.map((c) => challengeToRow(c, userId)))
    );
  }
  upserts.push(
    supabase.from('settings').upsert({
      user_id: userId,
      sound_enabled: settings.soundEnabled,
      onboarded: settings.onboarded,
    })
  );
  await Promise.all(upserts);

  // 2. Reconcile deletions: remove cloud rows for this user that aren't in the local set.
  //    (RLS already scopes to the user; the explicit user_id filter is belt-and-suspenders.)
  await reconcileDeletes('habits', habits.map((h) => h.id), userId);
  await reconcileDeletes('challenges', challenges.map((c) => c.id), userId);
}

/** Delete rows of `table` for `userId` whose id is not in `keepIds`. */
async function reconcileDeletes(
  table: 'habits' | 'challenges',
  keepIds: string[],
  userId: string
): Promise<void> {
  if (keepIds.length === 0) {
    // Nothing kept locally — delete all of the user's rows in this table.
    await supabase.from(table).delete().eq('user_id', userId);
    return;
  }
  // Delete rows whose id is NOT in the kept set. Quote each id so the PostgREST `in`
  // list can't be broken out of even if an id ever contained a comma/paren (ids are
  // UUIDs today, but this keeps the filter safe regardless of the value).
  const quoted = keepIds.map((id) => `"${id.replace(/"/g, '')}"`).join(',');
  await supabase
    .from(table)
    .delete()
    .eq('user_id', userId)
    .not('id', 'in', `(${quoted})`);
}

/** Called by the auth wiring when the signed-in user changes (or signs out). */
export function setSyncUser(userId: string | null): void {
  currentUserId = userId;
}
