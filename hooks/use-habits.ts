import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The shared habit store, exposed across screens via useSyncExternalStore.
 *
 * State is persisted to AsyncStorage (see hydrate/persist below) so habits,
 * counts, and challenge progress survive reloads. The store stays a single
 * module-level value with a Set of listeners — no provider needed.
 */

export type HabitKind = 'check' | 'count';

export type HabitReminder = {
  hour: number;
  minute: number;
  /** Identifier returned by expo-notifications, so we can cancel/reschedule. */
  notificationId?: string;
};

export type Habit = {
  id: string;
  name: string;
  emoji: string;
  kind: HabitKind;
  /** Daily target. For 'check' habits this is always 1. */
  target: number;
  /** Per-day progress: 'YYYY-MM-DD' -> count done that day. */
  log: Record<string, number>;
  reminder?: HabitReminder;
};

export type Challenge = {
  id: string;
  title: string;
  /** Habit this challenge tracks; null means any habit completion counts. */
  habitId: string | null;
  lengthDays: number;
  /** ISO start date (YYYY-MM-DD). */
  startDate: string;
  /** Distinct ISO days on which the challenge requirement was met. */
  progressDates: string[];
  status: 'active' | 'completed' | 'abandoned';
  completedAt?: string;
};

export type Settings = {
  soundEnabled: boolean;
  /** Whether the first-launch onboarding has been shown. */
  onboarded: boolean;
};

type PersistedState = {
  schemaVersion: number;
  habits: Habit[];
  challenges: Challenge[];
  settings: Settings;
};

const SCHEMA_VERSION = 2;
const STORAGE_KEY = '@habits/state';

// ---------------------------------------------------------------------------
// Date utilities (unchanged signatures so existing callers keep working).
// ---------------------------------------------------------------------------

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The last `count` days ending today, oldest first. */
export function lastNDays(count: number): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(toISODate(d));
  }
  return days;
}

/** Current consecutive-day streak ending today (or yesterday). */
export function currentStreak(completed: string[]): number {
  const set = new Set(completed);
  let streak = 0;
  const cursor = new Date();
  // Allow the streak to count even if today isn't done yet.
  if (!set.has(toISODate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (set.has(toISODate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ---------------------------------------------------------------------------
// Habit derivations — adapt the per-day log to the binary view the date utils
// and the Progress grid expect.
// ---------------------------------------------------------------------------

/** A day counts as complete once progress reaches the habit's target. */
export function isDayComplete(habit: Habit, iso: string): boolean {
  return (habit.log[iso] ?? 0) >= habit.target;
}

/** ISO days on which this habit was completed (target reached). */
export function completedDates(habit: Habit): string[] {
  return Object.keys(habit.log).filter((iso) => isDayComplete(habit, iso));
}

/** Progress toward today's target, e.g. 3 of 5. */
export function todayProgress(habit: Habit): number {
  return habit.log[toISODate(new Date())] ?? 0;
}

// ---------------------------------------------------------------------------
// Store state + listeners.
// ---------------------------------------------------------------------------

let habits: Habit[] = [
  { id: 'h1', name: 'Drink water', emoji: '💧', kind: 'count', target: 8, log: {} },
  { id: 'h2', name: 'Read 10 pages', emoji: '📖', kind: 'check', target: 1, log: {} },
  { id: 'h3', name: 'Exercise', emoji: '🏃', kind: 'check', target: 1, log: {} },
];

let challenges: Challenge[] = [];

let settings: Settings = { soundEnabled: true, onboarded: false };

let didHydrate = false;

const listeners = new Set<() => void>();

function emit() {
  // Reassign for fresh references so useSyncExternalStore re-renders.
  habits = [...habits];
  challenges = [...challenges];
  listeners.forEach((l) => l());
  if (didHydrate) schedulePersist();
}

// ---------------------------------------------------------------------------
// Persistence: hydrate once on load, debounce writes, gate writes behind
// hydration so seed data can never clobber stored data on a cold start.
// ---------------------------------------------------------------------------

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const state: PersistedState = { schemaVersion: SCHEMA_VERSION, habits, challenges, settings };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {
      // Best-effort; a failed write just means this change isn't persisted.
    });
  }, 250);
}

/** Migrate any older persisted shape forward to the current schema. */
function migrate(raw: unknown): PersistedState | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  // v1 habits used { completedDates: string[] } and no challenges/settings.
  const version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 1;

  const migratedHabits: Habit[] = Array.isArray(data.habits)
    ? (data.habits as Record<string, unknown>[]).map((h) => {
        if (Array.isArray(h.completedDates)) {
          const log: Record<string, number> = {};
          for (const iso of h.completedDates as string[]) log[iso] = 1;
          return {
            id: String(h.id),
            name: String(h.name),
            emoji: String(h.emoji ?? '✅'),
            kind: 'check',
            target: 1,
            log,
          };
        }
        return {
          id: String(h.id),
          name: String(h.name),
          emoji: String(h.emoji ?? '✅'),
          kind: (h.kind as HabitKind) ?? 'check',
          target: typeof h.target === 'number' ? h.target : 1,
          log: (h.log as Record<string, number>) ?? {},
          reminder: h.reminder as HabitReminder | undefined,
        };
      })
    : habits;

  return {
    schemaVersion: SCHEMA_VERSION,
    habits: migratedHabits,
    challenges: Array.isArray(data.challenges) ? (data.challenges as Challenge[]) : [],
    settings: {
      soundEnabled: (data.settings as Settings)?.soundEnabled ?? true,
      onboarded: (data.settings as Settings)?.onboarded ?? version > 1,
    },
  };
}

async function hydrate() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const migrated = migrate(JSON.parse(stored));
      if (migrated) {
        habits = migrated.habits;
        challenges = migrated.challenges;
        settings = migrated.settings;
      }
    }
  } catch {
    // Corrupt or missing data — fall back to the seed state.
  } finally {
    didHydrate = true;
    emit();
  }
}

hydrate();

const store = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    return habits;
  },
};

const challengeStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    return challenges;
  },
};

const settingsStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    return settings;
  },
};

// ---------------------------------------------------------------------------
// Mutations.
// ---------------------------------------------------------------------------

/**
 * Record today's progress for a habit.
 * - 'check' habits toggle between done and not done.
 * - 'count' habits increment toward the target (clamped at the target).
 * Returns whether *this tap* crossed into completion, so callers fire the
 * reward exactly once (not on every count increment).
 */
export function tickToday(id: string): { completed: boolean; finishedChallenges: Challenge[] } {
  const today = toISODate(new Date());
  let crossed = false;

  habits = habits.map((h) => {
    if (h.id !== id) return h;
    const before = h.log[today] ?? 0;
    const wasComplete = before >= h.target;

    let next: number;
    if (h.kind === 'check') {
      next = wasComplete ? 0 : 1;
    } else {
      // Tapping a finished count habit resets it; otherwise increment.
      next = wasComplete ? 0 : Math.min(before + 1, h.target);
    }

    const log = { ...h.log };
    if (next <= 0) delete log[today];
    else log[today] = next;

    crossed = !wasComplete && next >= h.target;
    return { ...h, log };
  });

  const finishedChallenges = crossed ? recordChallengeProgress(today, id) : [];
  emit();
  return { completed: crossed, finishedChallenges };
}

export function addHabit(
  name: string,
  emoji: string,
  kind: HabitKind = 'check',
  target: number = 1,
) {
  const trimmed = name.trim();
  if (!trimmed) return;
  habits = [
    ...habits,
    {
      id: `h${Date.now()}`,
      name: trimmed,
      emoji: emoji || '✅',
      kind,
      target: kind === 'count' ? Math.max(1, target) : 1,
      log: {},
    },
  ];
  emit();
}

export function removeHabit(id: string) {
  habits = habits.filter((h) => h.id !== id);
  emit();
}

export function setHabitReminder(id: string, reminder: HabitReminder | undefined) {
  habits = habits.map((h) => (h.id === id ? { ...h, reminder } : h));
  emit();
}

// ---------------------------------------------------------------------------
// Challenges.
// ---------------------------------------------------------------------------

export function startChallenge(title: string, lengthDays: number, habitId: string | null = null) {
  const challenge: Challenge = {
    id: `c${Date.now()}`,
    title,
    habitId,
    lengthDays,
    startDate: toISODate(new Date()),
    progressDates: [],
    status: 'active',
  };
  challenges = [...challenges, challenge];
  emit();
  return challenge.id;
}

export function abandonChallenge(id: string) {
  challenges = challenges.map((c) => (c.id === id ? { ...c, status: 'abandoned' as const } : c));
  emit();
}

/**
 * DEV-ONLY test helper: reset a challenge back to a fresh, active start so the
 * full arc (advance → complete → celebrate) can be re-tested without reloading.
 */
export function devResetChallenge(id: string) {
  const existing = challenges.find((c) => c.id === id);
  // Clear the mirrored completions this challenge wrote to every habit's log
  // (within the old window), so History/streaks/chart reset too.
  if (existing) {
    const start = new Date(`${existing.startDate}T00:00:00`);
    const windowDates: string[] = [];
    for (let i = 0; i < existing.lengthDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() - i);
      windowDates.push(toISODate(d));
    }
    habits = habits.map((h) => {
      const log = { ...h.log };
      for (const iso of windowDates) delete log[iso];
      return { ...h, log };
    });
  }

  challenges = challenges.map((c) =>
    c.id === id
      ? {
          ...c,
          progressDates: [],
          status: 'active' as const,
          startDate: toISODate(new Date()),
          completedAt: undefined,
        }
      : c,
  );
  emit();
}

/**
 * DEV-ONLY test helper: nudge a challenge's completed-day count by ±1 without
 * waiting real calendar days. Synthesizes distinct progress dates (the start
 * date, then preceding days) so the count is consistent, AND mirrors those
 * dates onto a real habit's log so History/streaks/the consistency chart move
 * in step with the challenge. Returns the challenge if this adjustment *just*
 * completed it, so the caller can fire the celebration.
 */
export function devAdjustChallengeDay(id: string, delta: number): { justCompleted?: Challenge } {
  let justCompleted: Challenge | undefined;
  let syncedDates: string[] = [];
  let windowDates: string[] = []; // all days in the challenge window (for cleanup)

  challenges = challenges.map((c) => {
    if (c.id !== id) return c;

    const target = Math.max(0, Math.min(c.lengthDays, c.progressDates.length + delta));
    // Build the full challenge window (start date, then preceding days).
    const start = new Date(`${c.startDate}T00:00:00`);
    const allDays: string[] = [];
    for (let i = 0; i < c.lengthDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() - i);
      allDays.push(toISODate(d));
    }
    const progressDates = allDays.slice(0, target);

    syncedDates = progressDates;
    windowDates = allDays;

    const wasComplete = c.status === 'completed';
    const reachedGoal = target >= c.lengthDays;
    const updated: Challenge = {
      ...c,
      progressDates,
      status: reachedGoal ? 'completed' : 'active',
      completedAt: reachedGoal ? c.completedAt ?? new Date().toISOString() : undefined,
    };
    if (reachedGoal && !wasComplete) justCompleted = updated;
    return updated;
  });

  // Mirror the challenge's days onto EVERY habit's log so History, streaks, and
  // the chart show a fully-consistent stretch. Within the challenge window we
  // set the wanted days complete and clear the rest; days outside the window
  // (the user's own completions) are left untouched.
  const wanted = new Set(syncedDates);
  habits = habits.map((h) => {
    const log = { ...h.log };
    for (const iso of windowDates) {
      if (wanted.has(iso)) log[iso] = h.target;
      else delete log[iso];
    }
    return { ...h, log };
  });

  emit();
  return { justCompleted };
}

/**
 * Called when a habit is completed. Advances any active challenge that the
 * completion qualifies for and flips it to 'completed' when the goal is met.
 * Returns the challenges that *just* completed so the caller can celebrate.
 */
function recordChallengeProgress(iso: string, habitId: string): Challenge[] {
  const justCompleted: Challenge[] = [];
  challenges = challenges.map((c) => {
    if (c.status !== 'active') return c;
    if (iso < c.startDate) return c;
    // A habit-scoped challenge only advances for its own habit.
    if (c.habitId !== null && c.habitId !== habitId) return c;
    if (c.progressDates.includes(iso)) return c;

    const progressDates = [...c.progressDates, iso];
    const reachedGoal = progressDates.length >= c.lengthDays;
    const updated: Challenge = reachedGoal
      ? { ...c, progressDates, status: 'completed', completedAt: new Date().toISOString() }
      : { ...c, progressDates };
    if (reachedGoal) justCompleted.push(updated);
    return updated;
  });
  return justCompleted;
}

/** Most recently completed challenge that hasn't been acknowledged yet. */
export function activeChallenge(): Challenge | undefined {
  return challenges.find((c) => c.status === 'active');
}

/**
 * DEV-ONLY: the latest active OR completed challenge, so the dev controls (incl.
 * reset) stay reachable on the banner even after a challenge is completed.
 */
export function latestTestableChallenge(): Challenge | undefined {
  return [...challenges].reverse().find((c) => c.status === 'active' || c.status === 'completed');
}

// ---------------------------------------------------------------------------
// Settings.
// ---------------------------------------------------------------------------

export function setSoundEnabled(enabled: boolean) {
  settings = { ...settings, soundEnabled: enabled };
  emit();
}

export function markOnboarded() {
  settings = { ...settings, onboarded: true };
  emit();
}

// ---------------------------------------------------------------------------
// Hooks.
// ---------------------------------------------------------------------------

export function useHabits(): Habit[] {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useChallenges(): Challenge[] {
  return useSyncExternalStore(
    challengeStore.subscribe,
    challengeStore.getSnapshot,
    challengeStore.getSnapshot,
  );
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.getSnapshot,
    settingsStore.getSnapshot,
  );
}
