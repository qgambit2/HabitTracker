import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const EMOJIS = ['🎉', '✨', '⭐️', '🔥', '💪'];

type Props = {
  /** Bump this value to replay the burst (e.g. a completion counter). */
  trigger: number;
};

/**
 * A lightweight celebratory overlay. When `trigger` changes it pops a large
 * emoji that scales up and fades out — the visual half of the core-loop reward.
 * Non-interactive (pointerEvents none) so it never blocks taps.
 */
export function RewardBurst({ trigger }: Props) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (trigger === 0) return;
    scale.value = 0;
    opacity.value = 0;
    scale.value = withSequence(
      withTiming(1.4, { duration: 280, easing: Easing.out(Easing.back(2)) }),
      withTiming(1.2, { duration: 120 }),
    );
    opacity.value = withSequence(
      withTiming(1, { duration: 180 }),
      withTiming(1, { duration: 320 }),
      withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) }),
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [trigger, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const emoji = EMOJIS[trigger % EMOJIS.length];

  return (
    <Animated.View pointerEvents="none" style={styles.overlay}>
      <Animated.Text style={[styles.emoji, animatedStyle]}>{emoji}</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  emoji: { fontSize: 120 },
});
