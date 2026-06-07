import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { isDayComplete, lastNDays, type Habit } from '@/hooks/use-habits';

const S = { half: 2, one: 4, two: 8, three: 16, four: 24 };

type Props = {
  habits: Habit[];
  days: number;
};

/**
 * A dependency-free bar chart of daily consistency: each bar is the share of
 * habits completed that day. Drives the accountability story on Progress.
 */
export function ConsistencyChart({ habits, days }: Props) {
  const tint = useThemeColor({}, 'tint');
  const track = useThemeColor({ light: '#E0E1E6', dark: '#2E3135' }, 'background');
  const muted = useThemeColor({ light: '#60646C', dark: '#B0B4BA' }, 'icon');

  const range = lastNDays(days);
  const ratios = range.map((iso) => {
    if (habits.length === 0) return 0;
    const done = habits.filter((h) => isDayComplete(h, iso)).length;
    return done / habits.length;
  });

  const overall =
    ratios.length > 0 ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) : 0;

  return (
    <ThemedView style={styles.wrap}>
      <ThemedText style={[styles.caption, { color: muted }]}>
        {overall}% average over {days} days
      </ThemedText>
      <View style={styles.bars}>
        {ratios.map((ratio, i) => (
          <View key={range[i]} style={styles.barCol}>
            <View style={[styles.barTrack, { backgroundColor: track }]}>
              <View
                style={[
                  styles.barFill,
                  { backgroundColor: tint, height: `${Math.max(ratio * 100, 2)}%` },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: S.two, backgroundColor: 'transparent' },
  caption: { fontSize: 14 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: S.half, height: 120 },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barTrack: { height: '100%', borderRadius: S.one, overflow: 'hidden', justifyContent: 'flex-end' },
  barFill: { width: '100%', borderRadius: S.one },
});
