import { useMemo, useState } from 'react';
import {
  Alert,
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { HabitRow } from '@/components/habit-row';
import { RewardBurst } from '@/components/reward-burst';
import { ChallengeBanner } from '@/components/challenge-banner';
import { useReward } from '@/hooks/use-reward';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  addHabit,
  isDayComplete,
  removeHabit,
  startChallenge,
  tickToday,
  toISODate,
  useChallenges,
  useHabits,
  useSettings,
  type HabitKind,
} from '@/hooks/use-habits';

const S = { half: 2, one: 4, two: 8, three: 16, four: 24 };

// Curated icons for the add-habit emoji picker. First entry is the default.
const EMOJI_CHOICES = [
  '✅', '🏃', '💧', '📖', '🧘', '💪', '🥗', '😴', '🦷', '🧹', '💊', '🎯', '✍️', '🎸',
];

// iOS number-pad has no return key, so we attach a "Done" accessory bar to dismiss it.
const TARGET_ACCESSORY_ID = 'targetCountAccessory';

export default function TodayScreen() {
  const habits = useHabits();
  const challenges = useChallenges(); // subscribed snapshot — drives re-renders
  const { onboarded } = useSettings();
  // In dev, keep the banner (and its reset control) visible after completion.
  // Derive from the subscribed `challenges` array (not the module-level getters)
  // so React re-renders when progress changes.
  const challenge = __DEV__
    ? [...challenges].reverse().find((c) => c.status === 'active' || c.status === 'completed')
    : challenges.find((c) => c.status === 'active');
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<HabitKind>('check');
  const [target, setTarget] = useState('3');
  const [emoji, setEmoji] = useState(EMOJI_CHOICES[0]);
  const [burst, setBurst] = useState(0);
  const [addError, setAddError] = useState<string | null>(null);
  const fireReward = useReward();
  const insets = useSafeAreaInsets();

  const text = useThemeColor({}, 'text');
  const background = useThemeColor({}, 'background');
  const muted = useThemeColor({ light: '#60646C', dark: '#B0B4BA' }, 'icon');
  const card = useThemeColor({ light: '#F0F0F3', dark: '#212225' }, 'background');
  const cardDone = useThemeColor({ light: '#E0E1E6', dark: '#2E3135' }, 'background');
  const tint = useThemeColor({}, 'tint');
  const border = useThemeColor({ light: '#C9CBD1', dark: '#44474C' }, 'icon');
  const danger = useThemeColor({ light: '#C7333A', dark: '#FF6B72' }, 'icon');

  const today = useMemo(() => toISODate(new Date()), []);
  const doneCount = habits.filter((h) => isDayComplete(h, today)).length;

  // First-launch onboarding. <Redirect> waits for the navigator to mount, so it
  // avoids the "navigate before mounting the Root Layout" error a router.push hits.
  if (!onboarded) {
    return <Redirect href="/onboarding" />;
  }

  function handleAdd() {
    if (!draft.trim()) {
      setAddError('Enter a habit name first');
      return;
    }
    const n = parseInt(target, 10);
    addHabit(draft, emoji, kind, kind === 'count' && n > 0 ? n : 1);
    setDraft('');
    setEmoji(EMOJI_CHOICES[0]);
    setAddError(null);
  }

  function handleTick(id: string) {
    const { completed, finishedChallenges } = tickToday(id);
    if (completed) {
      fireReward();
      setBurst((b) => b + 1);
    }
    if (finishedChallenges.length > 0) {
      router.push({
        pathname: '/modal',
        params: { challengeTitle: finishedChallenges[0].title },
      });
    }
  }

  /** Long-press a habit to delete it, after a confirmation. */
  function handleDelete(id: string, name: string) {
    Alert.alert('Delete habit', `Remove "${name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeHabit(id) },
    ]);
  }

  return (
    <ThemedView style={styles.root}>
      <ScrollView
        style={[styles.scroll, { backgroundColor: background }]}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + S.four, paddingBottom: insets.bottom + S.four },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <ThemedView style={styles.container}>
        <ThemedView style={styles.header}>
          <ThemedView style={styles.headerTop}>
            <ThemedText type="title">Today</ThemedText>
            <Pressable
              onPress={() => router.push('/settings')}
              hitSlop={12}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedText style={styles.gear}>⚙️</ThemedText>
            </Pressable>
          </ThemedView>
          <ThemedText style={{ color: muted }}>
            {doneCount} of {habits.length} habits done
          </ThemedText>
        </ThemedView>

        {challenge && (
          <ChallengeBanner
            challenge={challenge}
            onCelebrate={(c) => {
              fireReward();
              setBurst((b) => b + 1);
              router.push({ pathname: '/modal', params: { challengeTitle: c.title } });
            }}
          />
        )}

        {__DEV__ && !challenge && (
          <ThemedView style={[styles.devStart, { borderColor: border }]}>
            <ThemedText style={[styles.devLabel, { color: muted }]}>DEV — no challenge</ThemedText>
            <ThemedView style={styles.devStartBtns}>
              <Pressable
                onPress={() => startChallenge('3-Day Kickstart', 3, null)}
                style={({ pressed }) => [
                  styles.chip,
                  { backgroundColor: tint },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="defaultSemiBold" style={{ color: background }}>
                  Start 3-day
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => startChallenge('7-Day Streak', 7, null)}
                style={({ pressed }) => [
                  styles.chip,
                  { backgroundColor: tint },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="defaultSemiBold" style={{ color: background }}>
                  Start 7-day
                </ThemedText>
              </Pressable>
            </ThemedView>
          </ThemedView>
        )}

        <ThemedView style={styles.list}>
          {habits.map((habit) => (
            <HabitRow
              key={habit.id}
              habit={habit}
              today={today}
              onPress={() => handleTick(habit.id)}
              onLongPress={() => handleDelete(habit.id, habit.name)}
            />
          ))}
        </ThemedView>

        <ThemedView style={[styles.addWrap, { backgroundColor: card }]}>
          <ThemedView style={styles.addCard}>
            <TextInput
              value={draft}
              onChangeText={(t) => {
                setDraft(t);
                if (addError) setAddError(null);
              }}
              onSubmitEditing={handleAdd}
              placeholder="Add a habit…"
              placeholderTextColor={muted}
              returnKeyType="done"
              style={[
                styles.input,
                { color: text, backgroundColor: background, borderColor: addError ? danger : border },
              ]}
            />
            <Pressable
              onPress={handleAdd}
              style={({ pressed }) => [
                styles.addButton,
                { backgroundColor: tint },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="defaultSemiBold" style={{ color: background }}>
                Add
              </ThemedText>
            </Pressable>
          </ThemedView>
          {addError && (
            <ThemedText style={[styles.addError, { color: danger }]}>{addError}</ThemedText>
          )}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.emojiRow}>
            {EMOJI_CHOICES.map((choice) => (
              <Pressable
                key={choice}
                onPress={() => setEmoji(choice)}
                style={({ pressed }) => [
                  styles.emojiChip,
                  { backgroundColor: emoji === choice ? tint : cardDone },
                  pressed && styles.pressed,
                ]}>
                <ThemedText style={styles.emojiChoice}>{choice}</ThemedText>
              </Pressable>
            ))}
          </ScrollView>

          <ThemedView style={styles.kindRow}>
            <Pressable
              onPress={() => setKind('check')}
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: kind === 'check' ? tint : cardDone },
                pressed && styles.pressed,
              ]}>
              <ThemedText
                type="defaultSemiBold"
                style={{ color: kind === 'check' ? background : text }}>
                ✓ Once a day
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setKind('count')}
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: kind === 'count' ? tint : cardDone },
                pressed && styles.pressed,
              ]}>
              <ThemedText
                type="defaultSemiBold"
                style={{ color: kind === 'count' ? background : text }}>
                # Multiple
              </ThemedText>
            </Pressable>
            {kind === 'count' && (
              <ThemedView style={styles.targetWrap}>
                <TextInput
                  value={target}
                  onChangeText={setTarget}
                  keyboardType="number-pad"
                  maxLength={3}
                  returnKeyType="done"
                  inputAccessoryViewID={
                    Platform.OS === 'ios' ? TARGET_ACCESSORY_ID : undefined
                  }
                  style={[styles.targetInput, { color: text, backgroundColor: cardDone }]}
                />
                <ThemedText style={{ color: muted }}>/day</ThemedText>
              </ThemedView>
            )}
          </ThemedView>
        </ThemedView>
        </ThemedView>
      </ScrollView>
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={TARGET_ACCESSORY_ID}>
          <ThemedView style={[styles.accessoryBar, { backgroundColor: cardDone }]}>
            <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8}>
              <ThemedText type="defaultSemiBold" style={{ color: tint }}>
                Done
              </ThemedText>
            </Pressable>
          </ThemedView>
        </InputAccessoryView>
      )}
      <RewardBurst trigger={burst} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: S.four },
  container: { flexGrow: 1, maxWidth: 800, gap: S.four, backgroundColor: 'transparent' },
  header: { gap: S.one, backgroundColor: 'transparent' },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  gear: { fontSize: 24, lineHeight: 30 },
  list: { gap: S.two, backgroundColor: 'transparent' },
  pressed: { opacity: 0.7 },
  addWrap: { gap: S.two, padding: S.two, borderRadius: S.three },
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.two,
    backgroundColor: 'transparent',
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: S.three,
    paddingVertical: Platform.select({ ios: S.two, default: S.two }),
    borderWidth: 1,
    borderRadius: S.two,
  },
  addButton: { paddingHorizontal: S.four, paddingVertical: S.two, borderRadius: S.two },
  addError: { fontSize: 13, paddingHorizontal: S.one },
  kindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.two,
    paddingHorizontal: S.one,
    backgroundColor: 'transparent',
  },
  chip: { paddingHorizontal: S.three, paddingVertical: S.one, borderRadius: S.three },
  emojiRow: { gap: S.two, paddingVertical: S.one },
  emojiChip: {
    width: 44,
    height: 44,
    borderRadius: S.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiChoice: { fontSize: 24, lineHeight: 30 },
  accessoryBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: S.three,
    paddingVertical: S.two,
  },
  devStart: {
    gap: S.two,
    padding: S.three,
    borderRadius: S.three,
    borderWidth: 1,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  devStartBtns: { flexDirection: 'row', gap: S.two, backgroundColor: 'transparent' },
  devLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, opacity: 0.8 },
  targetWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.one,
    backgroundColor: 'transparent',
  },
  targetInput: {
    width: 44,
    fontSize: 16,
    textAlign: 'center',
    paddingVertical: S.one,
    borderRadius: S.two,
  },
});
