import * as Notifications from 'expo-notifications';

import type { Habit } from '@/hooks/use-habits';

/**
 * Local notification helpers (the retention hook). We only use *local*
 * scheduled reminders — these work in Expo Go on SDK 54 (remote push does not).
 */

/** Call once at app startup to control how notifications present in-foreground. */
export function registerNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/** Ask the OS for permission. Returns whether it's granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return req.granted;
}

export async function getPermissionGranted(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  return settings.granted;
}

/**
 * Schedule a daily local reminder for a habit. Returns the notification id so
 * the caller can persist it on the habit and cancel/reschedule later.
 */
export async function scheduleHabitReminder(
  habit: Habit,
  hour: number,
  minute: number,
): Promise<string | undefined> {
  const granted = await requestNotificationPermission();
  if (!granted) return undefined;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: `${habit.emoji} ${habit.name}`,
      body:
        habit.kind === 'count'
          ? `Time to make progress — aim for ${habit.target} today.`
          : "Don't forget to check this off today.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelHabitReminder(notificationId: string | undefined) {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // Already gone — nothing to do.
  }
}
