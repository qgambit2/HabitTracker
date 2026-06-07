import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { RewardBurst } from '@/components/reward-burst';
import { useReward } from '@/hooks/use-reward';
import { useThemeColor } from '@/hooks/use-theme-color';

/** Challenge-completion celebration. Reached via router.push with a title param. */
export default function CelebrationScreen() {
  const { challengeTitle } = useLocalSearchParams<{ challengeTitle?: string }>();
  const fireReward = useReward();
  const [burst, setBurst] = useState(0);

  const tint = useThemeColor({}, 'tint');

  useEffect(() => {
    fireReward();
    setBurst(1);
  }, [fireReward]);

  return (
    <ThemedView style={styles.container}>
      <RewardBurst trigger={burst} />
      <ThemedText type="title" style={styles.heading}>
        Challenge complete! 🎉
      </ThemedText>
      <ThemedText style={styles.subtitle}>
        You finished{challengeTitle ? ` “${challengeTitle}”` : ' your challenge'}. That’s real
        consistency — keep the momentum going.
      </ThemedText>
      <Link href="/" dismissTo style={[styles.button, { backgroundColor: tint }]}>
        <ThemedText type="defaultSemiBold" style={styles.buttonText}>
          Keep it up
        </ThemedText>
      </Link>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  heading: { textAlign: 'center' },
  subtitle: { textAlign: 'center', maxWidth: 320 },
  button: { marginTop: 8, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 16 },
  buttonText: { color: '#fff' },
});
