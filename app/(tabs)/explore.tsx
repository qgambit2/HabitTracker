import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ConsistencyChart } from '@/components/consistency-chart';
import { useThemeColor } from '@/hooks/use-theme-color';
import { completedDates, lastNDays, useHabits } from '@/hooks/use-habits';

const S = { half: 2, one: 4, two: 8, three: 16, four: 24 };
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function ProgressScreen() {
  const habits = useHabits();
  const insets = useSafeAreaInsets();
  const [window, setWindow] = useState<7 | 30>(7);
  const days = lastNDays(7);

  const text = useThemeColor({}, 'text');
  const background = useThemeColor({}, 'background');
  const muted = useThemeColor({ light: '#60646C', dark: '#B0B4BA' }, 'icon');
  const card = useThemeColor({ light: '#F0F0F3', dark: '#212225' }, 'background');
  const cardActive = useThemeColor({ light: '#E0E1E6', dark: '#2E3135' }, 'background');
  const tint = useThemeColor({}, 'tint');
  const empty = useThemeColor({ light: '#E0E1E6', dark: '#2E3135' }, 'background');

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + S.four, paddingBottom: insets.bottom + S.four },
      ]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">Progress</ThemedText>
          <ThemedText style={{ color: muted }}>Your consistency over time</ThemedText>
        </ThemedView>

        <ThemedView style={[styles.chartCard, { backgroundColor: card }]}>
          <ThemedView style={styles.windowRow}>
            {([7, 30] as const).map((w) => (
              <Pressable
                key={w}
                onPress={() => setWindow(w)}
                style={({ pressed }) => [
                  styles.windowChip,
                  { backgroundColor: window === w ? tint : cardActive },
                  pressed && styles.pressed,
                ]}>
                <ThemedText
                  type="defaultSemiBold"
                  style={{ color: window === w ? background : text }}>
                  {w} days
                </ThemedText>
              </Pressable>
            ))}
          </ThemedView>
          <ConsistencyChart habits={habits} days={window} />
        </ThemedView>

        <ThemedView style={[styles.legendRow, { backgroundColor: card }]}>
          <ThemedText style={styles.legendLabel}> </ThemedText>
          {days.map((iso) => {
            const weekday = WEEKDAY[new Date(`${iso}T00:00:00`).getDay()];
            return (
              <ThemedText key={iso} type="defaultSemiBold" style={styles.legendDay}>
                {weekday}
              </ThemedText>
            );
          })}
        </ThemedView>

        <ThemedView style={styles.grid}>
          {habits.map((habit) => {
            const doneSet = new Set(completedDates(habit));
            return (
              <ThemedView key={habit.id} style={[styles.gridRow, { backgroundColor: card }]}>
                <ThemedText style={styles.legendLabel}>{habit.emoji}</ThemedText>
                {days.map((iso) => (
                  <View key={iso} style={styles.cellWrap}>
                    <View
                      style={[styles.cell, { backgroundColor: doneSet.has(iso) ? text : empty }]}
                    />
                  </View>
                ))}
              </ThemedView>
            );
          })}
        </ThemedView>

        {habits.length === 0 && (
          <ThemedText style={[styles.empty, { color: muted }]}>
            No habits yet — add some on the Today tab.
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
  pressed: { opacity: 0.7 },
  chartCard: { gap: S.three, padding: S.three, borderRadius: S.three },
  windowRow: { flexDirection: 'row', gap: S.two, backgroundColor: 'transparent' },
  windowChip: { paddingHorizontal: S.three, paddingVertical: S.one, borderRadius: S.three },
  legendRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.three, paddingVertical: S.two, borderRadius: S.three },
  legendLabel: { width: 32 },
  legendDay: { flex: 1, textAlign: 'center' },
  grid: { gap: S.two, backgroundColor: 'transparent' },
  gridRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.three, paddingVertical: S.two, borderRadius: S.three },
  cellWrap: { flex: 1, alignItems: 'center' },
  cell: { width: 22, height: 22, borderRadius: 6 },
  empty: { textAlign: 'center' },
});
