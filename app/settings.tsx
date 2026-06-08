import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { signOut, useAuth } from '@/hooks/use-auth';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  setHabitReminder,
  setSoundEnabled,
  useHabits,
  useSettings,
  type Habit,
} from '@/hooks/use-habits';
import {
  cancelHabitReminder,
  getPermissionGranted,
  scheduleHabitReminder,
} from '@/hooks/use-notifications';

const S = { one: 4, two: 8, three: 16, four: 24 };

function formatTime(hour: number, minute: number) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`;
}

export default function SettingsScreen() {
  const habits = useHabits();
  const { soundEnabled } = useSettings();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [granted, setGranted] = useState<boolean | null>(null);

  const background = useThemeColor({}, 'background');
  const muted = useThemeColor({ light: '#60646C', dark: '#B0B4BA' }, 'icon');
  const card = useThemeColor({ light: '#F0F0F3', dark: '#212225' }, 'background');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({ light: '#D14343', dark: '#FF6B6B' }, 'text');

  useEffect(() => {
    getPermissionGranted().then(setGranted);
  }, []);

  async function toggleReminder(habit: Habit) {
    if (habit.reminder) {
      await cancelHabitReminder(habit.reminder.notificationId);
      setHabitReminder(habit.id, undefined);
    } else {
      const hour = 9;
      const minute = 0;
      const id = await scheduleHabitReminder(habit, hour, minute);
      getPermissionGranted().then(setGranted);
      if (id) setHabitReminder(habit.id, { hour, minute, notificationId: id });
    }
  }

  /** Bump a habit's reminder time by an hour and reschedule. */
  async function shiftReminderHour(habit: Habit, delta: number) {
    if (!habit.reminder) return;
    const hour = (habit.reminder.hour + delta + 24) % 24;
    await cancelHabitReminder(habit.reminder.notificationId);
    const id = await scheduleHabitReminder(habit, hour, habit.reminder.minute);
    if (id) setHabitReminder(habit.id, { hour, minute: habit.reminder.minute, notificationId: id });
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + S.four }]}>
      <ThemedView style={styles.section}>
        <ThemedText type="subtitle">Reward</ThemedText>
        <View style={[styles.rowCard, { backgroundColor: card }]}>
          <ThemedText style={styles.flex}>Sound chime on completion</ThemedText>
          <Switch value={soundEnabled} onValueChange={setSoundEnabled} />
        </View>
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="subtitle">Daily reminders</ThemedText>
        {granted === false && (
          <ThemedText style={[styles.note, { color: muted }]}>
            Notifications are off. Toggle a reminder below to grant permission.
          </ThemedText>
        )}
        {habits.map((habit) => (
          <View key={habit.id} style={[styles.rowCard, { backgroundColor: card }]}>
            <ThemedText style={styles.emoji}>{habit.emoji}</ThemedText>
            <View style={styles.flex}>
              <ThemedText type="defaultSemiBold">{habit.name}</ThemedText>
              {habit.reminder && (
                <View style={styles.timeRow}>
                  <Pressable onPress={() => shiftReminderHour(habit, -1)} hitSlop={8}>
                    <ThemedText style={[styles.stepper, { color: tint }]}>−</ThemedText>
                  </Pressable>
                  <ThemedText style={{ color: muted }}>
                    {formatTime(habit.reminder.hour, habit.reminder.minute)}
                  </ThemedText>
                  <Pressable onPress={() => shiftReminderHour(habit, 1)} hitSlop={8}>
                    <ThemedText style={[styles.stepper, { color: tint }]}>＋</ThemedText>
                  </Pressable>
                </View>
              )}
            </View>
            <Switch value={!!habit.reminder} onValueChange={() => toggleReminder(habit)} />
          </View>
        ))}
        {habits.length === 0 && (
          <ThemedText style={[styles.note, { color: muted }]}>
            Add a habit first to set reminders.
          </ThemedText>
        )}
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="subtitle">Account</ThemedText>
        {session?.user?.email && (
          <ThemedText style={[styles.note, { color: muted }]}>
            Signed in as {session.user.email}
          </ThemedText>
        )}
        <Pressable
          onPress={() => signOut()}
          style={[styles.rowCard, { backgroundColor: card }]}
          accessibilityRole="button"
          accessibilityLabel="Sign out">
          <IconSymbol name="rectangle.portrait.and.arrow.right" size={20} color={danger} />
          <ThemedText style={[styles.flex, { color: danger }]} type="defaultSemiBold">
            Sign out
          </ThemedText>
        </Pressable>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: S.four, gap: S.four },
  section: { gap: S.two, backgroundColor: 'transparent' },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.three,
    padding: S.three,
    borderRadius: S.three,
  },
  flex: { flex: 1, gap: S.one, backgroundColor: 'transparent' },
  emoji: { fontSize: 24 },
  note: { fontSize: 14 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: S.three },
  stepper: { fontSize: 22, fontWeight: '600' },
});
