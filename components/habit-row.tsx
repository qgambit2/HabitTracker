import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  completedDates,
  currentStreak,
  isDayComplete,
  todayProgress,
  type Habit,
} from '@/hooks/use-habits';

const S = { half: 2, one: 4, two: 8, three: 16, four: 24 };

type Props = {
  habit: Habit;
  today: string;
  onPress: () => void;
};

/** A single habit row on the Today screen — renders check and count kinds. */
export function HabitRow({ habit, today, onPress }: Props) {
  const muted = useThemeColor({ light: '#60646C', dark: '#B0B4BA' }, 'icon');
  const card = useThemeColor({ light: '#F0F0F3', dark: '#212225' }, 'background');
  const cardDone = useThemeColor({ light: '#E0E1E6', dark: '#2E3135' }, 'background');
  const tint = useThemeColor({}, 'tint');
  const track = useThemeColor({ light: '#D7D8DD', dark: '#3A3D42' }, 'background');

  const done = isDayComplete(habit, today);
  const streak = currentStreak(completedDates(habit));
  const progress = todayProgress(habit);
  const isCount = habit.kind === 'count';
  const ratio = Math.min(progress / habit.target, 1);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView style={[styles.row, { backgroundColor: done ? cardDone : card }]}>
        <ThemedText style={styles.emoji}>{habit.emoji}</ThemedText>
        <ThemedView style={styles.rowText}>
          <ThemedText type="defaultSemiBold">{habit.name}</ThemedText>
          {streak > 0 && (
            <ThemedText style={[styles.small, { color: muted }]}>🔥 {streak} day streak</ThemedText>
          )}
          {isCount && (
            <View style={[styles.track, { backgroundColor: track }]}>
              <View
                style={[styles.fill, { backgroundColor: tint, width: `${ratio * 100}%` }]}
              />
            </View>
          )}
        </ThemedView>
        {isCount ? (
          <ThemedText type="defaultSemiBold" style={[styles.count, { color: done ? tint : muted }]}>
            {progress}/{habit.target}
          </ThemedText>
        ) : (
          <ThemedText style={styles.check}>{done ? '✅' : '⬜️'}</ThemedText>
        )}
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.three,
    padding: S.three,
    borderRadius: S.three,
  },
  emoji: { fontSize: 28 },
  rowText: { flex: 1, gap: S.half, backgroundColor: 'transparent' },
  small: { fontSize: 14, lineHeight: 20 },
  check: { fontSize: 24 },
  count: { fontSize: 18, minWidth: 48, textAlign: 'right' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: S.half },
  fill: { height: '100%', borderRadius: 3 },
});
