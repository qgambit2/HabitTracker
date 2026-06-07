import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  devAdjustChallengeDay,
  devResetChallenge,
  toISODate,
  type Challenge,
} from '@/hooks/use-habits';

const S = { half: 2, one: 4, two: 8, three: 16, four: 24 };

type Props = {
  challenge: Challenge;
  /** Called when a dev day-adjustment completes the challenge, to celebrate. */
  onCelebrate?: (challenge: Challenge) => void;
};

/** Active-challenge progress card shown atop the Today screen. */
export function ChallengeBanner({ challenge, onCelebrate }: Props) {
  const tint = useThemeColor({}, 'tint');
  const background = useThemeColor({}, 'background');
  const track = useThemeColor({ light: 'rgba(255,255,255,0.35)', dark: 'rgba(0,0,0,0.25)' }, 'background');

  const doneDays = challenge.progressDates.length;
  const todayDone = challenge.progressDates.includes(toISODate(new Date()));
  const ratio = Math.min(doneDays / challenge.lengthDays, 1);

  function adjust(delta: number) {
    const { justCompleted } = devAdjustChallengeDay(challenge.id, delta);
    if (justCompleted) onCelebrate?.(justCompleted);
  }

  return (
    <ThemedView style={[styles.card, { backgroundColor: tint }]}>
      <View style={styles.headerRow}>
        <ThemedText type="defaultSemiBold" style={{ color: background }}>
          🏆 {challenge.title}
        </ThemedText>
        <ThemedText style={[styles.day, { color: background }]}>
          Day {Math.min(doneDays + (todayDone ? 0 : 1), challenge.lengthDays)} of{' '}
          {challenge.lengthDays}
        </ThemedText>
      </View>
      <View style={[styles.track, { backgroundColor: track }]}>
        <View style={[styles.fill, { backgroundColor: background, width: `${ratio * 100}%` }]} />
      </View>
      <ThemedText style={[styles.hint, { color: background }]}>
        {challenge.status === 'completed'
          ? '✓ Challenge complete!'
          : todayDone
            ? "Today's done — keep the streak alive!"
            : 'Complete a habit today to advance your challenge.'}
      </ThemedText>

      {__DEV__ && (
        <View style={[styles.devRow, { borderTopColor: track }]}>
          <ThemedText style={[styles.devLabel, { color: background }]}>DEV</ThemedText>
          <Pressable
            onPress={() => adjust(-1)}
            disabled={doneDays === 0}
            style={({ pressed }) => [
              styles.devBtn,
              { backgroundColor: background, opacity: doneDays === 0 ? 0.4 : pressed ? 0.7 : 1 },
            ]}>
            <ThemedText type="defaultSemiBold" style={{ color: tint }}>
              − day
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => adjust(1)}
            disabled={doneDays >= challenge.lengthDays}
            style={({ pressed }) => [
              styles.devBtn,
              {
                backgroundColor: background,
                opacity: doneDays >= challenge.lengthDays ? 0.4 : pressed ? 0.7 : 1,
              },
            ]}>
            <ThemedText type="defaultSemiBold" style={{ color: tint }}>
              + day
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => devResetChallenge(challenge.id)}
            style={({ pressed }) => [
              styles.devBtn,
              styles.devReset,
              { borderColor: background, opacity: pressed ? 0.7 : 1 },
            ]}>
            <ThemedText type="defaultSemiBold" style={{ color: background }}>
              ↻ Reset
            </ThemedText>
          </Pressable>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { gap: S.two, padding: S.three, borderRadius: S.three },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  day: { fontSize: 14, opacity: 0.9 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  hint: { fontSize: 13, opacity: 0.9 },
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.two,
    marginTop: S.one,
    paddingTop: S.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  devLabel: { fontSize: 11, fontWeight: '700', opacity: 0.7, letterSpacing: 1 },
  devBtn: { paddingHorizontal: S.three, paddingVertical: S.half, borderRadius: S.two },
  devReset: { marginLeft: 'auto', backgroundColor: 'transparent', borderWidth: 1 },
});
