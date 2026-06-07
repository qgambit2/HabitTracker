import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { markOnboarded, startChallenge } from '@/hooks/use-habits';

const S = { one: 4, two: 8, three: 16, four: 24 };

const STARTERS = [
  { title: '3-Day Kickstart', lengthDays: 3, blurb: 'Complete any habit 3 days running.' },
  { title: '7-Day Streak', lengthDays: 7, blurb: 'A full week of showing up.' },
];

/** First-launch welcome + starter-challenge picker. */
export default function OnboardingScreen() {
  const muted = useThemeColor({ light: '#60646C', dark: '#B0B4BA' }, 'icon');
  const card = useThemeColor({ light: '#F0F0F3', dark: '#212225' }, 'background');

  function pick(title: string, lengthDays: number) {
    startChallenge(title, lengthDays, null);
    markOnboarded();
    router.dismissTo('/');
  }

  function skip() {
    markOnboarded();
    router.dismissTo('/');
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.heading}>
        Welcome 👋
      </ThemedText>
      <ThemedText style={[styles.subtitle, { color: muted }]}>
        Pick a starter challenge. Finishing it earns a celebration — and builds the habit of
        showing up.
      </ThemedText>

      <View style={styles.list}>
        {STARTERS.map((s) => (
          <Pressable
            key={s.title}
            onPress={() => pick(s.title, s.lengthDays)}
            style={({ pressed }) => [
              styles.starter,
              { backgroundColor: card },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="defaultSemiBold">🏆 {s.title}</ThemedText>
            <ThemedText style={{ color: muted }}>{s.blurb}</ThemedText>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={skip}
        style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
        <ThemedText style={{ color: muted }}>Maybe later</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: S.four, gap: S.three, justifyContent: 'center' },
  heading: { textAlign: 'center' },
  subtitle: { textAlign: 'center' },
  list: { gap: S.two, marginTop: S.two },
  starter: { gap: S.one, padding: S.three, borderRadius: S.three },
  pressed: { opacity: 0.7 },
  skip: { alignItems: 'center', paddingVertical: S.three },
});
