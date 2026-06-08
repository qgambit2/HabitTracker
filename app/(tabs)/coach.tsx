import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchLatestInsights,
  generateInsight,
  type Insight,
  type InsightType,
} from '@/hooks/use-insights';
import { useThemeColor } from '@/hooks/use-theme-color';

const S = { half: 2, one: 4, two: 8, three: 16, four: 24 };

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function CoachScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();

  const background = useThemeColor({}, 'background');
  const muted = useThemeColor({ light: '#60646C', dark: '#B0B4BA' }, 'icon');
  const card = useThemeColor({ light: '#F0F0F3', dark: '#212225' }, 'background');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({ light: '#C0392B', dark: '#FF6B6B' }, 'text');

  const [nudge, setNudge] = useState<Insight | null>(null);
  const [reflection, setReflection] = useState<Insight | null>(null);
  const [nudgeLoading, setNudgeLoading] = useState(false);
  const [reflectLoading, setReflectLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only auto-generate the nudge once per mount, so revisiting the tab doesn't spam invokes.
  const autoNudged = useRef(false);

  const runGenerate = useCallback(async (type: InsightType) => {
    setError(null);
    const setLoading = type === 'nudge' ? setNudgeLoading : setReflectLoading;
    setLoading(true);
    const result = await generateInsight(type);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (type === 'nudge') setNudge(result.insight);
    else setReflection(result.insight);
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      const latest = await fetchLatestInsights();
      if (cancelled) return;
      setNudge(latest.nudge);
      setReflection(latest.reflection);

      // If there's no nudge from today, ask for a fresh one (server throttles anyway).
      const fresh =
        latest.nudge && formatWhen(latest.nudge.created_at) === 'Today';
      if (!fresh && !autoNudged.current) {
        autoNudged.current = true;
        void runGenerate('nudge');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, runGenerate]);

  const content = (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Coach</ThemedText>
        <ThemedText style={{ color: muted }}>Personalized nudges and reflections</ThemedText>
      </ThemedView>

      {!session ? (
        <ThemedText style={[styles.empty, { color: muted }]}>
          Sign in to get AI coaching tailored to your habits.
        </ThemedText>
      ) : (
        <>
          {error && (
            <ThemedView style={[styles.cardBox, { backgroundColor: card }]}>
              <ThemedText style={{ color: danger }}>{error}</ThemedText>
            </ThemedView>
          )}

          {/* Today's nudge */}
          <ThemedView style={styles.section}>
            <ThemedText type="defaultSemiBold" style={{ color: muted }}>
              Today&apos;s nudge
            </ThemedText>
            <ThemedView style={[styles.cardBox, { backgroundColor: card }]}>
              {nudgeLoading && !nudge ? (
                <ActivityIndicator color={tint} />
              ) : nudge ? (
                <>
                  <ThemedText style={styles.body}>{nudge.content}</ThemedText>
                  <ThemedText style={[styles.meta, { color: muted }]}>
                    {formatWhen(nudge.created_at)}
                  </ThemedText>
                </>
              ) : (
                <ThemedText style={{ color: muted }}>
                  No nudge yet — tap refresh to get one.
                </ThemedText>
              )}
            </ThemedView>
            <Pressable
              onPress={() => runGenerate('nudge')}
              disabled={nudgeLoading}
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: tint, opacity: pressed || nudgeLoading ? 0.6 : 1 },
              ]}>
              <ThemedText style={{ color: tint }}>
                {nudgeLoading ? 'Thinking…' : 'Refresh nudge'}
              </ThemedText>
            </Pressable>
          </ThemedView>

          {/* Latest reflection */}
          <ThemedView style={styles.section}>
            <ThemedText type="defaultSemiBold" style={{ color: muted }}>
              Latest reflection
            </ThemedText>
            <ThemedView style={[styles.cardBox, { backgroundColor: card }]}>
              {reflectLoading && !reflection ? (
                <ActivityIndicator color={tint} />
              ) : reflection ? (
                <>
                  <ThemedText style={styles.body}>{reflection.content}</ThemedText>
                  <ThemedText style={[styles.meta, { color: muted }]}>
                    {reflection.type === 'monthly' ? 'Monthly' : 'Weekly'} ·{' '}
                    {formatWhen(reflection.created_at)}
                  </ThemedText>
                </>
              ) : (
                <ThemedText style={{ color: muted }}>
                  No reflection yet. Generate one once you have a few days logged.
                </ThemedText>
              )}
            </ThemedView>
            <Pressable
              onPress={() => runGenerate('weekly')}
              disabled={reflectLoading}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: tint, opacity: pressed || reflectLoading ? 0.6 : 1 },
              ]}>
              <ThemedText style={styles.primaryBtnText}>
                {reflectLoading ? 'Reflecting…' : 'Reflect on this week'}
              </ThemedText>
            </Pressable>
          </ThemedView>
        </>
      )}
    </ThemedView>
  );

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + S.four, paddingBottom: insets.bottom + S.four },
      ]}>
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: S.four },
  container: { flexGrow: 1, maxWidth: 800, gap: S.four, backgroundColor: 'transparent' },
  header: { gap: S.one, backgroundColor: 'transparent' },
  section: { gap: S.two, backgroundColor: 'transparent' },
  cardBox: { padding: S.three, borderRadius: S.three, gap: S.two, minHeight: 56, justifyContent: 'center' },
  body: { lineHeight: 22 },
  meta: { fontSize: 13 },
  primaryBtn: { paddingVertical: S.three, borderRadius: S.three, alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '600' },
  secondaryBtn: {
    paddingVertical: S.two,
    borderRadius: S.three,
    alignItems: 'center',
    borderWidth: 1,
  },
  empty: { textAlign: 'center' },
});
