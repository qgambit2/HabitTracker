import type { Habit } from '@/hooks/use-habits';

/**
 * Web stub. expo-notifications local scheduling isn't supported on web in
 * Expo Go, so these no-op gracefully and report "not granted".
 */

export function registerNotificationHandler() {}

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

export async function getPermissionGranted(): Promise<boolean> {
  return false;
}

export async function scheduleHabitReminder(
  _habit: Habit,
  _hour: number,
  _minute: number,
): Promise<string | undefined> {
  return undefined;
}

export async function cancelHabitReminder(_notificationId: string | undefined) {}
