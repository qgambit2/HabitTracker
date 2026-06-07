import { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { isDayComplete, useHabits, type Habit } from '@/hooks/use-habits';

const S = { half: 2, one: 4, two: 8, three: 16, four: 24 };

type DayEntry = { iso: string; habits: Habit[] };

/** Group all completed-day records into a newest-first timeline. */
function buildTimeline(habits: Habit[]): DayEntry[] {
  const byDay = new Map<string, Habit[]>();
  for (const habit of habits) {
    for (const iso of Object.keys(habit.log)) {
      if (!isDayComplete(habit, iso)) continue;
      const list = byDay.get(iso) ?? [];
      list.push(habit);
      byDay.set(iso, list);
    }
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([iso, list]) => ({ iso, habits: list }));
}

function formatDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - date.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function HistoryScreen() {
  const habits = useHabits();
  const insets = useSafeAreaInsets();
  const timeline = useMemo(() => buildTimeline(habits), [habits]);

  const background = useThemeColor({}, 'background');
  const muted = useThemeColor({ light: '#60646C', dark: '#B0B4BA' }, 'icon');
  const card = useThemeColor({ light: '#F0F0F3', dark: '#212225' }, 'background');

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + S.four, paddingBottom: insets.bottom + S.four },
      ]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">History</ThemedText>
          <ThemedText style={{ color: muted }}>Everything you’ve completed</ThemedText>
        </ThemedView>

        {timeline.map((entry) => (
          <ThemedView key={entry.iso} style={styles.dayGroup}>
            <ThemedText type="defaultSemiBold" style={{ color: muted }}>
              {formatDay(entry.iso)}
            </ThemedText>
            {entry.habits.map((habit) => (
              <ThemedView
                key={`${entry.iso}-${habit.id}`}
                style={[styles.entry, { backgroundColor: card }]}>
                <ThemedText style={styles.emoji}>{habit.emoji}</ThemedText>
                <ThemedText style={styles.flex}>{habit.name}</ThemedText>
                <ThemedText>
                  {habit.kind === 'count' ? `${habit.log[entry.iso]}/${habit.target}` : '✅'}
                </ThemedText>
              </ThemedView>
            ))}
          </ThemedView>
        ))}

        {timeline.length === 0 && (
          <ThemedText style={[styles.empty, { color: muted }]}>
            Nothing logged yet — complete a habit on the Today tab.
          </ThemedText>
        )}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: S.four },
  container: { flexGrow: 1, maxWidth: 800, gap: S.four, backgroundColor: 'transparent' },
  header: { gap: S.one, backgroundColor: 'transparent' },
  dayGroup: { gap: S.two, backgroundColor: 'transparent' },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.three,
    padding: S.three,
    borderRadius: S.three,
  },
  emoji: { fontSize: 24 },
  flex: { flex: 1 },
  empty: { textAlign: 'center' },
});
